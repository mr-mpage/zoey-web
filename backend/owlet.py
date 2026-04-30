"""Owlet Dream Sock vitals poller.

Authenticates to the Owlet/Ayla cloud via the maintained pyowletapi
community library, polls the configured device every
``owlet_poll_interval_s`` seconds, and writes each reading to the
``vitals`` table. Older raw rows are compacted into ``vitals_daily``
and pruned by the daily compaction tick (see ``vitals_compaction``).

Polling is best-effort: any exception is logged and retried with
exponential backoff up to a cap, and the rest of the app continues
without it. The poller exits early and silently if no Owlet email is
configured, so the integration is opt-in via env.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from . import repo
from .comparisons import TZ, feeding_day_for, now_local
from .config import settings

log = logging.getLogger(__name__)


def _coerce_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _coerce_int(v: Any) -> Optional[int]:
    f = _coerce_float(v)
    return int(f) if f is not None else None


def _flag(v: Any) -> bool:
    """Owlet returns 0/1 for boolean-ish flags as ints. Coerce to bool."""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v.strip() not in ("0", "", "false", "False")
    return False


async def _backfill_recent(api, dsn: str) -> int:
    """Pull whatever Ayla still retains in REAL_TIME_VITALS datapoints
    (typically the last 30–60 minutes) and insert any rows newer than
    what we already have. Idempotent — running again is safe.

    The Ayla cloud only retains a short tail of REAL_TIME_VITALS, so this
    can't go back days. Worth doing once at startup so the first hour of
    a fresh integration isn't an empty card.
    """
    url = f"{api._api_url}/dsns/{dsn}/properties/REAL_TIME_VITALS/datapoints.json"
    try:
        async with api.session.get(url, headers=api.headers, params={"limit": 100}) as r:
            if r.status != 200:
                log.warning("owlet backfill: %s status=%s", dsn, r.status)
                return 0
            data = await r.json()
    except Exception:  # noqa: BLE001
        log.exception("owlet backfill: fetch failed for %s", dsn)
        return 0

    if not data:
        return 0

    latest_iso = repo.latest_vital_recorded_at()
    latest_dt = datetime.fromisoformat(latest_iso) if latest_iso else None

    inserted = 0
    for entry in data:
        dp = entry.get("datapoint") or {}
        created_at = dp.get("created_at")
        value_str = dp.get("value")
        if not created_at or not value_str:
            continue
        # Ayla emits "2026-04-30T01:07:37Z" — parse to UTC then convert to local.
        try:
            ts_utc = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        ts_local = ts_utc.astimezone(TZ)
        if latest_dt and ts_local <= latest_dt:
            continue
        try:
            v = json.loads(value_str)
        except (TypeError, ValueError):
            continue
        repo.insert_vital(
            recorded_at=ts_local,
            heart_rate=_coerce_float(v.get("hr")),
            spo2=_coerce_float(v.get("ox")),
            spo2_avg10=_coerce_float(v.get("oxta")),
            movement=_coerce_int(v.get("mv")),
            skin_temp=_coerce_int(v.get("st")),
            sock_connection=_coerce_int(v.get("sc")),
            # REAL_TIME_VITALS doesn't surface SOCK_OFF directly; treat any
            # reading we got as the sock having been on at the time.
            sock_off=False,
            charging=_flag(v.get("chg")),
            # alerts come on a separate property; safe default.
            low_spo2_alert=False,
        )
        inserted += 1
    return inserted


async def _poll_once(sock) -> Optional[dict]:
    """Read fresh properties from a Sock. Returns the curated 'properties'
    dict, or None if the read failed or the sock isn't reporting vitals."""
    result = await sock.update_properties()
    return result.get("properties") if result else None


def _store_reading(props: dict) -> None:
    """Persist one reading. Called from the poll loop."""
    repo.insert_vital(
        recorded_at=now_local(),
        heart_rate=_coerce_float(props.get("heart_rate")),
        spo2=_coerce_float(props.get("oxygen_saturation")),
        spo2_avg10=_coerce_float(props.get("oxygen_10_av")),
        movement=_coerce_int(props.get("movement")),
        skin_temp=_coerce_int(props.get("skin_temperature")),
        sock_connection=_coerce_int(props.get("sock_connection")),
        sock_off=_flag(props.get("sock_off")),
        charging=_flag(props.get("charging")),
        low_spo2_alert=_flag(props.get("low_oxygen_alert")),
    )


async def owlet_poll_loop() -> None:
    """Outer loop. Authenticates once, then polls every configured interval.
    Re-auths if the API rejects the cached session. Exponential backoff on
    repeated failure, capped at 10 minutes between retries."""
    if not settings.zoey_owlet_email or not settings.zoey_owlet_password:
        log.info("owlet poller: no credentials configured, skipping")
        return

    # Lazy import so the dep is only required when the integration is used.
    try:
        from pyowletapi.api import OwletAPI
        from pyowletapi.sock import Sock
    except ImportError:
        log.warning("owlet poller: pyowletapi not installed, skipping")
        return

    log.info(
        "owlet poller: starting · region=%s · interval=%ds",
        settings.zoey_owlet_region, settings.owlet_poll_interval_s,
    )

    api = None
    socks: list = []
    dsns: list[str] = []
    backoff = settings.owlet_poll_interval_s
    backfilled_this_session = False

    while True:
        try:
            if api is None or not socks:
                api = OwletAPI(
                    settings.zoey_owlet_region,
                    settings.zoey_owlet_email,
                    settings.zoey_owlet_password,
                )
                await api.authenticate()
                raw = await api.get_devices()
                devs = raw.get("response", []) if isinstance(raw, dict) else (raw or [])
                socks = []
                dsns = []
                for d in devs:
                    if not isinstance(d, dict):
                        continue
                    dev = d.get("device", {})
                    socks.append(Sock(api, dev))
                    dsn = dev.get("dsn")
                    if dsn:
                        dsns.append(dsn)
                if not socks:
                    log.warning("owlet poller: no devices on account, retrying in 10 min")
                    await asyncio.sleep(600)
                    continue
                log.info("owlet poller: authenticated, %d device(s)", len(socks))
                backoff = settings.owlet_poll_interval_s

                # One-shot backfill of the cloud's recent retention window.
                # Only attempt once per process; repeated reauths after a
                # disconnect shouldn't keep re-pulling the same window.
                if not backfilled_this_session:
                    backfilled_this_session = True
                    total = 0
                    for dsn in dsns:
                        n = await _backfill_recent(api, dsn)
                        total += n
                    if total > 0:
                        log.info("owlet poller: backfilled %d historical row(s)", total)

            for sock in socks:
                props = await _poll_once(sock)
                if props is None:
                    continue
                await asyncio.to_thread(_store_reading, props)

            backoff = settings.owlet_poll_interval_s
            await asyncio.sleep(backoff)

        except asyncio.CancelledError:
            try:
                if api is not None:
                    await api.close()
            except Exception:  # noqa: BLE001
                pass
            raise
        except Exception:  # noqa: BLE001
            log.exception("owlet poller: tick failed, will re-auth on next tick")
            api = None
            socks = []
            backoff = min(backoff * 2, 600)
            await asyncio.sleep(backoff)


# ─── Compaction ──────────────────────────────────────────────────────────

def _compute_daily_aggregate(rows: list[dict]) -> dict:
    """Aggregate a list of raw vitals rows for a single feeding day.

    Filters out non-monitoring rows (sock off, charging, no heart rate).
    Sessions are contiguous monitoring stretches separated by ≥ 15 minutes
    of gap or non-monitoring rows.
    """
    from datetime import datetime

    SESSION_GAP_MINUTES = 15
    monitoring = [
        r for r in rows
        if not r["sock_off"]
        and not r["charging"]
        and r["heart_rate"] is not None
    ]

    if not monitoring:
        return {
            "hr_avg": None, "hr_min": None, "hr_max": None,
            "spo2_avg": None, "spo2_min_avg10": None,
            "monitoring_minutes": 0, "session_count": 0,
            "low_spo2_alert_count": 0, "sample_count": 0,
        }

    hrs = [r["heart_rate"] for r in monitoring if r["heart_rate"] is not None]
    spo2s = [r["spo2"] for r in monitoring if r["spo2"] is not None]
    spo2_avg10s = [r["spo2_avg10"] for r in monitoring if r["spo2_avg10"] is not None]
    alerts = sum(1 for r in monitoring if r["low_spo2_alert"])

    # Sessions: walk timestamps, split when gap ≥ threshold.
    times = [datetime.fromisoformat(r["recorded_at"]) for r in monitoring]
    sessions = 1
    monitoring_seconds = 0
    poll_interval = settings.owlet_poll_interval_s
    for prev, cur in zip(times, times[1:]):
        gap = (cur - prev).total_seconds()
        if gap > SESSION_GAP_MINUTES * 60:
            sessions += 1
        else:
            monitoring_seconds += min(gap, poll_interval * 2)
    # Each first reading of a session represents up to one poll interval of coverage.
    monitoring_seconds += sessions * poll_interval

    return {
        "hr_avg": sum(hrs) / len(hrs) if hrs else None,
        "hr_min": min(hrs) if hrs else None,
        "hr_max": max(hrs) if hrs else None,
        "spo2_avg": sum(spo2s) / len(spo2s) if spo2s else None,
        "spo2_min_avg10": min(spo2_avg10s) if spo2_avg10s else None,
        "monitoring_minutes": int(monitoring_seconds // 60),
        "session_count": sessions,
        "low_spo2_alert_count": alerts,
        "sample_count": len(monitoring),
    }


def aggregate_for_feeding_day(day_iso: str) -> dict:
    """Compute (and persist) the daily aggregate for a single feeding day."""
    from .comparisons import feeding_day_bounds
    from datetime import date

    s = repo.get_settings()
    anchor_h = int(s.get("day_start_hour", "2"))
    anchor_m = int(s.get("day_start_minute", "30"))
    d = date.fromisoformat(day_iso)
    start, end = feeding_day_bounds(d, anchor_h, anchor_m)
    rows = repo.list_vitals_between(start.isoformat(), end.isoformat())
    agg = _compute_daily_aggregate(rows)
    repo.upsert_vitals_daily(
        feeding_day=day_iso,
        hr_avg=agg["hr_avg"],
        hr_min=agg["hr_min"],
        hr_max=agg["hr_max"],
        spo2_avg=agg["spo2_avg"],
        spo2_min_avg10=agg["spo2_min_avg10"],
        monitoring_minutes=agg["monitoring_minutes"],
        session_count=agg["session_count"],
        low_spo2_alert_count=agg["low_spo2_alert_count"],
        sample_count=agg["sample_count"],
        computed_at=now_local(),
    )
    return agg


def vitals_summary_for_range(days: int) -> list[dict]:
    """Per-day aggregate dicts for the last `days` feeding days. Live-
    computes for days within the retention window; reads from
    vitals_daily for older days; returns zero rows for days with no
    record. Shared by the API router and the doctor PDF report so both
    surfaces report the same numbers.
    """
    from datetime import date as _date

    s = repo.get_settings()
    anchor_h = int(s.get("day_start_hour", "2"))
    anchor_m = int(s.get("day_start_minute", "30"))
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    earliest = today - timedelta(days=days - 1)
    retain_days = settings.vitals_raw_retain_days
    raw_threshold = today - timedelta(days=retain_days)

    stored = {
        r["feeding_day"]: r
        for r in repo.list_vitals_daily_between(earliest.isoformat(), today.isoformat())
    }

    out: list[dict] = []
    for delta in range(days):
        d = earliest + timedelta(days=delta)
        d_iso = d.isoformat()
        if d >= raw_threshold:
            agg = aggregate_for_feeding_day(d_iso)
            out.append({"feeding_day": d_iso, **agg})
        elif d_iso in stored:
            r = stored[d_iso]
            out.append({
                "feeding_day": d_iso,
                "hr_avg": r["hr_avg"],
                "hr_min": r["hr_min"],
                "hr_max": r["hr_max"],
                "spo2_avg": r["spo2_avg"],
                "spo2_min_avg10": r["spo2_min_avg10"],
                "monitoring_minutes": r["monitoring_minutes"],
                "session_count": r["session_count"],
                "low_spo2_alert_count": r["low_spo2_alert_count"],
                "sample_count": r["sample_count"],
            })
        else:
            out.append({
                "feeding_day": d_iso,
                "hr_avg": None, "hr_min": None, "hr_max": None,
                "spo2_avg": None, "spo2_min_avg10": None,
                "monitoring_minutes": 0, "session_count": 0,
                "low_spo2_alert_count": 0, "sample_count": 0,
            })
    _ = _date  # keep flake happy if someone removes the import later
    return out


async def vitals_compaction_loop() -> None:
    """Daily tick: roll up raw rows older than the retention window into
    vitals_daily and prune them. Runs once at startup (so a long downtime
    doesn't leave a backlog) and then every ~24h."""
    DAY_S = 24 * 60 * 60
    while True:
        try:
            _compaction_tick()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("vitals compaction tick failed")
        await asyncio.sleep(DAY_S)


def _compaction_tick() -> None:
    from .comparisons import feeding_day_for, feeding_day_bounds

    s = repo.get_settings()
    anchor_h = int(s.get("day_start_hour", "2"))
    anchor_m = int(s.get("day_start_minute", "30"))
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    retain_days = settings.vitals_raw_retain_days
    cutoff_day = today - timedelta(days=retain_days)
    cutoff_start, _ = feeding_day_bounds(cutoff_day, anchor_h, anchor_m)

    # Find all distinct feeding days with raw rows older than cutoff and
    # roll them up before deletion.
    raw_old = repo.list_vitals_between("0000-01-01", cutoff_start.isoformat())
    if not raw_old:
        return

    # Group by feeding day (using the same anchor as the rest of the app).
    from collections import defaultdict
    from datetime import datetime
    by_day: dict[str, list[dict]] = defaultdict(list)
    for r in raw_old:
        ts = datetime.fromisoformat(r["recorded_at"])
        d = feeding_day_for(ts, anchor_h, anchor_m).isoformat()
        by_day[d].append(r)

    for day_iso, rows in by_day.items():
        agg = _compute_daily_aggregate(rows)
        repo.upsert_vitals_daily(
            feeding_day=day_iso,
            hr_avg=agg["hr_avg"],
            hr_min=agg["hr_min"],
            hr_max=agg["hr_max"],
            spo2_avg=agg["spo2_avg"],
            spo2_min_avg10=agg["spo2_min_avg10"],
            monitoring_minutes=agg["monitoring_minutes"],
            session_count=agg["session_count"],
            low_spo2_alert_count=agg["low_spo2_alert_count"],
            sample_count=agg["sample_count"],
            computed_at=now_local(),
        )

    deleted = repo.delete_vitals_before(cutoff_start.isoformat())
    log.info("vitals compaction: rolled up %d days, pruned %d raw rows", len(by_day), deleted)

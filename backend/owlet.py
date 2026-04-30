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
import logging
from datetime import timedelta
from typing import Any, Optional

from . import repo
from .comparisons import now_local
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
    backoff = settings.owlet_poll_interval_s

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
                socks = [Sock(api, d.get("device", {})) for d in devs if isinstance(d, dict)]
                if not socks:
                    log.warning("owlet poller: no devices on account, retrying in 10 min")
                    await asyncio.sleep(600)
                    continue
                log.info("owlet poller: authenticated, %d device(s)", len(socks))
                backoff = settings.owlet_poll_interval_s

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

"""Vitals summary endpoint.

Combines live-computed aggregates for recent days (where raw rows still
exist within the retention window) with stored aggregates for older days.
The frontend renders a single rolling-N-day card from this.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, Query

from .. import repo
from ..auth import require_auth
from ..comparisons import anchor_from_settings, feeding_day_for, now_local
from ..config import settings
from ..owlet import aggregate_for_feeding_day


router = APIRouter(prefix="/api/vitals", tags=["vitals"], dependencies=[Depends(require_auth)])


@router.get("/summary")
def summary(days: int = Query(default=7, ge=1, le=90)) -> dict:
    """Per-day aggregates for the last `days` feeding days."""
    s = repo.get_settings()
    anchor_h, anchor_m = anchor_from_settings(s)
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    earliest = today - timedelta(days=days - 1)

    retain_days = settings.vitals_raw_retain_days
    raw_threshold = today - timedelta(days=retain_days)

    # Stored aggregates first (covers anything outside the retention window).
    stored = {
        r["feeding_day"]: r
        for r in repo.list_vitals_daily_between(earliest.isoformat(), today.isoformat())
    }

    # For days within the retention window, compute live (and refresh the
    # stored copy as a side effect). This means today's row updates as new
    # readings arrive without needing the daily compaction tick.
    out: list[dict] = []
    for delta in range(days):
        d = earliest + timedelta(days=delta)
        d_iso = d.isoformat()
        if d >= raw_threshold:
            agg = aggregate_for_feeding_day(d_iso)
            row = {
                "feeding_day": d_iso,
                "hr_avg": agg["hr_avg"],
                "hr_min": agg["hr_min"],
                "hr_max": agg["hr_max"],
                "spo2_avg": agg["spo2_avg"],
                "spo2_min_avg10": agg["spo2_min_avg10"],
                "monitoring_minutes": agg["monitoring_minutes"],
                "session_count": agg["session_count"],
                "low_spo2_alert_count": agg["low_spo2_alert_count"],
                "sample_count": agg["sample_count"],
            }
        elif d_iso in stored:
            row = {
                "feeding_day": d_iso,
                "hr_avg": stored[d_iso]["hr_avg"],
                "hr_min": stored[d_iso]["hr_min"],
                "hr_max": stored[d_iso]["hr_max"],
                "spo2_avg": stored[d_iso]["spo2_avg"],
                "spo2_min_avg10": stored[d_iso]["spo2_min_avg10"],
                "monitoring_minutes": stored[d_iso]["monitoring_minutes"],
                "session_count": stored[d_iso]["session_count"],
                "low_spo2_alert_count": stored[d_iso]["low_spo2_alert_count"],
                "sample_count": stored[d_iso]["sample_count"],
            }
        else:
            row = {
                "feeding_day": d_iso,
                "hr_avg": None, "hr_min": None, "hr_max": None,
                "spo2_avg": None, "spo2_min_avg10": None,
                "monitoring_minutes": 0, "session_count": 0,
                "low_spo2_alert_count": 0, "sample_count": 0,
            }
        out.append(row)

    return {"days": out, "configured": bool(settings.zoey_owlet_email)}

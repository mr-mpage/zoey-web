"""Shared computations used by both routers and the background scheduler."""

from datetime import datetime, timedelta
from typing import Optional

from . import repo
from .comparisons import (
    feeding_day_bounds,
    feeding_day_for,
    index_feeds_by_feeding_day,
    now_local,
)


def compute_next_feed() -> Optional[dict]:
    """Returns dict with expected_at, feed_index, target_ml — or None if all done / no weight set."""
    s = repo.get_settings()
    anchor_h = int(s.get("day_start_hour", "2"))
    anchor_m = int(s.get("day_start_minute", "30"))
    feeds_per_day = int(s.get("feeds_per_day", "8"))

    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    today_start, today_end = feeding_day_bounds(today, anchor_h, anchor_m)

    feed_rows = repo.list_feeds_between(today_start.isoformat(), today_end.isoformat())
    by_day = index_feeds_by_feeding_day(feed_rows, anchor_h, anchor_m)
    todays = sorted(by_day.get(today, []), key=lambda r: r["fed_at"])
    scheduled = [f for f in todays if not f.get("is_extra")]

    feeds_remaining = max(0, feeds_per_day - len(scheduled))
    if feeds_remaining == 0:
        return None

    weight = repo.latest_weight()
    if not weight:
        return None
    daily = weight["weight_grams"] / 1000 * weight["ml_per_kg_per_day"]
    feeds_total = sum(f["amount_ml"] for f in todays)  # includes extras
    catch_up = max(0.0, (daily - feeds_total) / feeds_remaining)

    interval = timedelta(hours=24 / feeds_per_day)
    if scheduled:
        last_fed_at = scheduled[-1]["fed_at"]
        if isinstance(last_fed_at, str):
            last_fed_at = datetime.fromisoformat(last_fed_at)
        expected_at = last_fed_at + interval
    else:
        expected_at = today_start

    return {
        "expected_at": expected_at,
        "feed_index": len(scheduled) + 1,
        "target_ml": round(catch_up, 1),
    }

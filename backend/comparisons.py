"""Feeding-day indexing and per-index historical aggregation.

A "feeding day" is a 24h window anchored at a configurable clock time
(default 02:30 local) — so an early-morning feed counts as feed #1 of
the day instead of belonging to the previous calendar date.
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Iterable
from zoneinfo import ZoneInfo

from .config import settings
from .models import FeedComparison

TZ = ZoneInfo(settings.tz)


def to_local(dt_str: str | datetime) -> datetime:
    if isinstance(dt_str, str):
        dt = datetime.fromisoformat(dt_str)
    else:
        dt = dt_str
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


def now_local() -> datetime:
    return datetime.now(TZ)


def feeding_day_for(dt: datetime, anchor_h: int, anchor_m: int) -> date:
    """Return the date label of the feeding day a timestamp belongs to.

    A feed at 02:00 with anchor 02:30 belongs to the *previous* calendar day's feeding day.
    A feed at 02:30 or later belongs to today's feeding day.
    """
    local = to_local(dt)
    anchor = time(hour=anchor_h, minute=anchor_m)
    if local.timetz().replace(tzinfo=None) >= anchor:
        return local.date()
    return local.date() - timedelta(days=1)


def feeding_day_bounds(day: date, anchor_h: int, anchor_m: int) -> tuple[datetime, datetime]:
    """Return [start, end) datetime range covering a feeding day."""
    start = datetime.combine(day, time(hour=anchor_h, minute=anchor_m), tzinfo=TZ)
    end = start + timedelta(days=1)
    return start, end


def index_feeds_by_feeding_day(
    rows: Iterable[dict], anchor_h: int, anchor_m: int
) -> dict[date, list[dict]]:
    """Group rows by feeding day, sort chronologically, attach 1-based feed_index."""
    by_day: dict[date, list[dict]] = defaultdict(list)
    for r in rows:
        fed_at = r["fed_at"] if isinstance(r["fed_at"], datetime) else datetime.fromisoformat(r["fed_at"])
        d = feeding_day_for(fed_at, anchor_h, anchor_m)
        by_day[d].append(r)
    for items in by_day.values():
        items.sort(key=lambda r: r["fed_at"])
        for i, item in enumerate(items, start=1):
            item["feed_index"] = i
    return by_day


def historical_comparison(
    by_day: dict[date, list[dict]],
    today: date,
    feed_index: int,
    days_back: int = 7,
) -> FeedComparison:
    samples: list[float] = []
    for delta in range(1, days_back + 1):
        d = today - timedelta(days=delta)
        feeds = by_day.get(d, [])
        match = next((f for f in feeds if f["feed_index"] == feed_index), None)
        if match is not None:
            samples.append(float(match["amount_ml"]))
    if not samples:
        return FeedComparison(feed_index=feed_index, avg_ml=None, min_ml=None, max_ml=None, sample_days=0)
    return FeedComparison(
        feed_index=feed_index,
        avg_ml=sum(samples) / len(samples),
        min_ml=min(samples),
        max_ml=max(samples),
        sample_days=len(samples),
    )


def status_for(amount_ml: float, comparison: FeedComparison, threshold_pct: float) -> str:
    if comparison.avg_ml is None:
        return "normal"
    delta_pct = (amount_ml - comparison.avg_ml) / comparison.avg_ml * 100
    if delta_pct < -threshold_pct:
        return "below"
    if delta_pct > threshold_pct:
        return "above"
    return "normal"

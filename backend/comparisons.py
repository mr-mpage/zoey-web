"""Feed-of-day indexing and per-index historical aggregation."""

from collections import defaultdict
from datetime import date, datetime, timedelta
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


def local_date(dt: datetime) -> date:
    return to_local(dt).date()


def now_local() -> datetime:
    return datetime.now(TZ)


def index_feeds_by_day(rows: Iterable[dict]) -> dict[date, list[dict]]:
    """Group rows by local date, sorted chronologically. Add 'feed_index' (1-based)."""
    by_day: dict[date, list[dict]] = defaultdict(list)
    for r in rows:
        d = local_date(r["fed_at"] if isinstance(r["fed_at"], datetime) else datetime.fromisoformat(r["fed_at"]))
        by_day[d].append(r)
    for day, items in by_day.items():
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
    """For previous `days_back` days, look up the feed at `feed_index` and aggregate."""
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

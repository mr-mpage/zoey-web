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
from .db import DEFAULTS
from .models import FeedComparison

TZ = ZoneInfo(settings.tz)


def anchor_from_settings(s: dict[str, str]) -> tuple[int, int]:
    """Read the (hour, minute) feeding-day anchor from a settings dict.

    Single source of truth for the fallback values, which previously sat
    as bare string literals at every call site."""
    return (
        int(s.get("day_start_hour", DEFAULTS["day_start_hour"])),
        int(s.get("day_start_minute", DEFAULTS["day_start_minute"])),
    )


def read_anchor() -> tuple[int, int]:
    """Convenience wrapper that pulls settings from the repo and parses
    the anchor in one call. Use when you don't already have a settings
    dict in hand."""
    from . import repo  # local import to avoid a cycle at module load
    return anchor_from_settings(repo.get_settings())


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
    if local.time() >= time(hour=anchor_h, minute=anchor_m):
        return local.date()
    return local.date() - timedelta(days=1)


# Tolerance for "future" timestamps: clients may post slightly ahead of the
# server clock, so allow a small skew before rejecting fed_at/pumped_at/etc.
FUTURE_TOLERANCE = timedelta(minutes=10)


def normalize_event_time(dt: datetime | None, *, field_name: str) -> datetime | None:
    """Anchor a naive datetime to local TZ and reject far-future values.

    Shared by feeds/pumps/diapers/meds routers — the rule is the same:
    accept up to 10 min ahead of now (clock skew), reject anything beyond.
    Raises HTTPException(422) on rejection. Returns None passthrough when
    given None so optional fields stay optional."""
    from fastapi import HTTPException

    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    if dt > now_local() + FUTURE_TOLERANCE:
        raise HTTPException(status_code=422, detail=f"{field_name} cannot be in the future")
    return dt


def feeding_day_bounds(day: date, anchor_h: int, anchor_m: int) -> tuple[datetime, datetime]:
    """Return [start, end) datetime range covering a feeding day."""
    start = datetime.combine(day, time(hour=anchor_h, minute=anchor_m), tzinfo=TZ)
    end = start + timedelta(days=1)
    return start, end


def feeding_day_for_row(row: dict, anchor_h: int, anchor_m: int) -> date:
    """Resolve a feed row's feeding-day membership, honouring an explicit
    override if set. Used so a feed at e.g. 02:20 can be tagged 'first feed
    of today' even though its timestamp is just before the 02:30 anchor."""
    override = row.get("feeding_day_override")
    if override:
        try:
            return date.fromisoformat(override)
        except ValueError:
            pass  # bad value, fall through to derived
    fed_at = row["fed_at"] if isinstance(row["fed_at"], datetime) else datetime.fromisoformat(row["fed_at"])
    return feeding_day_for(fed_at, anchor_h, anchor_m)


def index_feeds_by_feeding_day(
    rows: Iterable[dict], anchor_h: int, anchor_m: int
) -> dict[date, list[dict]]:
    """Group rows by feeding day, sort chronologically, attach 1-based feed_index.

    Extra (off-schedule) feeds keep their place in chronological order but get
    feed_index = None so they don't shift the indexing of scheduled feeds and
    don't participate in feed-of-day historical comparisons.
    """
    by_day: dict[date, list[dict]] = defaultdict(list)
    for r in rows:
        d = feeding_day_for_row(r, anchor_h, anchor_m)
        by_day[d].append(r)
    for items in by_day.values():
        items.sort(key=lambda r: r["fed_at"])
        scheduled_idx = 0
        for item in items:
            if item.get("is_extra"):
                item["feed_index"] = None
            else:
                scheduled_idx += 1
                item["feed_index"] = scheduled_idx
    return by_day


def historical_comparison(
    by_day: dict[date, list[dict]],
    today: date,
    feed_index: int,
    days_back: int = 7,
) -> FeedComparison:
    """Pulls the same feed-of-day index from the previous days_back days.
    Only counts bottle feeds — breast feeds have estimated ml and would
    pollute the historical average."""
    samples: list[float] = []
    for delta in range(1, days_back + 1):
        d = today - timedelta(days=delta)
        feeds = by_day.get(d, [])
        match = next(
            (f for f in feeds if f["feed_index"] == feed_index and (f.get("method") or "bottle") == "bottle"),
            None,
        )
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


PACE_TIERS = (
    "well_behind",
    "behind",
    "slightly_behind",
    "on_track",
    "slightly_ahead",
    "ahead",
    "well_ahead",
)


def pace_tier(gap_ml: float, expected_so_far: float) -> str:
    """Classify today's running gap-vs-expected into a 7-tier pace label.

    Boundaries (mirrored above/below):
        |gap| / expected ≤ 5%     → on_track
        5–10%                     → slightly_{behind,ahead}
        10–20%                    → {behind,ahead}
        > 20%                     → well_{behind,ahead}

    `expected_so_far` ≤ 0 (no scheduled feeds yet today) is treated as on_track.
    """
    if expected_so_far <= 0:
        return "on_track"
    pct = abs(gap_ml) / expected_so_far
    if pct <= 0.05:
        return "on_track"
    if gap_ml < 0:
        if pct >= 0.20:
            return "well_behind"
        return "behind" if pct >= 0.10 else "slightly_behind"
    if pct >= 0.20:
        return "well_ahead"
    return "ahead" if pct >= 0.10 else "slightly_ahead"


def status_for(amount_ml: float, comparison: FeedComparison, threshold_pct: float) -> str:
    if comparison.avg_ml is None:
        return "normal"
    delta_pct = (amount_ml - comparison.avg_ml) / comparison.avg_ml * 100
    if delta_pct < -threshold_pct:
        return "below"
    if delta_pct > threshold_pct:
        return "above"
    return "normal"

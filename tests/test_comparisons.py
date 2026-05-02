"""Feeding-day boundary tests. The 02:30 anchor is the trickiest piece
of state in the app — a feed at 02:20 belongs to *yesterday's* feeding
day, a feed at 02:30 belongs to today's. Most surfaces depend on this
being correct."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from backend.comparisons import (
    TZ,
    feeding_day_bounds,
    feeding_day_for,
    normalize_event_time,
    now_local,
)


def _at(year, month, day, hour, minute):
    return datetime(year, month, day, hour, minute, tzinfo=TZ)


def test_feeding_day_after_anchor_belongs_to_today():
    dt = _at(2026, 5, 2, 2, 30)  # exactly anchor
    assert feeding_day_for(dt, 2, 30).isoformat() == "2026-05-02"


def test_feeding_day_before_anchor_belongs_to_yesterday():
    dt = _at(2026, 5, 2, 2, 29)
    assert feeding_day_for(dt, 2, 30).isoformat() == "2026-05-01"


def test_feeding_day_late_evening_is_same_calendar_day():
    dt = _at(2026, 5, 2, 23, 50)
    assert feeding_day_for(dt, 2, 30).isoformat() == "2026-05-02"


def test_feeding_day_early_morning_before_anchor_rolls_back():
    dt = _at(2026, 5, 3, 1, 15)
    assert feeding_day_for(dt, 2, 30).isoformat() == "2026-05-02"


def test_feeding_day_normalises_naive_datetime_to_local():
    naive = datetime(2026, 5, 2, 9, 0)  # no tz
    assert feeding_day_for(naive, 2, 30).isoformat() == "2026-05-02"


def test_feeding_day_handles_string_input():
    assert feeding_day_for("2026-05-02T09:00:00+02:00", 2, 30).isoformat() == "2026-05-02"


def test_feeding_day_dst_transition_does_not_misbucket():
    """Vienna spring DST jump: clocks skip 02:00→03:00 on the last Sun in March.
    With anchor 02:30, an event timestamped before the jump (01:59 UTC+1) should
    belong to the prior day, after (03:00 UTC+2) to the new day."""
    vienna = ZoneInfo("Europe/Vienna")
    before = datetime(2026, 3, 29, 1, 59, tzinfo=vienna)
    after = datetime(2026, 3, 29, 3, 0, tzinfo=vienna)
    assert feeding_day_for(before, 2, 30).isoformat() == "2026-03-28"
    assert feeding_day_for(after, 2, 30).isoformat() == "2026-03-29"


# ─── feeding_day_bounds ─────────────────────────────────────────────────

def test_feeding_day_bounds_is_24_hours():
    from datetime import date
    start, end = feeding_day_bounds(date(2026, 5, 2), 2, 30)
    assert (end - start) == timedelta(days=1)
    assert start.hour == 2 and start.minute == 30


# ─── normalize_event_time ───────────────────────────────────────────────

def test_normalize_event_time_passthrough_for_none():
    assert normalize_event_time(None, field_name="fed_at") is None


def test_normalize_event_time_anchors_naive_to_tz():
    naive = datetime(2026, 5, 2, 9, 0)  # no tz
    out = normalize_event_time(naive, field_name="fed_at")
    assert out is not None
    assert out.tzinfo is not None


def test_normalize_event_time_rejects_far_future():
    far = now_local() + timedelta(hours=2)  # well past the 10-min tolerance
    with pytest.raises(HTTPException) as exc:
        normalize_event_time(far, field_name="fed_at")
    assert exc.value.status_code == 422
    assert "fed_at" in exc.value.detail


def test_normalize_event_time_accepts_small_clock_skew():
    """Up to FUTURE_TOLERANCE (10 min) ahead is permitted to absorb client
    clock skew — otherwise mobile users with slightly fast clocks would
    randomly fail to log feeds."""
    near_future = now_local() + timedelta(minutes=5)
    assert normalize_event_time(near_future, field_name="fed_at") is not None

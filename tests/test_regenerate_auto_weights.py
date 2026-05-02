"""Auto-fill regenerator: the central correctness property is that every
day from the first manual weigh-in through today's feeding day has
exactly one entry, manual entries are never overwritten, and any change
to the manual set fully rebuilds the auto fill.

Uses a real SQLite via the db_path fixture rather than mocking the repo —
the repo layer is small and the integration is what matters."""

from datetime import datetime, timedelta

from backend import repo
from backend.comparisons import TZ, feeding_day_for, now_local
from backend.services import regenerate_auto_weights


def _today_local():
    return feeding_day_for(now_local(), 2, 30)


def _at_day(days_ago: int, hour: int = 9) -> datetime:
    target = _today_local() - timedelta(days=days_ago)
    return datetime(target.year, target.month, target.day, hour, 0, tzinfo=TZ)


def _all(db_path):
    return sorted(repo.list_weights(), key=lambda r: r["recorded_at"])


def test_regenerate_with_no_manuals_is_noop(db_path):
    regenerate_auto_weights()
    assert repo.list_weights() == []


def test_regenerate_with_single_manual_does_not_extrapolate_forward_with_unknown_rate(db_path):
    """A lone manual entry can't establish a rate — the regenerator should
    still fill forward, but at zero gain (flat) since extrapolating from
    one point would be guessing."""
    repo.insert_weight(_at_day(3), 2400, 160, "manual")
    regenerate_auto_weights()
    rows = _all(db_path)
    assert len(rows) >= 4  # 1 manual + 3 forward fills
    manual = [r for r in rows if not r["is_auto"]]
    autos = [r for r in rows if r["is_auto"]]
    assert len(manual) == 1
    # All autos should have the same weight as the manual (flat extrapolation).
    assert all(r["weight_grams"] == 2400 for r in autos)


def test_regenerate_interpolates_between_manuals(db_path):
    repo.insert_weight(_at_day(6), 2200, 160, "earlier")
    repo.insert_weight(_at_day(0), 2440, 160, "today")
    regenerate_auto_weights()
    rows = _all(db_path)
    assert len(rows) == 7  # 2 manual + 5 interpolated days
    autos = [r for r in rows if r["is_auto"]]
    assert len(autos) == 5
    # Linear interp: (2440-2200)/6 = 40g/day. Day 1 from 2200 → 2240, etc.
    weights = [r["weight_grams"] for r in rows]
    # Every step should be ~40g
    diffs = [b - a for a, b in zip(weights, weights[1:])]
    assert all(abs(d - 40) <= 1 for d in diffs)


def test_regenerate_preserves_manuals_unchanged(db_path):
    """Adding new entries via regenerate must not touch existing manual rows."""
    repo.insert_weight(_at_day(5), 2300, 160, "weighed")
    regenerate_auto_weights()
    manuals_after_first = [r for r in repo.list_weights() if not r["is_auto"]]
    regenerate_auto_weights()  # second pass should be idempotent
    manuals_after_second = [r for r in repo.list_weights() if not r["is_auto"]]
    assert manuals_after_first == manuals_after_second


def test_adding_manual_today_replaces_today_auto(db_path):
    """Logging today's real weight must wipe today's auto and re-anchor."""
    repo.insert_weight(_at_day(5), 2300, 160, "earlier manual")
    regenerate_auto_weights()
    # Today should now have an auto.
    today_iso = _today_local().isoformat()
    today_rows_before = [r for r in repo.list_weights() if r["recorded_at"][:10] == today_iso]
    assert len(today_rows_before) == 1
    assert today_rows_before[0]["is_auto"] == 1

    # Now log today's actual weight.
    repo.insert_weight(_at_day(0, hour=10), 2480, 160, "today manual")
    regenerate_auto_weights()

    today_rows_after = [r for r in repo.list_weights() if r["recorded_at"][:10] == today_iso]
    # Should be just the manual — auto on the same day got wiped.
    assert len(today_rows_after) == 1
    assert today_rows_after[0]["is_auto"] == 0
    assert today_rows_after[0]["weight_grams"] == 2480


def test_deleting_a_middle_manual_reinterpolates_outer_segment(db_path):
    """A B C → delete B → A and C now anchor a single longer segment;
    auto rows in that range should re-derive from the new endpoints."""
    repo.insert_weight(_at_day(10), 2200, 160, "A")
    middle_id = repo.insert_weight(_at_day(7), 2280, 160, "B")
    repo.insert_weight(_at_day(4), 2370, 160, "C")
    regenerate_auto_weights()
    # Confirm B was an interpolation anchor before deletion: the day-9 auto
    # should be roughly halfway between A (2200) and B (2280).
    b_segment_auto = next(r for r in _all(db_path) if r["recorded_at"][:10] == (_today_local() - timedelta(days=9)).isoformat())
    assert 2220 < b_segment_auto["weight_grams"] < 2260

    # Delete B and regenerate.
    repo.delete_weight(middle_id)
    regenerate_auto_weights()

    # Day 9 should now interpolate between A (2200, day 10) and C (2370, day 4)
    # ≈ 2228 (one day past A on a 6-day stretch).
    new_day9 = next(r for r in _all(db_path) if r["recorded_at"][:10] == (_today_local() - timedelta(days=9)).isoformat())
    assert 2220 < new_day9["weight_grams"] < 2240
    # And no manual remains for day 7.
    day7 = [r for r in _all(db_path) if r["recorded_at"][:10] == (_today_local() - timedelta(days=7)).isoformat()]
    assert len(day7) == 1
    assert day7[0]["is_auto"] == 1


def test_regenerate_uses_only_manual_entries_for_rate(db_path):
    """If the rate calc fed itself auto entries it would compound errors;
    the rolling-rate window must be derived from manuals only."""
    repo.insert_weight(_at_day(10), 2200, 160, "A")
    repo.insert_weight(_at_day(4), 2380, 160, "B")  # +180g over 6 days = 30g/day rate
    regenerate_auto_weights()
    rows = _all(db_path)
    # Forward-fill from B to today (4 days) at 30g/day → today should be 2380 + 4*30 = 2500 (±1 for rounding)
    today_iso = _today_local().isoformat()
    today_row = next(r for r in rows if r["recorded_at"][:10] == today_iso)
    assert today_row["is_auto"] == 1
    assert 2495 <= today_row["weight_grams"] <= 2505

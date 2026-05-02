"""Pure-function tests for backend.growth — the centralised weight/PMA
helpers consumed by services.py, routers/report.py, and the auto-fill
regenerator. Drift here would scramble four user-facing surfaces."""

from datetime import date

from backend.growth import (
    daily_gains,
    expected_gain_range,
    pma_and_postnatal_age,
    rolling_gain_g_per_kg_per_day,
    weight_for_day,
)


# ─── weight_for_day ──────────────────────────────────────────────────────

def _w(id_: int, recorded_at: str, grams: int, ml_per_kg: int = 160):
    return {"id": id_, "recorded_at": recorded_at, "weight_grams": grams, "ml_per_kg_per_day": ml_per_kg, "is_auto": 0}


def test_weight_for_day_prefers_same_date():
    weights = [
        _w(1, "2026-04-25T09:00:00+02:00", 2280),
        _w(2, "2026-04-26T09:00:00+02:00", 2305),  # this one
        _w(3, "2026-04-27T09:00:00+02:00", 2330),
    ]
    assert weight_for_day("2026-04-26", weights)["id"] == 2


def test_weight_for_day_falls_back_to_most_recent_earlier():
    weights = [
        _w(1, "2026-04-25T09:00:00+02:00", 2280),  # earlier
        _w(2, "2026-04-23T09:00:00+02:00", 2240),
    ]
    # Looking up 04-27 — no same-day, so should prefer 04-25 (most recent earlier).
    assert weight_for_day("2026-04-27", weights)["id"] == 1


def test_weight_for_day_falls_back_to_earliest_when_target_predates_history():
    weights = [
        _w(1, "2026-05-01T09:00:00+02:00", 2400),
        _w(2, "2026-05-02T09:00:00+02:00", 2425),
    ]
    # Looking up a date before any entry — fall back to the earliest.
    assert weight_for_day("2026-04-15", weights)["id"] == 1


def test_weight_for_day_returns_none_for_empty_history():
    assert weight_for_day("2026-04-26", []) is None


# ─── pma_and_postnatal_age ───────────────────────────────────────────────

def test_pma_postnatal_basic():
    pma, postnatal = pma_and_postnatal_age("2026-04-15", 35, today=date(2026, 4, 22))
    assert postnatal == 7
    assert pma == 35 + 1.0  # 7 days = 1 week


def test_pma_postnatal_clamps_negative_to_zero():
    pma, postnatal = pma_and_postnatal_age("2026-05-01", 38, today=date(2026, 4, 15))
    assert postnatal == 0
    assert pma == 38.0


def test_pma_postnatal_handles_malformed_birth_date():
    """Bad date should return (ga_weeks, 0) rather than crash — Settings UI
    has been seen to allow odd values during first-boot setup."""
    pma, postnatal = pma_and_postnatal_age("not-a-date", 36, today=date(2026, 5, 1))
    assert pma == 36.0
    assert postnatal == 0


# ─── expected_gain_range ─────────────────────────────────────────────────

def test_expected_gain_first_week_tolerates_birth_loss():
    assert expected_gain_range(35.0, 3) == (0, 12)


def test_expected_gain_second_week_regain_phase():
    assert expected_gain_range(36.0, 10) == (8, 16)


def test_expected_gain_pma_strata():
    assert expected_gain_range(28.0, 30) == (17, 23)
    assert expected_gain_range(31.0, 30) == (15, 20)
    assert expected_gain_range(35.0, 30) == (12, 17)
    assert expected_gain_range(40.0, 30) == (10, 15)


# ─── rolling_gain_g_per_kg_per_day ───────────────────────────────────────

def test_rolling_gain_returns_none_with_too_few_entries():
    assert rolling_gain_g_per_kg_per_day([]) is None
    assert rolling_gain_g_per_kg_per_day([_w(1, "2026-04-25T09:00:00+02:00", 2280)]) is None


def test_rolling_gain_basic_slope():
    weights = [
        _w(1, "2026-04-25T09:00:00+02:00", 2280),
        _w(2, "2026-04-28T09:00:00+02:00", 2370),  # +90g over 3 days = 30g/day
    ]
    rate = rolling_gain_g_per_kg_per_day(weights, window_days=7)
    # 30 g/day on a 2.37 kg latest = ~12.66 g/kg/day
    assert rate is not None
    assert 12.5 < rate < 12.8


def test_rolling_gain_window_uses_only_within_range():
    """Entry from 14 days ago shouldn't anchor a 7-day window."""
    weights = [
        _w(1, "2026-04-14T09:00:00+02:00", 2200),
        _w(2, "2026-04-25T09:00:00+02:00", 2280),
        _w(3, "2026-04-28T09:00:00+02:00", 2370),
    ]
    rate = rolling_gain_g_per_kg_per_day(weights, window_days=7)
    # Should anchor on entry 2 (within 7 days of latest), not entry 1.
    # (2370 - 2280) / 3 days / 2.37 kg ≈ 12.66
    assert rate is not None
    assert 12.5 < rate < 12.8


# ─── daily_gains ─────────────────────────────────────────────────────────

def test_daily_gains_pairs_consecutive_entries():
    weights = sorted([
        _w(1, "2026-04-25T09:00:00+02:00", 2280),
        _w(2, "2026-04-28T09:00:00+02:00", 2370),
    ], key=lambda w: w["recorded_at"])
    gains = daily_gains(weights)
    # Only the second entry has a 'previous' to compare against.
    assert 2 in gains
    g = gains[2]
    assert g["g_per_day"] == 30.0
    assert abs(g["days"] - 3.0) < 0.01


def test_daily_gains_skips_zero_or_negative_intervals():
    """Two entries at the same instant shouldn't produce a divide-by-zero."""
    weights = [
        _w(1, "2026-04-25T09:00:00+02:00", 2280),
        _w(2, "2026-04-25T09:00:00+02:00", 2290),
    ]
    assert daily_gains(weights) == {}

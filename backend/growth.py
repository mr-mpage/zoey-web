"""Growth-trajectory helpers: weight-for-day lookup, PMA computation,
PMA-aware expected gain bands, rolling gain rate.

Centralised here so the Overview indicator (services.py), the doctor
report (routers/report.py), and the auto-fill regenerator all read off
one definition. The matching frontend lives in
``frontend/src/lib/growth.ts``; keep the two in sync.
"""

from datetime import date, datetime, timedelta
from typing import Optional


def weight_for_day(day_iso: str, weights: list[dict]) -> Optional[dict]:
    """Pick the weight entry that should govern a given feeding day.

    Preference: an entry recorded on that calendar date; otherwise the
    most recent entry recorded earlier; final fallback the earliest
    available entry. The fallback matters mainly for the Overview tab
    rendering before the first weigh-in is logged."""
    same = next((w for w in weights if w["recorded_at"].startswith(day_iso)), None)
    if same:
        return same
    earlier = sorted(
        [w for w in weights if w["recorded_at"][:10] < day_iso],
        key=lambda w: w["recorded_at"],
        reverse=True,
    )
    if earlier:
        return earlier[0]
    if weights:
        return sorted(weights, key=lambda w: w["recorded_at"])[0]
    return None


def pma_and_postnatal_age(birth_date_iso: str, ga_weeks: int, today: Optional[date] = None) -> tuple[float, int]:
    """(postmenstrual age in weeks, postnatal age in days). On a malformed
    birth date returns (ga_weeks, 0) so callers don't crash mid-render."""
    try:
        birth = date.fromisoformat(birth_date_iso)
    except ValueError:
        return float(ga_weeks), 0
    today = today or date.today()
    postnatal_days = max(0, (today - birth).days)
    pma = ga_weeks + postnatal_days / 7.0
    return pma, postnatal_days


def expected_gain_range(pma_weeks: float, postnatal_days: int) -> tuple[int, int]:
    """(min, max) g/kg/day expected for preterm girls.

    Velocity decreases as PMA approaches term: ~21 g/kg/day at 22 weeks
    PMA → ~12 g/kg/day at 36 weeks PMA → ~10 g/kg/day at term-equivalent.
    The first 14 postnatal days get their own brackets to allow for the
    birth-weight loss/regain phase."""
    if postnatal_days < 7:
        return (0, 12)
    if postnatal_days < 14:
        return (8, 16)
    if pma_weeks < 30:
        return (17, 23)
    if pma_weeks < 34:
        return (15, 20)
    if pma_weeks < 38:
        return (12, 17)
    return (10, 15)


def rolling_gain_g_per_kg_per_day(weights: list[dict], window_days: int = 7) -> Optional[float]:
    """(latest - earliest within window) / days_between, expressed as
    g/kg/day against the latest weight. Pass *manual* weights only —
    auto-fill entries are derived from this very rate, so including them
    folds the rate into its own calculation.

    Returns None when fewer than two distinct entries are available."""
    sorted_w = sorted(weights, key=lambda w: w["recorded_at"])
    if len(sorted_w) < 2:
        return None
    latest = sorted_w[-1]
    cutoff = datetime.fromisoformat(latest["recorded_at"]) - timedelta(days=window_days)
    within = [w for w in sorted_w if datetime.fromisoformat(w["recorded_at"]) >= cutoff]
    earliest = within[0] if len(within) > 1 else sorted_w[0]
    if earliest["id"] == latest["id"]:
        return None
    span_seconds = (
        datetime.fromisoformat(latest["recorded_at"])
        - datetime.fromisoformat(earliest["recorded_at"])
    ).total_seconds()
    days = span_seconds / 86400.0
    if days <= 0:
        return None
    g_per_day = (latest["weight_grams"] - earliest["weight_grams"]) / days
    kg = latest["weight_grams"] / 1000
    return g_per_day / kg if kg > 0 else None


def daily_gains(weights_chrono: list[dict]) -> dict[int, dict]:
    """Per-row gain map keyed by ``cur['id']``. Each value carries the
    g/day and g/kg/day rate vs. the previous chronological entry, plus
    the source datetime and the gap in days. Used by the doctor PDF for
    the row-by-row gain column."""
    out: dict[int, dict] = {}
    for prev, cur in zip(weights_chrono, weights_chrono[1:]):
        days = (
            datetime.fromisoformat(cur["recorded_at"])
            - datetime.fromisoformat(prev["recorded_at"])
        ).total_seconds() / 86400
        if days <= 0:
            continue
        g_per_day = (cur["weight_grams"] - prev["weight_grams"]) / days
        kg = prev["weight_grams"] / 1000
        g_per_kg_per_day = g_per_day / kg if kg > 0 else 0
        out[cur["id"]] = {
            "g_per_day": g_per_day,
            "g_per_kg_per_day": g_per_kg_per_day,
            "from_iso": prev["recorded_at"],
            "days": days,
        }
    return out

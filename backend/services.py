"""Shared computations used by both routers and the background scheduler."""

from datetime import datetime, time, timedelta
from typing import Optional

from . import repo
from .comparisons import (
    TZ,
    anchor_from_settings,
    feeding_day_bounds,
    feeding_day_for,
    feeding_day_for_row,
    index_feeds_by_feeding_day,
    now_local,
    pace_tier,
)
from .growth import (
    expected_gain_range as _expected_gain_range,
    pma_and_postnatal_age as _pma_and_postnatal_age,
    rolling_gain_g_per_kg_per_day,
    weight_for_day as _weight_for_day,
)
from .models import Overview, OverviewIndicator, OverviewSummary


def compute_next_feed() -> Optional[dict]:
    """Returns dict with expected_at, feed_index, target_ml — or None if all done / no weight set."""
    s = repo.get_settings()
    anchor_h, anchor_m = anchor_from_settings(s)
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


# ----- Overview ----------------------------------------------------------

def _ml_per_kg_last_n_days(n: int) -> tuple[Optional[float], int]:
    """Average ml/kg/day across the last `n` *completed* feeding days. Returns (avg, days_used).

    Respects feeding_day_override on individual feeds: a feed at 02:20 tagged
    as "first feed of today" is counted under today rather than under the
    previous feeding day's raw 02:30-to-02:30 window.
    """
    s = repo.get_settings()
    anchor_h, anchor_m = anchor_from_settings(s)
    today = feeding_day_for(now_local(), anchor_h, anchor_m)

    weights = repo.list_weights()
    if not weights:
        return None, 0

    # Pull a wider raw window than n days, then bucket by feeding_day_for_row
    # so overrides land in the correct day. Pad by one day on each side to
    # cover boundary feeds.
    earliest = today - timedelta(days=n + 1)
    latest = today + timedelta(days=1)
    e_start, _ = feeding_day_bounds(earliest, anchor_h, anchor_m)
    _, l_end = feeding_day_bounds(latest, anchor_h, anchor_m)
    rows = repo.list_feeds_between(e_start.isoformat(), l_end.isoformat())

    totals_by_day: dict[str, float] = {}
    for r in rows:
        d = feeding_day_for_row(r, anchor_h, anchor_m).isoformat()
        totals_by_day[d] = totals_by_day.get(d, 0.0) + r["amount_ml"]

    samples: list[float] = []
    for delta in range(1, n + 1):
        d = today - timedelta(days=delta)
        total = totals_by_day.get(d.isoformat())
        if not total:
            continue
        w = _weight_for_day(d.isoformat(), weights)
        if not w:
            continue
        kg = w["weight_grams"] / 1000
        if kg <= 0:
            continue
        samples.append(total / kg)
    if not samples:
        return None, 0
    return sum(samples) / len(samples), len(samples)


def _rolling_gain_g_per_kg_per_day(window_days: int = 7) -> Optional[float]:
    """Adapter that fetches manual-only weights and delegates to the
    shared growth helper. Auto-fill entries are derived from this very
    rate, so excluding them is mandatory."""
    manuals = [w for w in repo.list_weights() if not w.get("is_auto")]
    return rolling_gain_g_per_kg_per_day(manuals, window_days)


def _diapers_per_day_last_n(n: int) -> tuple[Optional[float], int]:
    """Average wet diapers/day over the last `n` *completed* days.

    Only counts days where any diaper was logged. Days with no records
    are treated as 'not tracked' rather than as zero, so the average
    isn't silently dragged down by historical days from before the
    feature was being used. If no day has data, returns (None, 0).
    """
    s = repo.get_settings()
    anchor_h, anchor_m = anchor_from_settings(s)
    today = feeding_day_for(now_local(), anchor_h, anchor_m)

    counts: list[int] = []
    for delta in range(1, n + 1):
        d = today - timedelta(days=delta)
        d_start, d_end = feeding_day_bounds(d, anchor_h, anchor_m)
        rows = repo.list_diapers_between(d_start.isoformat(), d_end.isoformat())
        if not rows:
            continue  # day with no logged diapers — skip rather than count as 0
        wet = sum(1 for r in rows if r["kind"] == "wet")
        counts.append(wet)
    if not counts:
        return None, 0
    return sum(counts) / len(counts), len(counts)


def _aggregate_status(statuses: list[str]) -> str:
    if "concern" in statuses:
        return "concern"
    if "watch" in statuses:
        return "watch"
    if statuses and all(s in ("good", "over") for s in statuses):
        return "good"
    return "unknown"


def _intake_indicator(s: dict[str, str]) -> OverviewIndicator:
    """Last 7 completed days, avg ml/kg/day vs the configured bands."""
    from .db import DEFAULTS
    band_concern = int(s.get("target_concern_ml_per_kg", DEFAULTS["target_concern_ml_per_kg"]))
    band_low = int(s.get("target_low_ml_per_kg", DEFAULTS["target_low_ml_per_kg"]))
    band_solid = int(s.get("target_solid_ml_per_kg", DEFAULTS["target_solid_ml_per_kg"]))
    band_high = int(s.get("target_high_ml_per_kg", DEFAULTS["target_high_ml_per_kg"]))

    avg_mlkg, days_used = _ml_per_kg_last_n_days(7)
    if avg_mlkg is None:
        return OverviewIndicator(
            key="intake", title="Intake", status="unknown",
            headline="Not enough data yet",
            detail="Log a couple more days of feeds and weight to surface the trend.",
        )

    if avg_mlkg >= band_high:
        status, headline = "over", "Above target zone"
        detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — above the standard zone, often catch-up growth."
    elif avg_mlkg >= band_solid:
        status, headline = "good", "Solidly in target zone"
        detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — comfortably in the target range."
    elif avg_mlkg >= band_low:
        status, headline = "good", "In target zone"
        detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — at the lower edge of the standard range."
    elif avg_mlkg >= band_concern:
        status, headline = "watch", "Below target zone"
        detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — under the standard {band_low}–{band_high} range. Watch the next few days."
    else:
        status, headline = "concern", "Well below target"
        detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — flag at her next check-in if this persists."
    return OverviewIndicator(key="intake", title="Intake", status=status, headline=headline, detail=detail)


def _growth_indicator(s: dict[str, str]) -> OverviewIndicator:
    """Rolling 7-day gain rate vs the PMA-aware expected band.

    Velocity decreases as PMA approaches term; early postnatal days (<14)
    tolerate lower gains while she's still regaining birth weight."""
    from .db import DEFAULTS
    from datetime import date as _date

    birth_date_str = s.get("birth_date") or _date.today().isoformat()
    ga_weeks = int(s.get("gestational_age_weeks", DEFAULTS["gestational_age_weeks"]))
    pma_weeks, postnatal_days = _pma_and_postnatal_age(birth_date_str, ga_weeks)
    g_min, g_max = _expected_gain_range(pma_weeks, postnatal_days)

    if postnatal_days < 14:
        stage_phrase = f"first {postnatal_days} days postnatal"
        expected_phrase = f"{g_min}–{g_max} g/kg/day expected during birth-weight recovery"
    else:
        stage_phrase = f"{pma_weeks:.1f} weeks PMA"
        expected_phrase = f"{g_min}–{g_max} g/kg/day expected at this age"

    gain = _rolling_gain_g_per_kg_per_day(7)
    if gain is None:
        return OverviewIndicator(
            key="growth", title="Growth", status="unknown",
            headline="Need more weight entries",
            detail="Two or more weight entries on different days are needed to show a gain trend.",
        )

    if gain >= g_max + 8:
        status, headline = "over", "Strong gain"
        detail = f"+{gain:.0f} g/kg/day — above the {expected_phrase} ({stage_phrase}). Often fine; mention if she also seems unsettled."
    elif gain >= g_max:
        status, headline = "good", "Gaining well"
        detail = f"+{gain:.0f} g/kg/day — at or above the {expected_phrase} ({stage_phrase})."
    elif gain >= g_min:
        status, headline = "good", "Within expected range"
        detail = f"+{gain:.0f} g/kg/day — within the {expected_phrase} ({stage_phrase})."
    elif gain >= g_min - 3:
        status, headline = "watch", "Just below target"
        detail = f"+{gain:.0f} g/kg/day — just under the {expected_phrase} ({stage_phrase}). Worth watching the next weigh-in."
    elif gain >= max(0, g_min - 8):
        status, headline = "watch", "Gain below target"
        detail = f"+{gain:.0f} g/kg/day — under the {expected_phrase} ({stage_phrase}). Worth flagging if it persists."
    else:
        status, headline = "concern", "Gain low"
        detail = f"+{gain:.0f} g/kg/day — well below the {expected_phrase} ({stage_phrase}). Worth flagging at her next visit."
    return OverviewIndicator(key="growth", title="Growth", status=status, headline=headline, detail=detail)


# Maps the shared 7-tier pace classification to this surface's 4 status
# levels + a per-tier copy template. The dashboard router renders the
# raw tier; here we collapse to good/watch/concern/over for the card.
_PACE_COPY: dict[str, tuple[str, str, str]] = {
    "on_track": (
        "good", "On track today",
        "{abs_gap:.0f} ml from the expected pace at this point — right on rhythm.",
    ),
    "slightly_behind": (
        "watch", "Slightly behind today",
        "{abs_gap:.0f} ml under the expected pace so far — well within range, easy to recover.",
    ),
    "behind": (
        "watch", "Behind today",
        "{abs_gap:.0f} ml under the expected pace. Catch-up is built into the next feed's target.",
    ),
    "well_behind": (
        "concern", "Well behind today",
        "{abs_gap:.0f} ml under the expected pace. Catch-up is built into the next feed's target.",
    ),
    "slightly_ahead": (
        "good", "Slightly ahead today",
        "{gap:.0f} ml above the expected pace — she's eating well.",
    ),
    "ahead": (
        "good", "Ahead today",
        "{gap:.0f} ml above the expected pace. Next feeds can ease off if she's full.",
    ),
    "well_ahead": (
        "over", "Well ahead today",
        "{gap:.0f} ml above the expected pace. Next feeds will ease off.",
    ),
}


def _today_pace_indicator(s: dict[str, str]) -> OverviewIndicator:
    """How today's running total compares to the expected pace at this point.

    Pads the SQL window by one day on each side so feeds whose raw fed_at
    sits just before the anchor but carry a feeding_day_override for today
    still get pulled in. index_feeds_by_feeding_day then buckets them under
    the override day, matching the dashboard's totals."""
    nf = compute_next_feed()
    s_anchor_h, s_anchor_m = anchor_from_settings(s)
    today = feeding_day_for(now_local(), s_anchor_h, s_anchor_m)
    pad_start, _ = feeding_day_bounds(today - timedelta(days=1), s_anchor_h, s_anchor_m)
    _, pad_end = feeding_day_bounds(today + timedelta(days=1), s_anchor_h, s_anchor_m)
    feed_rows = repo.list_feeds_between(pad_start.isoformat(), pad_end.isoformat())
    by_day = index_feeds_by_feeding_day(feed_rows, s_anchor_h, s_anchor_m)
    todays = sorted(by_day.get(today, []), key=lambda r: r["fed_at"])
    scheduled_today = [f for f in todays if not f.get("is_extra")]
    weight = repo.latest_weight()

    if scheduled_today and weight:
        daily = weight["weight_grams"] / 1000 * weight["ml_per_kg_per_day"]
        feeds_per_day = int(s.get("feeds_per_day", "8"))
        per_feed_target = daily / feeds_per_day
        total = sum(f["amount_ml"] for f in todays)
        expected = per_feed_target * len(scheduled_today)
        gap = total - expected
        status, headline, detail_tpl = _PACE_COPY[pace_tier(gap, expected)]
        detail = detail_tpl.format(gap=gap, abs_gap=abs(gap))
    elif nf is None:
        status, headline = "good", "Day is complete"
        detail = "All scheduled feeds done."
    else:
        status, headline = "unknown", "Day not started"
        detail = "First feed of today coming up."
    return OverviewIndicator(key="today_pace", title="Today's pace", status=status, headline=headline, detail=detail)


def _hydration_indicator() -> OverviewIndicator:
    """Wet diapers/day average over the last 3 completed days with data."""
    diaper_avg, dd = _diapers_per_day_last_n(3)
    if diaper_avg is None:
        return OverviewIndicator(
            key="hydration", title="Hydration", status="unknown",
            headline="Not tracked yet",
            detail="Log wet diapers from the Today screen for a few days to see this.",
        )

    avg_int = round(diaper_avg)
    day_word = "day" if dd == 1 else "days"
    if diaper_avg >= 6:
        status, headline = "good", "Healthy"
        detail = f"Averaging {avg_int} wet diapers/day over the last {dd} {day_word} — comfortable hydration."
    elif diaper_avg >= 4:
        status, headline = "watch", "Lower end"
        detail = f"Averaging {avg_int} wet/day over the last {dd} {day_word} — below the usual 6+. Watch tomorrow's count."
    else:
        status, headline = "concern", "Low"
        detail = f"Averaging {avg_int} wet/day over the last {dd} {day_word} — well under 6. Mention at her next check-in."
    return OverviewIndicator(key="hydration", title="Hydration", status=status, headline=headline, detail=detail)


def _vitals_indicator() -> Optional[OverviewIndicator]:
    """Owlet sock aggregates over the last week of completed days.

    Returns None when the integration isn't configured — avoids a permanent
    'Not configured' card for users who don't have the sock."""
    from .config import settings as _settings
    if not _settings.zoey_owlet_email:
        return None

    # Pull 8 to drop today (incomplete) and keep the last 7 completed days.
    from .owlet import vitals_summary_for_range
    v_summary = vitals_summary_for_range(8)
    today_iso = now_local().date().isoformat()
    v_completed = [
        v for v in v_summary
        if v["feeding_day"] != today_iso and v["monitoring_minutes"] >= 30
    ]
    if not v_completed:
        return OverviewIndicator(
            key="vitals", title="Vitals", status="unknown",
            headline="No monitoring yet this week",
            detail="The sock hasn't logged enough data this week to summarise.",
        )

    hr_avgs = [v["hr_avg"] for v in v_completed if v["hr_avg"] is not None]
    spo2_mins = [v["spo2_min_avg10"] for v in v_completed if v["spo2_min_avg10"] is not None]
    if not (hr_avgs and spo2_mins):
        return None
    alerts = sum(v["low_spo2_alert_count"] for v in v_completed)
    weekly_min_spo2 = min(spo2_mins)
    hr_lo, hr_hi = min(hr_avgs), max(hr_avgs)
    # Collapse the range when one day, or when rounding makes it degenerate
    # ("averaged 150–150 BPM" reads strangely).
    hr_phrase = (
        f"{hr_lo:.0f} BPM"
        if round(hr_lo) == round(hr_hi)
        else f"{hr_lo:.0f}–{hr_hi:.0f} BPM"
    )
    hr_typical = all(120 <= h <= 160 for h in hr_avgs)
    # Per CHOP Neonatal Oxygen Targeting Consensus 2024, the preterm target
    # floor for ≥32 wk PMA is 92%. Sustained <88% is at or below the standard
    # NICU alarm threshold.
    low_days = [v for v in v_completed if v["spo2_min_avg10"] is not None and v["spo2_min_avg10"] < 88]
    if low_days:
        n = len(low_days)
        status, headline = "concern", f"{n} day{'s' if n != 1 else ''} below 88% SpO₂"
        detail = (
            f"Lowest sustained SpO₂ this week: {weekly_min_spo2:.0f}%. "
            f"At or below the standard NICU alarm threshold. "
            f"Worth raising at her next check-in. The sock continues to alert "
            f"in real time on its own thresholds."
        )
    elif weekly_min_spo2 < 92:
        status, headline = "watch", "SpO₂ dipped this week"
        detail = (
            f"Lowest sustained SpO₂: {weekly_min_spo2:.0f}%. Just below the "
            f"92% preterm target floor, worth a glance but not a flag."
        )
    elif not hr_typical:
        status, headline = "watch", "HR outside the typical band"
        span_phrase = (
            f"Daily average sat at {hr_lo:.0f} BPM"
            if round(hr_lo) == round(hr_hi)
            else f"Daily averages spanned {hr_lo:.0f}–{hr_hi:.0f} BPM"
        )
        detail = (
            f"{span_phrase}. Newborn HR varies "
            f"with sleep and crying, context-dependent rather than automatic concern."
        )
    else:
        status, headline = "good", "Vitals comfortable"
        detail = (
            f"HR averaged {hr_phrase}, lowest SpO₂ {weekly_min_spo2:.0f}% "
            f"across {len(v_completed)} monitored day{'s' if len(v_completed) != 1 else ''}."
            + (f" {alerts} alert{'s' if alerts != 1 else ''} this week." if alerts else " No alerts.")
        )
    return OverviewIndicator(key="vitals", title="Vitals", status=status, headline=headline, detail=detail)


def _build_summary(inds: list[OverviewIndicator]) -> OverviewSummary:
    statuses = [i.status for i in inds if i.status != "unknown"]
    agg = _aggregate_status(statuses)
    if not statuses:
        return OverviewSummary(
            status="unknown",
            text="Not enough data yet — keep logging and the overview will fill in.",
        )
    if agg == "concern":
        flagged = [i.title for i in inds if i.status == "concern"]
        return OverviewSummary(
            status="concern",
            text=f"{', '.join(flagged)} below target — worth mentioning at her next check-in.",
        )
    if agg == "watch":
        watching = [i.title for i in inds if i.status == "watch"]
        return OverviewSummary(
            status="watch",
            text=f"Mostly good. Watching: {', '.join(watching).lower()}.",
        )
    return OverviewSummary(status="good", text="Doing well across the board. No concerns flagged.")


def compute_overview() -> Overview:
    s = repo.get_settings()
    builders = (
        _intake_indicator(s),
        _growth_indicator(s),
        _today_pace_indicator(s),
        _hydration_indicator(),
        _vitals_indicator(),
    )
    inds = [i for i in builders if i is not None]
    return Overview(indicators=inds, summary=_build_summary(inds))


def _recent_daily_gain_g(manuals_chrono: list[dict]) -> float:
    """Avg g/day from the manual entries in the trailing 7 days. Mirrors the
    rollingGainRate window used on the Weight tab so the auto-fill matches
    the gain rate the user sees in the app."""
    if len(manuals_chrono) < 2:
        return 0.0
    latest = manuals_chrono[-1]
    cutoff = datetime.fromisoformat(latest["recorded_at"]) - timedelta(days=7)
    within = [w for w in manuals_chrono if datetime.fromisoformat(w["recorded_at"]) >= cutoff]
    earliest = within[0] if len(within) > 1 else manuals_chrono[0]
    if earliest["id"] == latest["id"]:
        return 0.0
    span_days = (datetime.fromisoformat(latest["recorded_at"]) - datetime.fromisoformat(earliest["recorded_at"])).total_seconds() / 86400.0
    if span_days <= 0:
        return 0.0
    return (latest["weight_grams"] - earliest["weight_grams"]) / span_days


def regenerate_auto_weights() -> None:
    """Wipe and rebuild all auto weight entries from the manual history.

    Linearly interpolates between adjacent manuals to fill in-range gaps,
    then extrapolates forward from the latest manual to today's feeding day
    using the trailing 7-day daily gain. Idempotent — safe to call on every
    manual write or on a fresh-day read."""
    s = repo.get_settings()
    anchor_h, anchor_m = anchor_from_settings(s)

    repo.delete_all_auto_weights()

    manuals = sorted(
        [w for w in repo.list_weights() if not w.get("is_auto")],
        key=lambda w: w["recorded_at"],
    )
    if not manuals:
        return

    def day_of(row: dict):
        return feeding_day_for(datetime.fromisoformat(row["recorded_at"]), anchor_h, anchor_m)

    def insert_for(target_day, weight_grams: int, ml_per_kg_per_day: int) -> None:
        # Anchor auto entries at noon local so a same-day manual added later
        # at any reasonable hour sorts after the auto and a regenerate replaces
        # it cleanly.
        recorded_at = datetime.combine(target_day, time(hour=12), tzinfo=TZ)
        repo.insert_weight(recorded_at, weight_grams, ml_per_kg_per_day, None, is_auto=True)

    # Fill between adjacent manuals (linear interpolation)
    for a, b in zip(manuals, manuals[1:]):
        a_day = day_of(a)
        b_day = day_of(b)
        gap_days = (b_day - a_day).days
        if gap_days <= 1:
            continue
        rate = (b["weight_grams"] - a["weight_grams"]) / gap_days
        for d in range(1, gap_days):
            insert_for(a_day + timedelta(days=d), round(a["weight_grams"] + d * rate), a["ml_per_kg_per_day"])

    # Extrapolate forward from the latest manual to today
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    latest = manuals[-1]
    latest_day = day_of(latest)
    if latest_day >= today:
        return

    rate = _recent_daily_gain_g(manuals)
    days_forward = (today - latest_day).days
    for d in range(1, days_forward + 1):
        insert_for(latest_day + timedelta(days=d), round(latest["weight_grams"] + d * rate), latest["ml_per_kg_per_day"])


def ensure_auto_weights_through_today() -> None:
    """Lazy hook called on every weight status read. If today's feeding day
    has no entry yet (manual or auto), regenerate. This is what makes the
    auto-fill actually advance when the app is opened on a new day."""
    s = repo.get_settings()
    anchor_h, anchor_m = anchor_from_settings(s)
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    weights = repo.list_weights()
    has_today = any(
        feeding_day_for(datetime.fromisoformat(w["recorded_at"]), anchor_h, anchor_m) == today
        for w in weights
    )
    if not has_today:
        regenerate_auto_weights()

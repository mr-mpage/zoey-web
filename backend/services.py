"""Shared computations used by both routers and the background scheduler."""

from datetime import datetime, timedelta
from typing import Optional

from . import repo
from .comparisons import (
    feeding_day_bounds,
    feeding_day_for,
    feeding_day_for_row,
    index_feeds_by_feeding_day,
    now_local,
)
from .models import Overview, OverviewIndicator, OverviewSummary


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


# ----- Overview ----------------------------------------------------------

def _weight_for_day(day_iso: str, weights: list[dict]) -> Optional[dict]:
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


def _ml_per_kg_last_n_days(n: int) -> tuple[Optional[float], int]:
    """Average ml/kg/day across the last `n` *completed* feeding days. Returns (avg, days_used).

    Respects feeding_day_override on individual feeds: a feed at 02:20 tagged
    as "first feed of today" is counted under today rather than under the
    previous feeding day's raw 02:30-to-02:30 window.
    """
    s = repo.get_settings()
    anchor_h = int(s.get("day_start_hour", "2"))
    anchor_m = int(s.get("day_start_minute", "30"))
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
    weights = sorted(repo.list_weights(), key=lambda w: w["recorded_at"])
    if len(weights) < 2:
        return None
    latest = weights[-1]
    cutoff = datetime.fromisoformat(latest["recorded_at"]) - timedelta(days=window_days)
    within = [w for w in weights if datetime.fromisoformat(w["recorded_at"]) >= cutoff]
    earliest = within[0] if len(within) > 1 else weights[0]
    if earliest["id"] == latest["id"]:
        return None
    days = (
        datetime.fromisoformat(latest["recorded_at"]) - datetime.fromisoformat(earliest["recorded_at"])
    ).total_seconds() / 86400
    if days <= 0:
        return None
    g_per_day = (latest["weight_grams"] - earliest["weight_grams"]) / days
    return g_per_day / (latest["weight_grams"] / 1000)


def _diapers_per_day_last_n(n: int) -> tuple[Optional[float], int]:
    """Average wet diapers/day over the last `n` *completed* days.

    Only counts days where any diaper was logged. Days with no records
    are treated as 'not tracked' rather than as zero, so the average
    isn't silently dragged down by historical days from before the
    feature was being used. If no day has data, returns (None, 0).
    """
    s = repo.get_settings()
    anchor_h = int(s.get("day_start_hour", "2"))
    anchor_m = int(s.get("day_start_minute", "30"))
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


def _pma_and_postnatal_age(birth_date_iso: str, ga_weeks: int) -> tuple[float, int]:
    """Returns (postmenstrual age in weeks, postnatal age in days)."""
    from datetime import date as _date
    try:
        birth = _date.fromisoformat(birth_date_iso)
    except ValueError:
        return float(ga_weeks), 0
    today = now_local().date()
    postnatal_days = max(0, (today - birth).days)
    pma = ga_weeks + postnatal_days / 7.0
    return pma, postnatal_days


def _expected_gain_range(pma_weeks: float, postnatal_days: int) -> tuple[int, int]:
    """Returns (min, max) g/kg/day expected, based on Fenton-derived PMA strata
    and a postnatal-recovery allowance for the first ~2 weeks of life.

    References: Fenton 2013/2025 growth charts, AAP/ESPGHAN 2022. Velocity
    decreases monotonically as PMA approaches term: ~21 g/kg/day at 22 weeks
    PMA → ~12 g/kg/day at 36 weeks PMA → ~10 g/kg/day at term-equivalent.
    """
    if postnatal_days < 7:
        # Birth-weight loss / earliest recovery — gain is often near zero or negative
        return (0, 12)
    if postnatal_days < 14:
        # Regaining birth weight — building toward steady gain
        return (8, 16)
    if pma_weeks < 30:
        return (17, 23)
    if pma_weeks < 34:
        return (15, 20)
    if pma_weeks < 38:
        return (12, 17)
    return (10, 15)  # term-equivalent and beyond


def _aggregate_status(statuses: list[str]) -> str:
    if "concern" in statuses:
        return "concern"
    if "watch" in statuses:
        return "watch"
    if statuses and all(s in ("good", "over") for s in statuses):
        return "good"
    return "unknown"


def compute_overview() -> Overview:
    s = repo.get_settings()
    band_concern = int(s.get("target_concern_ml_per_kg", "130"))
    band_low = int(s.get("target_low_ml_per_kg", "150"))
    band_solid = int(s.get("target_solid_ml_per_kg", "165"))
    band_high = int(s.get("target_high_ml_per_kg", "180"))

    inds: list[OverviewIndicator] = []

    # Intake: last 7 completed days, avg ml/kg/day vs bands. Matches the
    # 7-day window the History tab uses, so both surfaces show the same
    # number for a given day.
    avg_mlkg, days_used = _ml_per_kg_last_n_days(7)
    if avg_mlkg is None:
        inds.append(OverviewIndicator(
            key="intake",
            title="Intake",
            status="unknown",
            headline="Not enough data yet",
            detail="Log a couple more days of feeds and weight to surface the trend.",
        ))
    else:
        if avg_mlkg >= band_high:
            status = "over"
            headline = "Above target zone"
            detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — above the standard zone, often catch-up growth."
        elif avg_mlkg >= band_solid:
            status = "good"
            headline = "Solidly in target zone"
            detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — comfortably in the target range."
        elif avg_mlkg >= band_low:
            status = "good"
            headline = "In target zone"
            detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — at the lower edge of the standard range."
        elif avg_mlkg >= band_concern:
            status = "watch"
            headline = "Below target zone"
            detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — under the standard {band_low}–{band_high} range. Watch the next few days."
        else:
            status = "concern"
            headline = "Well below target"
            detail = f"Last {days_used} days averaged {avg_mlkg:.0f} ml/kg/day — flag at her next check-in if this persists."
        inds.append(OverviewIndicator(key="intake", title="Intake", status=status, headline=headline, detail=detail))

    # Growth — rolling 7-day gain rate g/kg/day, judged against PMA-aware
    # expected range (Fenton/AAP/ESPGHAN). Velocity decreases as PMA
    # approaches term; early postnatal days (<14) tolerate lower gains
    # while she's regaining birth weight.
    birth_date_str = s.get("birth_date", "2026-04-15")
    ga_weeks = int(s.get("gestational_age_weeks", "35"))
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
        inds.append(OverviewIndicator(
            key="growth",
            title="Growth",
            status="unknown",
            headline="Need more weight entries",
            detail="Two or more weight entries on different days are needed to show a gain trend.",
        ))
    else:
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
        inds.append(OverviewIndicator(key="growth", title="Growth", status=status, headline=headline, detail=detail))

    # Today's pace — quick look at where today sits
    nf = compute_next_feed()
    # We compute pace inline rather than depending on dashboard router.
    # Pad the SQL window by one day on each side so feeds whose raw fed_at
    # sits just before the anchor but carry a feeding_day_override for
    # today still get pulled in. index_feeds_by_feeding_day then buckets
    # them under the override day, matching the dashboard's totals.
    s_anchor_h = int(s.get("day_start_hour", "2"))
    s_anchor_m = int(s.get("day_start_minute", "30"))
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
        pct = abs(gap) / expected if expected > 0 else 0
        if pct <= 0.05:
            status, headline = "good", "On track today"
            detail = f"{abs(gap):.0f} ml from the expected pace at this point — right on rhythm."
        elif gap < 0 and pct >= 0.20:
            status, headline = "concern", "Well behind today"
            detail = f"{abs(gap):.0f} ml under the expected pace. Catch-up is built into the next feed's target."
        elif gap < 0 and pct >= 0.10:
            status, headline = "watch", "Behind today"
            detail = f"{abs(gap):.0f} ml under the expected pace. Catch-up is built into the next feed's target."
        elif gap < 0:
            status, headline = "watch", "Slightly behind today"
            detail = f"{abs(gap):.0f} ml under the expected pace so far — well within range, easy to recover."
        elif pct >= 0.20:
            status, headline = "over", "Well ahead today"
            detail = f"{gap:.0f} ml above the expected pace. Next feeds will ease off."
        elif pct >= 0.10:
            status, headline = "good", "Ahead today"
            detail = f"{gap:.0f} ml above the expected pace. Next feeds can ease off if she's full."
        else:
            status, headline = "good", "Slightly ahead today"
            detail = f"{gap:.0f} ml above the expected pace — she's eating well."
    elif nf is None:
        status, headline = "good", "Day is complete"
        detail = "All scheduled feeds done."
    else:
        status, headline = "unknown", "Day not started"
        detail = "First feed of today coming up."
    inds.append(OverviewIndicator(key="today_pace", title="Today's pace", status=status, headline=headline, detail=detail))

    # Hydration — wet diapers/day average over last 3 completed days that had data
    diaper_avg, dd = _diapers_per_day_last_n(3)
    if diaper_avg is None:
        inds.append(OverviewIndicator(
            key="hydration",
            title="Hydration",
            status="unknown",
            headline="Not tracked yet",
            detail="Log wet diapers from the Today screen for a few days to see this.",
        ))
    else:
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
        inds.append(OverviewIndicator(key="hydration", title="Hydration", status=status, headline=headline, detail=detail))

    # Vitals — Owlet sock aggregates over the last week of completed days.
    # Only shown when the integration is configured (avoids a permanent
    # "Not configured" card for users who don't have the sock).
    from .config import settings as _settings
    if _settings.zoey_owlet_email:
        # Pull 8 to drop today (incomplete) and keep the last 7 completed days.
        from .owlet import vitals_summary_for_range
        v_summary = vitals_summary_for_range(8)
        today_iso = now_local().date().isoformat()
        v_completed = [
            v for v in v_summary
            if v["feeding_day"] != today_iso and v["monitoring_minutes"] >= 30
        ]
        if not v_completed:
            inds.append(OverviewIndicator(
                key="vitals", title="Vitals", status="unknown",
                headline="No monitoring yet this week",
                detail="The sock hasn't logged enough data this week to summarise.",
            ))
        else:
            hr_avgs = [v["hr_avg"] for v in v_completed if v["hr_avg"] is not None]
            spo2_mins = [v["spo2_min_avg10"] for v in v_completed if v["spo2_min_avg10"] is not None]
            alerts = sum(v["low_spo2_alert_count"] for v in v_completed)
            if hr_avgs and spo2_mins:
                weekly_min_spo2 = min(spo2_mins)
                hr_lo, hr_hi = min(hr_avgs), max(hr_avgs)
                hr_typical = all(120 <= h <= 160 for h in hr_avgs)
                low_days = [v for v in v_completed if v["spo2_min_avg10"] is not None and v["spo2_min_avg10"] < 90]
                if low_days:
                    n = len(low_days)
                    status, headline = "concern", f"{n} day{'s' if n != 1 else ''} below 90% SpO₂"
                    detail = (
                        f"Lowest sustained SpO₂ this week: {weekly_min_spo2:.0f}%. "
                        f"Worth raising at her next check-in. The sock continues to alert in "
                        f"real time on its own thresholds."
                    )
                elif weekly_min_spo2 < 95:
                    status, headline = "watch", "SpO₂ dipped this week"
                    detail = (
                        f"Lowest sustained SpO₂: {weekly_min_spo2:.0f}%. Within the acceptable "
                        f"preterm band, worth a glance but not a flag."
                    )
                elif not hr_typical:
                    status, headline = "watch", "HR outside the typical band"
                    detail = (
                        f"Daily averages spanned {hr_lo:.0f}–{hr_hi:.0f} BPM. Newborn HR varies "
                        f"with sleep and crying, context-dependent rather than automatic concern."
                    )
                else:
                    status, headline = "good", "Vitals comfortable"
                    detail = (
                        f"HR averaged {hr_lo:.0f}–{hr_hi:.0f} BPM, lowest SpO₂ {weekly_min_spo2:.0f}% "
                        f"across {len(v_completed)} monitored day{'s' if len(v_completed) != 1 else ''}."
                        + (f" {alerts} alert{'s' if alerts != 1 else ''} this week." if alerts else " No alerts.")
                    )
                inds.append(OverviewIndicator(
                    key="vitals", title="Vitals", status=status, headline=headline, detail=detail,
                ))

    # Aggregate summary
    statuses = [i.status for i in inds if i.status != "unknown"]
    agg = _aggregate_status(statuses)
    if not statuses:
        summary_text = "Not enough data yet — keep logging and the overview will fill in."
        summary_status = "unknown"
    elif agg == "concern":
        flagged = [i.title for i in inds if i.status == "concern"]
        summary_text = f"{', '.join(flagged)} below target — worth mentioning at her next check-in."
        summary_status = "concern"
    elif agg == "watch":
        watching = [i.title for i in inds if i.status == "watch"]
        summary_text = f"Mostly good. Watching: {', '.join(watching).lower()}."
        summary_status = "watch"
    else:
        summary_text = "Doing well across the board. No concerns flagged."
        summary_status = "good"

    return Overview(indicators=inds, summary=OverviewSummary(status=summary_status, text=summary_text))

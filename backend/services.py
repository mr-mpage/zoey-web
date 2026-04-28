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
    """Average ml/kg/day across the last `n` *completed* feeding days. Returns (avg, days_used)."""
    s = repo.get_settings()
    anchor_h = int(s.get("day_start_hour", "2"))
    anchor_m = int(s.get("day_start_minute", "30"))
    today = feeding_day_for(now_local(), anchor_h, anchor_m)

    weights = repo.list_weights()
    if not weights:
        return None, 0

    samples: list[float] = []
    for delta in range(1, n + 1):
        d = today - timedelta(days=delta)
        d_start, d_end = feeding_day_bounds(d, anchor_h, anchor_m)
        feeds = repo.list_feeds_between(d_start.isoformat(), d_end.isoformat())
        if not feeds:
            continue
        total = sum(f["amount_ml"] for f in feeds)
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
            counts.append(0)
            continue
        wet = sum(1 for r in rows if r["kind"] == "wet")
        counts.append(wet)
    # Only return non-empty if we have at least one day with any data
    if not counts or all(c == 0 for c in counts):
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


def compute_overview() -> Overview:
    s = repo.get_settings()
    band_concern = int(s.get("target_concern_ml_per_kg", "130"))
    band_low = int(s.get("target_low_ml_per_kg", "150"))
    band_solid = int(s.get("target_solid_ml_per_kg", "165"))
    band_high = int(s.get("target_high_ml_per_kg", "180"))

    inds: list[OverviewIndicator] = []

    # Intake — last 3 completed days, avg ml/kg/day vs bands
    avg_mlkg, days_used = _ml_per_kg_last_n_days(3)
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

    # Growth — rolling 7-day gain rate g/kg/day
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
        if gain >= 25:
            status, headline = "over", "Strong gain"
            detail = f"+{gain:.0f} g/kg/day over the last week — above the typical 15–20 range. Often fine; mention it if she also seems unsettled."
        elif gain >= 15:
            status, headline = "good", "Gaining well"
            detail = f"+{gain:.0f} g/kg/day over the last week — right in the expected 15–20 range for preterm."
        elif gain >= 10:
            status, headline = "watch", "Gain slightly slow"
            detail = f"+{gain:.0f} g/kg/day — under the typical 15–20 target. Worth watching the next few weigh-ins."
        elif gain > 0:
            status, headline = "concern", "Gain low"
            detail = f"+{gain:.0f} g/kg/day — well below the typical 15–20 range. Worth flagging."
        else:
            status, headline = "concern", "Not gaining"
            detail = f"{gain:+.0f} g/kg/day over the last week. Worth flagging at her next visit."
        inds.append(OverviewIndicator(key="growth", title="Growth", status=status, headline=headline, detail=detail))

    # Today's pace — quick look at where today sits
    nf = compute_next_feed()
    # We compute pace inline rather than depending on dashboard router
    s_anchor_h = int(s.get("day_start_hour", "2"))
    s_anchor_m = int(s.get("day_start_minute", "30"))
    today = feeding_day_for(now_local(), s_anchor_h, s_anchor_m)
    today_start, today_end = feeding_day_bounds(today, s_anchor_h, s_anchor_m)
    feed_rows = repo.list_feeds_between(today_start.isoformat(), today_end.isoformat())
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
        tol = expected * 0.15
        if gap < -tol:
            status, headline = "watch", "Slightly behind today"
            detail = f"{abs(gap):.0f} ml under the expected mid-day pace. Catch-up is built into the next feed's target."
        elif gap > tol:
            status, headline = "good", "Ahead today"
            detail = f"{gap:.0f} ml above the expected pace. Next feeds can ease off if she's full."
        else:
            status, headline = "good", "On track today"
            detail = "Right on the expected pace for this point in the day."
    elif nf is None:
        status, headline = "good", "Day is complete"
        detail = "All scheduled feeds done."
    else:
        status, headline = "unknown", "Day not started"
        detail = "First feed of today coming up."
    inds.append(OverviewIndicator(key="today_pace", title="Today's pace", status=status, headline=headline, detail=detail))

    # Hydration — wet diapers/day average over last 3 completed days
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
        if diaper_avg >= 6:
            status, headline = "good", "Healthy"
            detail = f"Averaging {diaper_avg:.1f} wet diapers/day over the last {dd} day(s) — comfortable hydration."
        elif diaper_avg >= 4:
            status, headline = "watch", "Lower end"
            detail = f"Averaging {diaper_avg:.1f} wet/day — below the usual 6+. Watch tomorrow's count."
        else:
            status, headline = "concern", "Low"
            detail = f"Averaging {diaper_avg:.1f} wet/day — well under 6. Mention at her next check-in."
        inds.append(OverviewIndicator(key="hydration", title="Hydration", status=status, headline=headline, detail=detail))

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

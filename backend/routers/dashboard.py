from datetime import timedelta

from fastapi import APIRouter, Depends

from .. import repo
from ..auth import require_auth
from ..comparisons import (
    feeding_day_bounds,
    feeding_day_for,
    historical_comparison,
    index_feeds_by_feeding_day,
    now_local,
    pace_tier,
    read_anchor,
)
from ..config import settings as cfg
from ..models import (
    Dashboard,
    DiaperSummary,
    Feed,
    FeedWithComparison,
    NextFeedHint,
)
from . import weight as weight_router

router = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(require_auth)])




def _read_feeds_per_day() -> int:
    s = repo.get_settings()
    return int(s.get("feeds_per_day", "8"))


@router.get("/dashboard")
def get_dashboard() -> Dashboard:
    anchor_h, anchor_m = read_anchor()
    feeds_per_day = _read_feeds_per_day()
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    today_start, today_end = feeding_day_bounds(today, anchor_h, anchor_m)

    history_start = today - timedelta(days=8)
    h_start, _ = feeding_day_bounds(history_start, anchor_h, anchor_m)

    feed_rows = repo.list_feeds_between(h_start.isoformat(), today_end.isoformat())
    by_day = index_feeds_by_feeding_day(feed_rows, anchor_h, anchor_m)
    todays_feeds = sorted(by_day.get(today, []), key=lambda r: r["fed_at"])

    pump_rows = repo.list_pumps_between(today_start.isoformat(), today_end.isoformat())
    diaper_rows = repo.list_diapers_between(today_start.isoformat(), today_end.isoformat())
    diaper_summary = DiaperSummary(
        wet=sum(1 for d in diaper_rows if d["kind"] == "wet"),
        dirty=sum(1 for d in diaper_rows if d["kind"] == "dirty"),
    )

    weight_status = weight_router.compute_status()
    daily_target = weight_status.daily_target_ml
    per_feed_target = weight_status.per_feed_target_ml

    from ..comparisons import status_for

    feeds_with_cmp: list[FeedWithComparison] = []
    for f in todays_feeds:
        idx = f["feed_index"]  # None for extras
        is_extra = bool(f.get("is_extra"))
        method = f.get("method") or "bottle"
        feed = Feed(
            id=f["id"],
            fed_at=f["fed_at"] if hasattr(f["fed_at"], "isoformat") else f["fed_at"],
            amount_ml=f["amount_ml"],
            notes=f["notes"],
            is_extra=is_extra,
            method=method,
            duration_min=f.get("duration_min"),
            feeding_day_override=f.get("feeding_day_override"),
        )
        # Skip volume comparison for breast feeds — the ml is a rough estimate so
        # comparing it to historical bottle ml at the same slot would be misleading.
        if is_extra or idx is None or method == "breast":
            feeds_with_cmp.append(FeedWithComparison(**feed.model_dump(), feed_index=idx, comparison=None, status="normal"))
        else:
            cmp = historical_comparison(by_day, today, idx)
            feeds_with_cmp.append(
                FeedWithComparison(
                    **feed.model_dump(),
                    feed_index=idx,
                    comparison=cmp,
                    status=status_for(feed.amount_ml, cmp, cfg.comparison_threshold_pct),
                )
            )

    scheduled = [f for f in feeds_with_cmp if not f.is_extra]

    feeds_total = sum(f.amount_ml for f in feeds_with_cmp)  # includes extras
    feeds_avg = (sum(f.amount_ml for f in scheduled) / len(scheduled)) if scheduled else None
    feeds_remaining = max(0, feeds_per_day - len(scheduled))

    expected_so_far = per_feed_target * len(scheduled)
    gap_ml = feeds_total - expected_so_far  # extras count as "ahead" since total > expected

    pace_status = (
        pace_tier(gap_ml, expected_so_far)
        if daily_target > 0 and scheduled
        else "on_track"
    )

    interval = timedelta(hours=24 / feeds_per_day)

    next_feed: NextFeedHint | None = None
    expected_at: datetime | None = None
    if feeds_remaining > 0 and daily_target > 0:
        next_idx = len(scheduled) + 1
        cmp = historical_comparison(by_day, today, next_idx)
        catch_up = max(0.0, (daily_target - feeds_total) / feeds_remaining)
        # Adaptive expected-at: anchor first feed to feeding-day start,
        # subsequent feeds to (last scheduled feed time + interval). This
        # follows the actual rhythm rather than the rigid grid, so a 30-min
        # late feed shifts the next slot by 30 min too.
        if scheduled:
            last_feed_dt = scheduled[-1].fed_at
            expected_at = last_feed_dt + interval
        else:
            expected_at = today_start
        next_feed = NextFeedHint(
            feed_index=next_idx,
            target_ml=round(catch_up, 1),
            base_target_ml=per_feed_target,
            historical_avg_ml=cmp.avg_ml,
            expected_at=expected_at,
        )

    # Schedule drift: how late/early the actual scheduled feeds are running
    # vs the rigid grid (anchor + interval × (i-1)). Average minutes across
    # today's scheduled feeds.
    schedule_drift_min: int | None = None
    if scheduled:
        diffs = []
        for i, f in enumerate(scheduled, start=1):
            grid_at = today_start + interval * (i - 1)
            diff_sec = (f.fed_at - grid_at).total_seconds()
            diffs.append(diff_sec)
        schedule_drift_min = int(round(sum(diffs) / len(diffs) / 60))

    # Project where the last feed of today would land if we continue at the
    # current adaptive cadence. Compare to feeding_day_end (next anchor).
    projected_last: datetime | None = None
    day_fit = "n/a"
    if expected_at is not None and feeds_remaining > 0:
        projected_last = expected_at + interval * (feeds_remaining - 1)
        margin = (today_end - projected_last).total_seconds() / 60  # minutes of buffer before day rolls
        if margin >= 30:
            day_fit = "fits"
        elif margin >= 0:
            day_fit = "tight"
        else:
            day_fit = "overflow"
    elif feeds_remaining == 0 and scheduled:
        day_fit = "fits"  # all done, no question of fit

    breast_today = [f for f in feeds_with_cmp if f.method == "breast"]
    return Dashboard(
        today_date=today.isoformat(),
        feeding_day_start=today_start,
        feeding_day_end=today_end,
        daily_target_ml=daily_target,
        per_feed_target_ml=per_feed_target,
        feeds_today=feeds_with_cmp,
        feeds_total_ml=round(feeds_total, 1),
        feeds_avg_ml=round(feeds_avg, 1) if feeds_avg is not None else None,
        feeds_remaining=feeds_remaining,
        pace_status=pace_status,
        gap_ml=round(gap_ml, 1),
        schedule_drift_min=schedule_drift_min,
        projected_last_feed_at=projected_last,
        day_fit=day_fit,
        pumps_today_ml=round(sum(p["amount_ml"] for p in pump_rows), 1),
        pumps_today_count=len(pump_rows),
        diapers_today=diaper_summary,
        breastfeeds_today_count=len(breast_today),
        breastfeeds_today_ml_est=round(sum(f.amount_ml for f in breast_today), 1),
        breastfeeds_today_minutes=sum(f.duration_min or 0 for f in breast_today),
        next_feed=next_feed,
        weight=weight_status,
    )

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

FEEDS_PER_DAY = 8


def _read_anchor() -> tuple[int, int]:
    s = repo.get_settings()
    return int(s.get("day_start_hour", "2")), int(s.get("day_start_minute", "30"))


@router.get("/dashboard")
def get_dashboard() -> Dashboard:
    anchor_h, anchor_m = _read_anchor()
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

    feeds_with_cmp: list[FeedWithComparison] = []
    for f in todays_feeds:
        idx = f["feed_index"]
        cmp = historical_comparison(by_day, today, idx)
        feed = Feed(
            id=f["id"],
            fed_at=f["fed_at"] if hasattr(f["fed_at"], "isoformat") else f["fed_at"],
            amount_ml=f["amount_ml"],
            notes=f["notes"],
        )
        from ..comparisons import status_for

        feeds_with_cmp.append(
            FeedWithComparison(
                **feed.model_dump(),
                feed_index=idx,
                comparison=cmp,
                status=status_for(feed.amount_ml, cmp, cfg.comparison_threshold_pct),
            )
        )

    feeds_total = sum(f.amount_ml for f in feeds_with_cmp)
    feeds_avg = (feeds_total / len(feeds_with_cmp)) if feeds_with_cmp else None
    feeds_remaining = max(0, FEEDS_PER_DAY - len(feeds_with_cmp))

    expected_so_far = per_feed_target * len(feeds_with_cmp)
    gap_ml = feeds_total - expected_so_far  # positive = ahead, negative = behind

    pace_status = "on_track"
    if daily_target > 0 and feeds_with_cmp:
        tol = expected_so_far * (cfg.comparison_threshold_pct / 100)
        if gap_ml < -tol:
            pace_status = "behind"
        elif gap_ml > tol:
            pace_status = "ahead"

    next_feed: NextFeedHint | None = None
    if feeds_remaining > 0 and daily_target > 0:
        next_idx = len(feeds_with_cmp) + 1
        cmp = historical_comparison(by_day, today, next_idx)
        catch_up = max(0.0, (daily_target - feeds_total) / feeds_remaining)
        next_feed = NextFeedHint(
            feed_index=next_idx,
            target_ml=round(catch_up, 1),
            base_target_ml=per_feed_target,
            historical_avg_ml=cmp.avg_ml,
        )

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
        pumps_today_ml=round(sum(p["amount_ml"] for p in pump_rows), 1),
        pumps_today_count=len(pump_rows),
        diapers_today=diaper_summary,
        next_feed=next_feed,
        weight=weight_status,
    )

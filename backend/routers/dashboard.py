from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from .. import repo
from ..auth import require_auth
from ..comparisons import (
    TZ,
    historical_comparison,
    index_feeds_by_day,
    local_date,
    now_local,
    status_for,
)
from ..config import settings
from ..models import (
    Dashboard,
    Feed,
    FeedWithComparison,
    NextFeedHint,
)
from . import weight as weight_router

router = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(require_auth)])


@router.get("/dashboard")
def get_dashboard() -> Dashboard:
    today = local_date(now_local())
    history_start = today - timedelta(days=8)
    end = today + timedelta(days=1)

    start_iso = datetime.combine(history_start, datetime.min.time(), tzinfo=TZ).isoformat()
    end_iso = datetime.combine(end, datetime.min.time(), tzinfo=TZ).isoformat()

    feed_rows = repo.list_feeds_between(start_iso, end_iso)
    by_day = index_feeds_by_day(feed_rows)
    todays_feeds = sorted(by_day.get(today, []), key=lambda r: r["fed_at"])

    pump_rows = repo.list_pumps_between(
        datetime.combine(today, datetime.min.time(), tzinfo=TZ).isoformat(),
        end_iso,
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
            fed_at=datetime.fromisoformat(f["fed_at"]),
            amount_ml=f["amount_ml"],
            notes=f["notes"],
        )
        feeds_with_cmp.append(
            FeedWithComparison(
                **feed.model_dump(),
                feed_index=idx,
                comparison=cmp,
                status=status_for(feed.amount_ml, cmp, settings.comparison_threshold_pct),
            )
        )

    feeds_total = sum(f.amount_ml for f in feeds_with_cmp)
    feeds_avg = (feeds_total / len(feeds_with_cmp)) if feeds_with_cmp else None
    feeds_remaining = max(0, 8 - len(feeds_with_cmp))

    pace_status = "on_track"
    if daily_target > 0 and feeds_with_cmp:
        elapsed_feeds = len(feeds_with_cmp)
        expected_so_far = per_feed_target * elapsed_feeds
        if feeds_total < expected_so_far * (1 - settings.comparison_threshold_pct / 100):
            pace_status = "behind"
        elif feeds_total > expected_so_far * (1 + settings.comparison_threshold_pct / 100):
            pace_status = "ahead"

    next_feed: NextFeedHint | None = None
    if feeds_remaining > 0 and daily_target > 0:
        next_idx = len(feeds_with_cmp) + 1
        cmp = historical_comparison(by_day, today, next_idx)
        next_feed = NextFeedHint(
            feed_index=next_idx,
            target_ml=per_feed_target,
            historical_avg_ml=cmp.avg_ml,
        )

    return Dashboard(
        today_date=today.isoformat(),
        daily_target_ml=daily_target,
        per_feed_target_ml=per_feed_target,
        feeds_today=feeds_with_cmp,
        feeds_total_ml=round(feeds_total, 1),
        feeds_avg_ml=round(feeds_avg, 1) if feeds_avg is not None else None,
        feeds_remaining=feeds_remaining,
        pace_status=pace_status,
        pumps_today_ml=round(sum(p["amount_ml"] for p in pump_rows), 1),
        pumps_today_count=len(pump_rows),
        next_feed=next_feed,
        weight=weight_status,
    )

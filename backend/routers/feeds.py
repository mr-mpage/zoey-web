from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import repo
from ..auth import require_auth, require_edit
from ..comparisons import TZ, now_local
from ..models import Feed, FeedIn, FeedPatch

router = APIRouter(prefix="/api/feeds", tags=["feeds"], dependencies=[Depends(require_auth)])

FUTURE_TOLERANCE = timedelta(minutes=10)


def _normalize_time(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    if dt > now_local() + FUTURE_TOLERANCE:
        raise HTTPException(status_code=422, detail="fed_at cannot be in the future")
    return dt


def _row_to_feed(row: dict) -> Feed:
    return Feed(
        id=row["id"],
        fed_at=datetime.fromisoformat(row["fed_at"]),
        amount_ml=row["amount_ml"],
        notes=row["notes"],
        is_extra=bool(row.get("is_extra", 0)),
        method=row.get("method") or "bottle",
        duration_min=row.get("duration_min"),
        feeding_day_override=row.get("feeding_day_override"),
    )


@router.get("")
def list_feeds(
    days: int = Query(default=7, ge=1, le=730),
) -> list[Feed]:
    end = now_local() + timedelta(days=1)
    start = (now_local() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = repo.list_feeds_between(start.isoformat(), end.isoformat())
    return [_row_to_feed(r) for r in rows]


@router.post("", status_code=201, dependencies=[Depends(require_edit)])
def create_feed(payload: FeedIn) -> Feed:
    fed_at = _normalize_time(payload.fed_at) or now_local()
    new_id = repo.insert_feed(
        fed_at, payload.amount_ml, payload.notes, payload.is_extra, payload.method, payload.duration_min,
        payload.feeding_day_override,
    )
    return Feed(
        id=new_id,
        fed_at=fed_at,
        amount_ml=payload.amount_ml,
        notes=payload.notes,
        is_extra=payload.is_extra,
        method=payload.method,
        duration_min=payload.duration_min,
        feeding_day_override=payload.feeding_day_override,
    )


@router.patch("/{feed_id}", dependencies=[Depends(require_edit)])
def patch_feed(feed_id: int, payload: FeedPatch) -> dict:
    fed_at = _normalize_time(payload.fed_at)
    # Treat empty-string feeding_day_override as 'clear'; non-empty as 'set'.
    clear_override = payload.feeding_day_override == ""
    new_override = payload.feeding_day_override if payload.feeding_day_override else None
    ok = repo.update_feed(
        feed_id, fed_at, payload.amount_ml, payload.notes, payload.is_extra, payload.method, payload.duration_min,
        feeding_day_override=new_override,
        clear_feeding_day_override=clear_override,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Feed not found")
    return {"ok": True}


@router.delete("/{feed_id}", dependencies=[Depends(require_edit)])
def delete_feed(feed_id: int) -> dict:
    ok = repo.delete_feed(feed_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Feed not found")
    return {"ok": True}

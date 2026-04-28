from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import repo
from ..auth import require_auth
from ..comparisons import TZ, now_local
from ..models import Feed, FeedIn, FeedPatch

router = APIRouter(prefix="/api/feeds", tags=["feeds"], dependencies=[Depends(require_auth)])


def _row_to_feed(row: dict) -> Feed:
    return Feed(
        id=row["id"],
        fed_at=datetime.fromisoformat(row["fed_at"]),
        amount_ml=row["amount_ml"],
        notes=row["notes"],
    )


@router.get("")
def list_feeds(
    days: int = Query(default=7, ge=1, le=90),
) -> list[Feed]:
    end = now_local() + timedelta(days=1)
    start = (now_local() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = repo.list_feeds_between(start.isoformat(), end.isoformat())
    return [_row_to_feed(r) for r in rows]


@router.post("", status_code=201)
def create_feed(payload: FeedIn) -> Feed:
    fed_at = payload.fed_at or now_local()
    if fed_at.tzinfo is None:
        fed_at = fed_at.replace(tzinfo=TZ)
    new_id = repo.insert_feed(fed_at, payload.amount_ml, payload.notes)
    return Feed(id=new_id, fed_at=fed_at, amount_ml=payload.amount_ml, notes=payload.notes)


@router.patch("/{feed_id}")
def patch_feed(feed_id: int, payload: FeedPatch) -> dict:
    fed_at = payload.fed_at
    if fed_at is not None and fed_at.tzinfo is None:
        fed_at = fed_at.replace(tzinfo=TZ)
    ok = repo.update_feed(feed_id, fed_at, payload.amount_ml, payload.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="Feed not found")
    return {"ok": True}


@router.delete("/{feed_id}")
def delete_feed(feed_id: int) -> dict:
    ok = repo.delete_feed(feed_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Feed not found")
    return {"ok": True}

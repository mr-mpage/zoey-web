from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import repo
from ..auth import require_auth
from ..comparisons import TZ, now_local
from ..models import Diaper, DiaperIn, DiaperPatch

router = APIRouter(prefix="/api/diapers", tags=["diapers"], dependencies=[Depends(require_auth)])

FUTURE_TOLERANCE = timedelta(minutes=10)


def _normalize_time(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    if dt > now_local() + FUTURE_TOLERANCE:
        raise HTTPException(status_code=422, detail="recorded_at cannot be in the future")
    return dt


def _row_to_diaper(row: dict) -> Diaper:
    return Diaper(
        id=row["id"],
        recorded_at=datetime.fromisoformat(row["recorded_at"]),
        kind=row["kind"],
        notes=row["notes"],
    )


@router.get("")
def list_diapers(days: int = Query(default=7, ge=1, le=90)) -> list[Diaper]:
    end = now_local() + timedelta(days=1)
    start = (now_local() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = repo.list_diapers_between(start.isoformat(), end.isoformat())
    return [_row_to_diaper(r) for r in rows]


@router.post("", status_code=201)
def create_diaper(payload: DiaperIn) -> Diaper:
    recorded_at = _normalize_time(payload.recorded_at) or now_local()
    new_id = repo.insert_diaper(recorded_at, payload.kind, payload.notes)
    return Diaper(id=new_id, recorded_at=recorded_at, kind=payload.kind, notes=payload.notes)


@router.patch("/{diaper_id}")
def patch_diaper(diaper_id: int, payload: DiaperPatch) -> dict:
    recorded_at = _normalize_time(payload.recorded_at)
    ok = repo.update_diaper(diaper_id, recorded_at, payload.kind, payload.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="Diaper not found")
    return {"ok": True}


@router.delete("/{diaper_id}")
def delete_diaper(diaper_id: int) -> dict:
    ok = repo.delete_diaper(diaper_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Diaper not found")
    return {"ok": True}

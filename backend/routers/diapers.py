from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import repo
from ..auth import require_auth, require_edit
from ..comparisons import TZ, normalize_event_time, now_local
from ..models import Diaper, DiaperIn, DiaperPatch

router = APIRouter(prefix="/api/diapers", tags=["diapers"], dependencies=[Depends(require_auth)])


def _normalize_time(dt: datetime | None) -> datetime | None:
    return normalize_event_time(dt, field_name="recorded_at")


def _row_to_diaper(row: dict) -> Diaper:
    return Diaper(
        id=row["id"],
        recorded_at=datetime.fromisoformat(row["recorded_at"]),
        kind=row["kind"],
        notes=row["notes"],
    )


@router.get("")
def list_diapers(days: int = Query(default=7, ge=1, le=730)) -> list[Diaper]:
    end = now_local() + timedelta(days=1)
    start = (now_local() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = repo.list_diapers_between(start.isoformat(), end.isoformat())
    return [_row_to_diaper(r) for r in rows]


@router.post("", status_code=201, dependencies=[Depends(require_edit)])
def create_diaper(payload: DiaperIn) -> Diaper:
    recorded_at = _normalize_time(payload.recorded_at) or now_local()
    new_id = repo.insert_diaper(recorded_at, payload.kind, payload.notes)
    return Diaper(id=new_id, recorded_at=recorded_at, kind=payload.kind, notes=payload.notes)


@router.patch("/{diaper_id}", dependencies=[Depends(require_edit)])
def patch_diaper(diaper_id: int, payload: DiaperPatch) -> dict:
    recorded_at = _normalize_time(payload.recorded_at)
    ok = repo.update_diaper(diaper_id, recorded_at, payload.kind, payload.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="Diaper not found")
    return {"ok": True}


@router.delete("/{diaper_id}", dependencies=[Depends(require_edit)])
def delete_diaper(diaper_id: int) -> dict:
    ok = repo.delete_diaper(diaper_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Diaper not found")
    return {"ok": True}

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import repo
from ..auth import require_auth, require_edit
from ..comparisons import TZ, normalize_event_time, now_local
from ..models import Pump, PumpIn, PumpPatch

router = APIRouter(prefix="/api/pumps", tags=["pumps"], dependencies=[Depends(require_auth)])


def _normalize_time(dt: datetime | None) -> datetime | None:
    return normalize_event_time(dt, field_name="pumped_at")


def _row_to_pump(row: dict) -> Pump:
    return Pump(
        id=row["id"],
        pumped_at=datetime.fromisoformat(row["pumped_at"]),
        amount_ml=row["amount_ml"],
        notes=row["notes"],
    )


@router.get("")
def list_pumps(days: int = Query(default=7, ge=1, le=730)) -> list[Pump]:
    end = now_local() + timedelta(days=1)
    start = (now_local() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = repo.list_pumps_between(start.isoformat(), end.isoformat())
    return [_row_to_pump(r) for r in rows]


@router.post("", status_code=201, dependencies=[Depends(require_edit)])
def create_pump(payload: PumpIn) -> Pump:
    pumped_at = _normalize_time(payload.pumped_at) or now_local()
    new_id = repo.insert_pump(pumped_at, payload.amount_ml, payload.notes)
    return Pump(id=new_id, pumped_at=pumped_at, amount_ml=payload.amount_ml, notes=payload.notes)


@router.patch("/{pump_id}", dependencies=[Depends(require_edit)])
def patch_pump(pump_id: int, payload: PumpPatch) -> dict:
    pumped_at = _normalize_time(payload.pumped_at)
    ok = repo.update_pump(pump_id, pumped_at, payload.amount_ml, payload.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="Pump not found")
    return {"ok": True}


@router.delete("/{pump_id}", dependencies=[Depends(require_edit)])
def delete_pump(pump_id: int) -> dict:
    ok = repo.delete_pump(pump_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Pump not found")
    return {"ok": True}

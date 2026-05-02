from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import repo, services
from ..auth import require_auth, require_edit
from ..comparisons import TZ, now_local
from ..models import Weight, WeightIn, WeightStatus

router = APIRouter(prefix="/api/weight", tags=["weight"], dependencies=[Depends(require_auth)])


class WeightPatch(BaseModel):
    recorded_at: datetime | None = None
    weight_grams: int | None = Field(default=None, gt=500, lt=20000)
    ml_per_kg_per_day: int | None = Field(default=None, gt=50, lt=300)
    notes: str | None = None


def _row_to_weight(row: dict) -> Weight:
    return Weight(
        id=row["id"],
        recorded_at=datetime.fromisoformat(row["recorded_at"]),
        weight_grams=row["weight_grams"],
        ml_per_kg_per_day=row["ml_per_kg_per_day"],
        notes=row["notes"],
        is_auto=bool(row.get("is_auto")),
    )


def _reject_if_auto(weight_id: int) -> None:
    row = repo.get_weight(weight_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Weight not found")
    if row.get("is_auto"):
        raise HTTPException(status_code=400, detail="Auto-estimated entries can't be edited; add a manual weight to override.")


def compute_status() -> WeightStatus:
    services.ensure_auto_weights_through_today()
    latest = repo.latest_weight()
    history = [_row_to_weight(r) for r in repo.list_weights()]
    fpd = int(repo.get_settings().get("feeds_per_day", "8"))
    if latest is None:
        return WeightStatus(current=None, daily_target_ml=0.0, per_feed_target_ml=0.0, feeds_per_day=fpd, history=history)
    daily = latest["weight_grams"] / 1000 * latest["ml_per_kg_per_day"]
    return WeightStatus(
        current=_row_to_weight(latest),
        daily_target_ml=round(daily, 1),
        per_feed_target_ml=round(daily / fpd, 1),
        feeds_per_day=fpd,
        history=history,
    )


@router.get("")
def get_weight() -> WeightStatus:
    return compute_status()


@router.post("", status_code=201, dependencies=[Depends(require_edit)])
def post_weight(payload: WeightIn) -> Weight:
    recorded_at = now_local()
    new_id = repo.insert_weight(recorded_at, payload.weight_grams, payload.ml_per_kg_per_day, payload.notes)
    services.regenerate_auto_weights()
    return Weight(
        id=new_id,
        recorded_at=recorded_at.astimezone(TZ),
        weight_grams=payload.weight_grams,
        ml_per_kg_per_day=payload.ml_per_kg_per_day,
        notes=payload.notes,
    )


@router.patch("/{weight_id}", dependencies=[Depends(require_edit)])
def patch_weight(weight_id: int, payload: WeightPatch) -> dict:
    _reject_if_auto(weight_id)
    recorded_at = payload.recorded_at
    if recorded_at is not None and recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=TZ)
    ok = repo.update_weight(weight_id, recorded_at, payload.weight_grams, payload.ml_per_kg_per_day, payload.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="Weight not found")
    services.regenerate_auto_weights()
    return {"ok": True}


@router.delete("/{weight_id}", dependencies=[Depends(require_edit)])
def delete_weight(weight_id: int) -> dict:
    _reject_if_auto(weight_id)
    ok = repo.delete_weight(weight_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Weight not found")
    services.regenerate_auto_weights()
    return {"ok": True}

from datetime import datetime

from fastapi import APIRouter, Depends

from .. import repo
from ..auth import require_auth
from ..comparisons import TZ, now_local
from ..models import Weight, WeightIn, WeightStatus

router = APIRouter(prefix="/api/weight", tags=["weight"], dependencies=[Depends(require_auth)])


def _row_to_weight(row: dict) -> Weight:
    return Weight(
        id=row["id"],
        recorded_at=datetime.fromisoformat(row["recorded_at"]),
        weight_grams=row["weight_grams"],
        ml_per_kg_per_day=row["ml_per_kg_per_day"],
        notes=row["notes"],
    )


def compute_status() -> WeightStatus:
    latest = repo.latest_weight()
    history = [_row_to_weight(r) for r in repo.list_weights()]
    if latest is None:
        return WeightStatus(current=None, daily_target_ml=0.0, per_feed_target_ml=0.0, history=history)
    daily = latest["weight_grams"] / 1000 * latest["ml_per_kg_per_day"]
    return WeightStatus(
        current=_row_to_weight(latest),
        daily_target_ml=round(daily, 1),
        per_feed_target_ml=round(daily / 8, 1),
        history=history,
    )


@router.get("")
def get_weight() -> WeightStatus:
    return compute_status()


@router.post("", status_code=201)
def post_weight(payload: WeightIn) -> Weight:
    recorded_at = now_local()
    new_id = repo.insert_weight(recorded_at, payload.weight_grams, payload.ml_per_kg_per_day, payload.notes)
    return Weight(
        id=new_id,
        recorded_at=recorded_at.astimezone(TZ),
        weight_grams=payload.weight_grams,
        ml_per_kg_per_day=payload.ml_per_kg_per_day,
        notes=payload.notes,
    )

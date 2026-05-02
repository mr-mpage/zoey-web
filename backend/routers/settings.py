from fastapi import APIRouter, Depends

from .. import repo
from ..auth import require_auth, require_edit
from ..db import DEFAULTS
from ..models import AppSettings, AppSettingsPatch

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_auth)])

# Public sub-router: a tiny no-auth endpoint so the lock screen can show
# the configured baby name before the user signs in. Names aren't sensitive,
# and the lock screen renders the value into the public HTML anyway.
public_router = APIRouter(prefix="/api/public", tags=["settings"])


@public_router.get("/baby-name")
def public_baby_name() -> dict[str, str]:
    return {"baby_name": repo.get_settings().get("baby_name") or DEFAULTS["baby_name"]}


def _get(s: dict[str, str], key: str) -> str:
    """Read a settings key, falling back to the seed dict in db.py rather
    than re-stating defaults inline. init_db seeds these on first boot;
    the fallback only matters in test setups that skip init."""
    return s.get(key, DEFAULTS.get(key, ""))


def _current() -> AppSettings:
    s = repo.get_settings()
    return AppSettings(
        baby_name=_get(s, "baby_name") or "Baby",
        parent_names=_get(s, "parent_names"),
        day_start_hour=int(_get(s, "day_start_hour")),
        day_start_minute=int(_get(s, "day_start_minute")),
        feeds_per_day=int(_get(s, "feeds_per_day")),
        bottle_prep_ml=int(_get(s, "bottle_prep_ml")),
        target_concern_ml_per_kg=int(_get(s, "target_concern_ml_per_kg")),
        target_low_ml_per_kg=int(_get(s, "target_low_ml_per_kg")),
        target_solid_ml_per_kg=int(_get(s, "target_solid_ml_per_kg")),
        target_high_ml_per_kg=int(_get(s, "target_high_ml_per_kg")),
        birth_date=_get(s, "birth_date"),
        gestational_age_weeks=int(_get(s, "gestational_age_weeks") or "40"),
        birth_weight_grams=int(_get(s, "birth_weight_grams") or "3000"),
    )


@router.get("")
def get_settings() -> AppSettings:
    return _current()


@router.patch("", dependencies=[Depends(require_edit)])
def patch_settings(payload: AppSettingsPatch) -> AppSettings:
    updates: dict[str, str] = {}
    if payload.baby_name is not None:
        updates["baby_name"] = payload.baby_name.strip()
    if payload.parent_names is not None:
        updates["parent_names"] = payload.parent_names.strip()
    if payload.day_start_hour is not None:
        updates["day_start_hour"] = str(payload.day_start_hour)
    if payload.day_start_minute is not None:
        updates["day_start_minute"] = str(payload.day_start_minute)
    if payload.feeds_per_day is not None:
        updates["feeds_per_day"] = str(payload.feeds_per_day)
    if payload.bottle_prep_ml is not None:
        updates["bottle_prep_ml"] = str(payload.bottle_prep_ml)
    if payload.target_concern_ml_per_kg is not None:
        updates["target_concern_ml_per_kg"] = str(payload.target_concern_ml_per_kg)
    if payload.target_low_ml_per_kg is not None:
        updates["target_low_ml_per_kg"] = str(payload.target_low_ml_per_kg)
    if payload.target_solid_ml_per_kg is not None:
        updates["target_solid_ml_per_kg"] = str(payload.target_solid_ml_per_kg)
    if payload.target_high_ml_per_kg is not None:
        updates["target_high_ml_per_kg"] = str(payload.target_high_ml_per_kg)
    if payload.birth_date is not None:
        updates["birth_date"] = payload.birth_date
    if payload.gestational_age_weeks is not None:
        updates["gestational_age_weeks"] = str(payload.gestational_age_weeks)
    if payload.birth_weight_grams is not None:
        updates["birth_weight_grams"] = str(payload.birth_weight_grams)
    if updates:
        repo.set_settings(updates)
    return _current()

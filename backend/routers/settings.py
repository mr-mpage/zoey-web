from fastapi import APIRouter, Depends

from .. import repo
from ..auth import require_auth
from ..models import AppSettings, AppSettingsPatch

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_auth)])


def _current() -> AppSettings:
    s = repo.get_settings()
    return AppSettings(
        day_start_hour=int(s.get("day_start_hour", "2")),
        day_start_minute=int(s.get("day_start_minute", "30")),
    )


@router.get("")
def get_settings() -> AppSettings:
    return _current()


@router.patch("")
def patch_settings(payload: AppSettingsPatch) -> AppSettings:
    updates: dict[str, str] = {}
    if payload.day_start_hour is not None:
        updates["day_start_hour"] = str(payload.day_start_hour)
    if payload.day_start_minute is not None:
        updates["day_start_minute"] = str(payload.day_start_minute)
    if updates:
        repo.set_settings(updates)
    return _current()

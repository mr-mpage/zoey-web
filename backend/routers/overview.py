from fastapi import APIRouter, Depends

from ..auth import require_auth
from ..models import Overview
from ..services import compute_overview

router = APIRouter(prefix="/api", tags=["overview"], dependencies=[Depends(require_auth)])


@router.get("/overview", response_model=Overview)
def get_overview() -> Overview:
    return compute_overview()

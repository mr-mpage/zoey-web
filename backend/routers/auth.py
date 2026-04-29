import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from .. import repo
from ..auth import (
    COOKIE_MAX_AGE_EDIT,
    COOKIE_MAX_AGE_VIEW,
    COOKIE_NAME,
    auth_mode,
    check_rate_limit,
    clear_attempts,
    client_ip,
    issue_token,
    record_failed_attempt,
    require_auth,
    require_edit,
    touch_viewer_last_seen,
    verify_passcode,
    verify_viewer_passcode,
)
from ..comparisons import now_local
from ..models import LoginIn, ViewerPasscode, ViewerPasscodeIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response) -> dict:
    ip = client_ip(request)
    check_rate_limit(ip)

    if verify_passcode(payload.passcode):
        clear_attempts(ip)
        token = issue_token("edit")
        response.set_cookie(
            key=COOKIE_NAME,
            value=token,
            max_age=COOKIE_MAX_AGE_EDIT,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        return {"authenticated": True, "mode": "edit"}

    label = verify_viewer_passcode(payload.passcode)
    if label is not None:
        clear_attempts(ip)
        repo.update_viewer_last_seen(label, now_local())
        token = issue_token(f"view:{label}")
        response.set_cookie(
            key=COOKIE_NAME,
            value=token,
            max_age=COOKIE_MAX_AGE_VIEW,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        return {"authenticated": True, "mode": "view", "label": label}

    record_failed_attempt(ip)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong passcode")


@router.post("/logout")
def logout(response: Response, _: str = Depends(require_auth)) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"authenticated": False}


@router.get("/me")
def me(request: Request) -> dict:
    mode = auth_mode(request)
    if mode is None:
        return {"authenticated": False}
    if mode == "edit":
        return {"authenticated": True, "mode": "edit"}
    label = mode.split(":", 1)[1] if ":" in mode else None
    # Bump the last-seen marker so the editor can see when each viewer
    # last looked. Cheap (one UPDATE) and gives the audit-trail benefit
    # without a full users system.
    touch_viewer_last_seen(mode)
    return {"authenticated": True, "mode": "view", "label": label}


@router.get("/viewer-passcodes", response_model=list[ViewerPasscode])
def list_viewers(_: None = Depends(require_edit)) -> list[ViewerPasscode]:
    return [
        ViewerPasscode(
            id=v["id"],
            label=v["label"],
            last_seen_at=v["last_seen_at"],
            created_at=v["created_at"],
        )
        for v in repo.list_viewer_passcodes()
    ]


@router.post("/viewer-passcodes", response_model=ViewerPasscode, status_code=201)
def create_viewer(payload: ViewerPasscodeIn, _: None = Depends(require_edit)) -> ViewerPasscode:
    label = payload.label.strip().lower()
    if not label:
        raise HTTPException(status_code=422, detail="Label cannot be empty")
    if repo.get_viewer_passcode_by_label(label):
        raise HTTPException(status_code=409, detail="Label already exists")
    h = bcrypt.hashpw(payload.passcode.encode(), bcrypt.gensalt()).decode()
    new_id = repo.create_viewer_passcode(label, h, now_local())
    return ViewerPasscode(id=new_id, label=label, last_seen_at=None, created_at=now_local().isoformat())


@router.delete("/viewer-passcodes/{viewer_id}")
def delete_viewer(viewer_id: int, _: None = Depends(require_edit)) -> dict:
    if not repo.delete_viewer_passcode(viewer_id):
        raise HTTPException(status_code=404, detail="Viewer not found")
    return {"ok": True}

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..auth import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    check_rate_limit,
    clear_attempts,
    client_ip,
    issue_token,
    record_failed_attempt,
    require_auth,
    token_valid,
    verify_passcode,
)
from ..models import LoginIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response) -> dict:
    ip = client_ip(request)
    check_rate_limit(ip)
    if not verify_passcode(payload.passcode):
        record_failed_attempt(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong passcode")
    clear_attempts(ip)
    token = issue_token()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return {"authenticated": True}


@router.post("/logout")
def logout(response: Response, _: None = Depends(require_auth)) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"authenticated": False}


@router.get("/me")
def me(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    return {"authenticated": bool(token and token_valid(token))}

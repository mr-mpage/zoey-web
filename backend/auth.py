import time
from collections import defaultdict, deque
from typing import Deque

import bcrypt
from fastapi import HTTPException, Request, status
from itsdangerous import BadSignature, TimestampSigner

from .config import settings

_signer = TimestampSigner(settings.session_secret)
COOKIE_NAME = "zoey_session"
COOKIE_MAX_AGE = settings.session_max_age_days * 24 * 60 * 60

_attempts: dict[str, Deque[float]] = defaultdict(deque)


def verify_passcode(passcode: str) -> bool:
    if not settings.zoey_passcode_hash:
        return False
    try:
        return bcrypt.checkpw(passcode.encode(), settings.zoey_passcode_hash.encode())
    except ValueError:
        return False


def issue_token() -> str:
    return _signer.sign(b"ok").decode()


def token_valid(token: str) -> bool:
    try:
        _signer.unsign(token.encode(), max_age=COOKIE_MAX_AGE)
        return True
    except BadSignature:
        return False


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(ip: str) -> None:
    window = settings.rate_limit_window_min * 60
    now = time.time()
    bucket = _attempts[ip]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= settings.rate_limit_max_attempts:
        retry_after = int(window - (now - bucket[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Try again in {retry_after // 60 + 1} min.",
            headers={"Retry-After": str(retry_after)},
        )


def record_failed_attempt(ip: str) -> None:
    _attempts[ip].append(time.time())


def clear_attempts(ip: str) -> None:
    _attempts.pop(ip, None)


def require_auth(request: Request) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if not token or not token_valid(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

import time
from collections import defaultdict, deque
from typing import Deque, Optional

import bcrypt
from fastapi import HTTPException, Request, status
from itsdangerous import BadSignature, TimestampSigner

from . import repo
from .comparisons import now_local
from .config import settings

_signer = TimestampSigner(settings.session_secret)
COOKIE_NAME = "zoey_session"
COOKIE_MAX_AGE_EDIT = settings.session_max_age_days * 24 * 60 * 60
COOKIE_MAX_AGE_VIEW = settings.viewer_session_max_age_days * 24 * 60 * 60

_attempts: dict[str, Deque[float]] = defaultdict(deque)


def verify_passcode(passcode: str) -> bool:
    if not settings.zoey_passcode_hash:
        return False
    try:
        return bcrypt.checkpw(passcode.encode(), settings.zoey_passcode_hash.encode())
    except ValueError:
        return False


_DUMMY_HASH = bcrypt.hashpw(b"placeholder", bcrypt.gensalt(rounds=12))


def verify_viewer_passcode(passcode: str) -> Optional[str]:
    """Returns the matching viewer's label, or None.

    Walks the full list rather than short-circuiting so the response time
    doesn't leak how many viewer passcodes are configured. If no rows
    exist, runs one dummy bcrypt so the no-viewers case takes roughly
    the same time as the one-viewer case."""
    matched_label: Optional[str] = None
    rows = repo.list_viewer_passcodes()
    if not rows:
        bcrypt.checkpw(passcode.encode(), _DUMMY_HASH)
        return None
    for v in rows:
        try:
            if bcrypt.checkpw(passcode.encode(), v["passcode_hash"].encode()) and matched_label is None:
                matched_label = v["label"]
        except ValueError:
            continue
    return matched_label


def issue_token(payload: str = "edit") -> str:
    return _signer.sign(payload.encode()).decode()


def auth_mode(request: Request) -> Optional[str]:
    """Returns the auth payload from the cookie, or None.

    Payload is either ``'edit'`` (full-access session) or ``'view:<label>'``
    (read-only session for the named viewer). View sessions use a shorter
    max age, so we re-validate against that window when the payload starts
    with ``view``.
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = _signer.unsign(token.encode(), max_age=COOKIE_MAX_AGE_EDIT).decode()
    except BadSignature:
        return None
    if payload.startswith("view"):
        try:
            _signer.unsign(token.encode(), max_age=COOKIE_MAX_AGE_VIEW)
        except BadSignature:
            return None
    return payload


def token_valid(token: str) -> bool:
    """Lightweight check used by the SPA fallback. Accepts either mode."""
    try:
        payload = _signer.unsign(token.encode(), max_age=COOKIE_MAX_AGE_EDIT).decode()
    except BadSignature:
        return False
    if payload.startswith("view"):
        try:
            _signer.unsign(token.encode(), max_age=COOKIE_MAX_AGE_VIEW)
        except BadSignature:
            return False
    return True


_TRUSTED_PROXIES = {p.strip() for p in settings.trusted_proxies.split(",") if p.strip()}


def client_ip(request: Request) -> str:
    """Resolve the client IP for rate-limiting.

    Honours X-Forwarded-For only when the immediate peer is in
    ``trusted_proxies`` (default: loopback). Otherwise an attacker
    hitting the FastAPI port directly could spoof XFF and bypass the
    per-IP attempt limiter."""
    peer = request.client.host if request.client else None
    if peer and peer in _TRUSTED_PROXIES:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return peer or "unknown"


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


def require_auth(request: Request) -> str:
    mode = auth_mode(request)
    if mode is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return mode


def require_edit(request: Request) -> None:
    """Reject view-only sessions. Use as a dependency on every mutation route."""
    mode = require_auth(request)
    if mode != "edit":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is read-only.",
        )


def touch_viewer_last_seen(mode: str) -> None:
    """Update last_seen_at for the matching viewer label, if any."""
    if mode and mode.startswith("view:"):
        label = mode.split(":", 1)[1]
        repo.update_viewer_last_seen(label, now_local())

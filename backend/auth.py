import ipaddress
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


def _is_view_payload(payload: str) -> bool:
    return payload.startswith("view:")


def _is_valid_payload(payload: str) -> bool:
    return payload == "edit" or _is_view_payload(payload)


def auth_mode(request: Request) -> Optional[str]:
    """Returns the auth payload from the cookie, or None.

    Payload is either ``'edit'`` (full-access session) or ``'view:<label>'``
    (read-only session for the named viewer). View sessions use a shorter
    max age, so we re-validate against that window when the payload is a
    view session.
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = _signer.unsign(token.encode(), max_age=COOKIE_MAX_AGE_EDIT).decode()
    except BadSignature:
        return None
    if not _is_valid_payload(payload):
        return None
    if _is_view_payload(payload):
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
    if not _is_valid_payload(payload):
        return False
    if _is_view_payload(payload):
        try:
            _signer.unsign(token.encode(), max_age=COOKIE_MAX_AGE_VIEW)
        except BadSignature:
            return False
    return True


def _parse_trusted_networks(raw: str) -> list[ipaddress._BaseNetwork]:
    """Parse comma-separated IPs and CIDRs into ip_network objects.

    A bare IP is treated as a /32 (or /128 for IPv6). Unparseable entries
    are skipped silently — bad config shouldn't take the app down, and
    refusing all XFF is the safe default."""
    nets: list[ipaddress._BaseNetwork] = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            nets.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            continue
    return nets


_TRUSTED_NETWORKS = _parse_trusted_networks(settings.trusted_proxies)


def _peer_is_trusted(peer: str) -> bool:
    try:
        addr = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return any(addr in net for net in _TRUSTED_NETWORKS)


def client_ip(request: Request) -> str:
    """Resolve the client IP for rate-limiting.

    Honours X-Forwarded-For only when the immediate peer falls in a
    network listed in ``trusted_proxies`` (default: loopback). Otherwise
    an attacker hitting the FastAPI port directly could spoof XFF and
    bypass the per-IP attempt limiter."""
    peer = request.client.host if request.client else None
    if peer and _peer_is_trusted(peer):
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

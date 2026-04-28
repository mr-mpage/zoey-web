"""Web Push (VAPID) sender — wraps pywebpush so callers don't import it directly."""

import json
import logging
from typing import Any

from pywebpush import WebPushException, webpush

from .config import settings

log = logging.getLogger(__name__)


class PushSendResult:
    OK = "ok"
    GONE = "gone"           # 404/410 — subscription expired, caller should delete
    ERROR = "error"


def send_push(sub_row: dict[str, Any], payload: dict[str, Any]) -> str:
    """Send a push to a single subscription.

    Returns one of PushSendResult.* strings. The caller decides what to do
    on GONE (typically: delete the subscription row).
    """
    if not settings.vapid_private_key:
        log.warning("send_push: VAPID_PRIVATE_KEY not configured; skipping")
        return PushSendResult.ERROR

    subscription_info = {
        "endpoint": sub_row["endpoint"],
        "keys": {"p256dh": sub_row["p256dh"], "auth": sub_row["auth"]},
    }
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": f"mailto:{settings.vapid_contact_email}"},
            ttl=600,  # 10 min — feed reminders aren't useful long after the moment
        )
        return PushSendResult.OK
    except WebPushException as e:
        status = e.response.status_code if e.response is not None else None
        if status in (404, 410):
            return PushSendResult.GONE
        log.warning("push send failed (status=%s): %s", status, e)
        return PushSendResult.ERROR
    except Exception as e:  # noqa: BLE001
        log.exception("push send unexpected error: %s", e)
        return PushSendResult.ERROR

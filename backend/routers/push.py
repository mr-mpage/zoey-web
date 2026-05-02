from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import repo
from ..auth import require_auth, require_edit
from ..comparisons import now_local
from ..config import settings
from ..models import PushSubscriptionIn, PushSubscriptionOut, VapidKeyOut
from ..push import PushSendResult, send_push

router = APIRouter(prefix="/api/push", tags=["push"], dependencies=[Depends(require_auth)])


@router.get("/vapid-key", response_model=VapidKeyOut)
def vapid_key() -> VapidKeyOut:
    if not settings.vapid_public_key:
        raise HTTPException(status_code=503, detail="Push not configured on server")
    return VapidKeyOut(vapid_public_key=settings.vapid_public_key)


@router.post("/subscribe", status_code=201, dependencies=[Depends(require_edit)])
def subscribe(payload: PushSubscriptionIn) -> dict:
    new_id = repo.insert_push_subscription(
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        label=payload.label,
        created_at=now_local(),
    )
    return {"id": new_id}


@router.delete("/subscribe/{sub_id}", dependencies=[Depends(require_edit)])
def unsubscribe(sub_id: int) -> dict:
    ok = repo.delete_push_subscription(sub_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"ok": True}


class _UnsubscribePayload(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


@router.post("/unsubscribe", dependencies=[Depends(require_edit)])
def unsubscribe_by_endpoint(payload: _UnsubscribePayload) -> dict:
    """Allow client to unsubscribe by endpoint when it doesn't know the id."""
    repo.delete_push_subscription_by_endpoint(payload.endpoint)
    return {"ok": True}


@router.get("", response_model=List[PushSubscriptionOut], dependencies=[Depends(require_edit)])
def list_subs() -> list[PushSubscriptionOut]:
    out: list[PushSubscriptionOut] = []
    for r in repo.list_push_subscriptions():
        out.append(
            PushSubscriptionOut(
                id=r["id"],
                label=r["label"],
                created_at=datetime.fromisoformat(r["created_at"]),
                last_notified_for=datetime.fromisoformat(r["last_notified_for"]) if r.get("last_notified_for") else None,
            )
        )
    return out


@router.post("/test", dependencies=[Depends(require_edit)])
def send_test() -> dict:
    """Send a test notification to all registered devices — useful for debugging."""
    subs = repo.list_push_subscriptions()
    if not subs:
        raise HTTPException(status_code=404, detail="No subscriptions registered")
    payload = {
        "title": "Zoey · test",
        "body": "Push notifications are working.",
        "tag": "zoey-test",
        "url": "/",
    }
    sent = 0
    removed = 0
    for sub in subs:
        result = send_push(sub, payload)
        if result == PushSendResult.OK:
            sent += 1
        elif result == PushSendResult.GONE:
            repo.delete_push_subscription(sub["id"])
            removed += 1
    return {"sent": sent, "removed_expired": removed, "total": len(subs)}

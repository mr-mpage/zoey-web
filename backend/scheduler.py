"""Background loop that fires push reminders ~15 min before the next feed."""

import asyncio
import logging
from datetime import timedelta

from . import repo
from .comparisons import now_local
from .config import settings
from .db import DEFAULTS
from .push import PushSendResult, send_push
from .services import compute_next_feed

log = logging.getLogger(__name__)


async def _tick() -> None:
    nf = compute_next_feed()
    if nf is None:
        return
    expected_at = nf["expected_at"]
    trigger_at = expected_at - timedelta(minutes=settings.push_lead_minutes)
    if now_local() < trigger_at:
        return  # too early — will check again next tick

    expected_iso = expected_at.isoformat()
    subs = repo.list_push_subscriptions()
    if not subs:
        return

    baby_name = repo.get_settings().get("baby_name") or DEFAULTS["baby_name"]
    payload = {
        "title": f"{baby_name} · next feed soon",
        "body": (
            f"Feed #{nf['feed_index']} at "
            f"{expected_at.astimezone().strftime('%H:%M')} · suggest {nf['target_ml']:.0f} ml"
        ),
        # Static tag (not derived from baby_name) so renaming the baby
        # mid-day doesn't fragment the notification stack on the device.
        "tag": "feed-reminder",
        "url": "/",
    }

    for sub in subs:
        if sub.get("last_notified_for") == expected_iso:
            continue
        result = await asyncio.to_thread(send_push, sub, payload)
        if result == PushSendResult.OK:
            repo.update_push_last_notified(sub["id"], expected_iso)
            log.info("push sent to sub %s for %s", sub["id"], expected_iso)
        elif result == PushSendResult.GONE:
            repo.delete_push_subscription(sub["id"])
            log.info("push sub %s expired (404/410), removed", sub["id"])


async def reminder_loop() -> None:
    log.info(
        "reminder loop started · lead=%s min · interval=%s s",
        settings.push_lead_minutes,
        settings.push_check_interval_s,
    )
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("scheduler tick failed")
        await asyncio.sleep(settings.push_check_interval_s)

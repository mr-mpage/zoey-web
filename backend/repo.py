"""Thin SQLite data-access helpers."""

from datetime import datetime
from typing import Optional

from .db import get_conn


def insert_feed(
    fed_at: datetime,
    amount_ml: float,
    notes: Optional[str],
    is_extra: bool = False,
    method: str = "bottle",
    duration_min: Optional[int] = None,
    feeding_day_override: Optional[str] = None,
) -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO feeds (fed_at, amount_ml, notes, is_extra, method, duration_min, feeding_day_override) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (fed_at.isoformat(), amount_ml, notes, 1 if is_extra else 0, method, duration_min, feeding_day_override),
        )
        return cur.lastrowid


def update_feed(
    feed_id: int,
    fed_at: Optional[datetime],
    amount_ml: Optional[float],
    notes: Optional[str],
    is_extra: Optional[bool] = None,
    method: Optional[str] = None,
    duration_min: Optional[int] = None,
    feeding_day_override: Optional[str] = None,
    clear_feeding_day_override: bool = False,
) -> bool:
    sets, args = [], []
    if fed_at is not None:
        sets.append("fed_at = ?")
        args.append(fed_at.isoformat())
    if amount_ml is not None:
        sets.append("amount_ml = ?")
        args.append(amount_ml)
    if notes is not None:
        sets.append("notes = ?")
        args.append(notes)
    if is_extra is not None:
        sets.append("is_extra = ?")
        args.append(1 if is_extra else 0)
    if method is not None:
        sets.append("method = ?")
        args.append(method)
    if duration_min is not None:
        sets.append("duration_min = ?")
        args.append(duration_min)
    if clear_feeding_day_override:
        sets.append("feeding_day_override = NULL")
    elif feeding_day_override is not None:
        sets.append("feeding_day_override = ?")
        args.append(feeding_day_override)
    if not sets:
        return True
    args.append(feed_id)
    with get_conn() as c:
        cur = c.execute(f"UPDATE feeds SET {', '.join(sets)} WHERE id = ?", args)
        return cur.rowcount > 0


def delete_feed(feed_id: int) -> bool:
    with get_conn() as c:
        cur = c.execute("DELETE FROM feeds WHERE id = ?", (feed_id,))
        return cur.rowcount > 0


def list_feeds_between(start_iso: str, end_iso: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, fed_at, amount_ml, notes, is_extra, method, duration_min, feeding_day_override "
            "FROM feeds WHERE fed_at >= ? AND fed_at < ? ORDER BY fed_at ASC",
            (start_iso, end_iso),
        ).fetchall()
    return [dict(r) for r in rows]


def insert_pump(pumped_at: datetime, amount_ml: float, notes: Optional[str]) -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO pumps (pumped_at, amount_ml, notes) VALUES (?, ?, ?)",
            (pumped_at.isoformat(), amount_ml, notes),
        )
        return cur.lastrowid


def update_pump(pump_id: int, pumped_at: Optional[datetime], amount_ml: Optional[float], notes: Optional[str]) -> bool:
    sets, args = [], []
    if pumped_at is not None:
        sets.append("pumped_at = ?")
        args.append(pumped_at.isoformat())
    if amount_ml is not None:
        sets.append("amount_ml = ?")
        args.append(amount_ml)
    if notes is not None:
        sets.append("notes = ?")
        args.append(notes)
    if not sets:
        return True
    args.append(pump_id)
    with get_conn() as c:
        cur = c.execute(f"UPDATE pumps SET {', '.join(sets)} WHERE id = ?", args)
        return cur.rowcount > 0


def delete_pump(pump_id: int) -> bool:
    with get_conn() as c:
        cur = c.execute("DELETE FROM pumps WHERE id = ?", (pump_id,))
        return cur.rowcount > 0


def list_pumps_between(start_iso: str, end_iso: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, pumped_at, amount_ml, notes FROM pumps WHERE pumped_at >= ? AND pumped_at < ? ORDER BY pumped_at ASC",
            (start_iso, end_iso),
        ).fetchall()
    return [dict(r) for r in rows]


def insert_weight(recorded_at: datetime, weight_grams: int, ml_per_kg_per_day: int, notes: Optional[str]) -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO weight_entries (recorded_at, weight_grams, ml_per_kg_per_day, notes) VALUES (?, ?, ?, ?)",
            (recorded_at.isoformat(), weight_grams, ml_per_kg_per_day, notes),
        )
        return cur.lastrowid


def latest_weight() -> Optional[dict]:
    with get_conn() as c:
        row = c.execute(
            "SELECT id, recorded_at, weight_grams, ml_per_kg_per_day, notes FROM weight_entries ORDER BY recorded_at DESC, id DESC LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def list_weights() -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, recorded_at, weight_grams, ml_per_kg_per_day, notes FROM weight_entries ORDER BY recorded_at DESC, id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def update_weight(weight_id: int, recorded_at: Optional[datetime], weight_grams: Optional[int], ml_per_kg_per_day: Optional[int], notes: Optional[str]) -> bool:
    sets, args = [], []
    if recorded_at is not None:
        sets.append("recorded_at = ?")
        args.append(recorded_at.isoformat())
    if weight_grams is not None:
        sets.append("weight_grams = ?")
        args.append(weight_grams)
    if ml_per_kg_per_day is not None:
        sets.append("ml_per_kg_per_day = ?")
        args.append(ml_per_kg_per_day)
    if notes is not None:
        sets.append("notes = ?")
        args.append(notes)
    if not sets:
        return True
    args.append(weight_id)
    with get_conn() as c:
        cur = c.execute(f"UPDATE weight_entries SET {', '.join(sets)} WHERE id = ?", args)
        return cur.rowcount > 0


def delete_weight(weight_id: int) -> bool:
    with get_conn() as c:
        cur = c.execute("DELETE FROM weight_entries WHERE id = ?", (weight_id,))
        return cur.rowcount > 0


def insert_diaper(recorded_at: datetime, kind: str, notes: Optional[str]) -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO diapers (recorded_at, kind, notes) VALUES (?, ?, ?)",
            (recorded_at.isoformat(), kind, notes),
        )
        return cur.lastrowid


def update_diaper(diaper_id: int, recorded_at: Optional[datetime], kind: Optional[str], notes: Optional[str]) -> bool:
    sets, args = [], []
    if recorded_at is not None:
        sets.append("recorded_at = ?")
        args.append(recorded_at.isoformat())
    if kind is not None:
        sets.append("kind = ?")
        args.append(kind)
    if notes is not None:
        sets.append("notes = ?")
        args.append(notes)
    if not sets:
        return True
    args.append(diaper_id)
    with get_conn() as c:
        cur = c.execute(f"UPDATE diapers SET {', '.join(sets)} WHERE id = ?", args)
        return cur.rowcount > 0


def delete_diaper(diaper_id: int) -> bool:
    with get_conn() as c:
        cur = c.execute("DELETE FROM diapers WHERE id = ?", (diaper_id,))
        return cur.rowcount > 0


def list_diapers_between(start_iso: str, end_iso: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, recorded_at, kind, notes FROM diapers WHERE recorded_at >= ? AND recorded_at < ? ORDER BY recorded_at ASC",
            (start_iso, end_iso),
        ).fetchall()
    return [dict(r) for r in rows]


def insert_push_subscription(endpoint: str, p256dh: str, auth: str, label: Optional[str], created_at: datetime) -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO push_subscriptions (endpoint, p256dh, auth, label, created_at) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, label=excluded.label",
            (endpoint, p256dh, auth, label, created_at.isoformat()),
        )
        if cur.lastrowid:
            return cur.lastrowid
        row = c.execute("SELECT id FROM push_subscriptions WHERE endpoint = ?", (endpoint,)).fetchone()
        return row["id"]


def list_push_subscriptions() -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, endpoint, p256dh, auth, label, created_at, last_notified_for FROM push_subscriptions ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_push_subscription(sub_id: int) -> bool:
    with get_conn() as c:
        cur = c.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub_id,))
        return cur.rowcount > 0


def delete_push_subscription_by_endpoint(endpoint: str) -> bool:
    with get_conn() as c:
        cur = c.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        return cur.rowcount > 0


def update_push_last_notified(sub_id: int, expected_iso: str) -> None:
    with get_conn() as c:
        c.execute(
            "UPDATE push_subscriptions SET last_notified_for = ? WHERE id = ?",
            (expected_iso, sub_id),
        )


def list_viewer_passcodes() -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, label, passcode_hash, last_seen_at, created_at "
            "FROM viewer_passcodes ORDER BY label"
        ).fetchall()
    return [dict(r) for r in rows]


def get_viewer_passcode_by_label(label: str) -> Optional[dict]:
    with get_conn() as c:
        row = c.execute(
            "SELECT id, label, passcode_hash, last_seen_at, created_at "
            "FROM viewer_passcodes WHERE label = ?",
            (label,),
        ).fetchone()
    return dict(row) if row else None


def create_viewer_passcode(label: str, passcode_hash: str, created_at: datetime) -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO viewer_passcodes (label, passcode_hash, created_at) VALUES (?, ?, ?)",
            (label, passcode_hash, created_at.isoformat()),
        )
        return cur.lastrowid


def delete_viewer_passcode(viewer_id: int) -> bool:
    with get_conn() as c:
        cur = c.execute("DELETE FROM viewer_passcodes WHERE id = ?", (viewer_id,))
        return cur.rowcount > 0


def update_viewer_last_seen(label: str, when: datetime) -> None:
    with get_conn() as c:
        c.execute(
            "UPDATE viewer_passcodes SET last_seen_at = ? WHERE label = ?",
            (when.isoformat(), label),
        )


def insert_vital(
    recorded_at: datetime,
    heart_rate: Optional[float],
    spo2: Optional[float],
    spo2_avg10: Optional[float],
    movement: Optional[int],
    skin_temp: Optional[int],
    sock_connection: Optional[int],
    sock_off: bool,
    charging: bool,
    low_spo2_alert: bool,
) -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO vitals (recorded_at, heart_rate, spo2, spo2_avg10, movement, "
            "skin_temp, sock_connection, sock_off, charging, low_spo2_alert) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                recorded_at.isoformat(),
                heart_rate,
                spo2,
                spo2_avg10,
                movement,
                skin_temp,
                sock_connection,
                1 if sock_off else 0,
                1 if charging else 0,
                1 if low_spo2_alert else 0,
            ),
        )
        return cur.lastrowid


def list_vitals_between(start_iso: str, end_iso: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT id, recorded_at, heart_rate, spo2, spo2_avg10, movement, skin_temp, "
            "sock_connection, sock_off, charging, low_spo2_alert FROM vitals "
            "WHERE recorded_at >= ? AND recorded_at < ? ORDER BY recorded_at ASC",
            (start_iso, end_iso),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_vitals_before(cutoff_iso: str) -> int:
    with get_conn() as c:
        cur = c.execute("DELETE FROM vitals WHERE recorded_at < ?", (cutoff_iso,))
        return cur.rowcount


def upsert_vitals_daily(
    feeding_day: str,
    hr_avg: Optional[float],
    hr_min: Optional[float],
    hr_max: Optional[float],
    spo2_avg: Optional[float],
    spo2_min_avg10: Optional[float],
    monitoring_minutes: int,
    session_count: int,
    low_spo2_alert_count: int,
    sample_count: int,
    computed_at: datetime,
) -> None:
    with get_conn() as c:
        c.execute(
            "INSERT INTO vitals_daily (feeding_day, hr_avg, hr_min, hr_max, spo2_avg, spo2_min_avg10, "
            "monitoring_minutes, session_count, low_spo2_alert_count, sample_count, computed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(feeding_day) DO UPDATE SET "
            "hr_avg=excluded.hr_avg, hr_min=excluded.hr_min, hr_max=excluded.hr_max, "
            "spo2_avg=excluded.spo2_avg, spo2_min_avg10=excluded.spo2_min_avg10, "
            "monitoring_minutes=excluded.monitoring_minutes, session_count=excluded.session_count, "
            "low_spo2_alert_count=excluded.low_spo2_alert_count, sample_count=excluded.sample_count, "
            "computed_at=excluded.computed_at",
            (
                feeding_day, hr_avg, hr_min, hr_max, spo2_avg, spo2_min_avg10,
                monitoring_minutes, session_count, low_spo2_alert_count, sample_count,
                computed_at.isoformat(),
            ),
        )


def list_vitals_daily_between(start_day: str, end_day: str) -> list[dict]:
    with get_conn() as c:
        rows = c.execute(
            "SELECT feeding_day, hr_avg, hr_min, hr_max, spo2_avg, spo2_min_avg10, "
            "monitoring_minutes, session_count, low_spo2_alert_count, sample_count, computed_at "
            "FROM vitals_daily WHERE feeding_day >= ? AND feeding_day <= ? "
            "ORDER BY feeding_day ASC",
            (start_day, end_day),
        ).fetchall()
    return [dict(r) for r in rows]


def get_settings() -> dict[str, str]:
    with get_conn() as c:
        rows = c.execute("SELECT key, value FROM app_settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


def set_settings(updates: dict[str, str]) -> None:
    with get_conn() as c:
        for k, v in updates.items():
            c.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (k, v),
            )

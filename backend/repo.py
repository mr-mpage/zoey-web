"""Thin SQLite data-access helpers."""

from datetime import datetime
from typing import Optional

from .db import get_conn


def insert_feed(fed_at: datetime, amount_ml: float, notes: Optional[str]) -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO feeds (fed_at, amount_ml, notes) VALUES (?, ?, ?)",
            (fed_at.isoformat(), amount_ml, notes),
        )
        return cur.lastrowid


def update_feed(feed_id: int, fed_at: Optional[datetime], amount_ml: Optional[float], notes: Optional[str]) -> bool:
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
            "SELECT id, fed_at, amount_ml, notes FROM feeds WHERE fed_at >= ? AND fed_at < ? ORDER BY fed_at ASC",
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

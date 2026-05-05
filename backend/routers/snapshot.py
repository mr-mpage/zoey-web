"""Replace-mode snapshot import.

Counterpart to ``GET /api/export/snapshot.json``. Accepts a JSON body in
the same shape and **wipes** the user-data tables before bulk-inserting
the payload. Used by the Zoey iOS app's "Push to PWA" cutover-safety
button: before a risky iOS upgrade, the user mirrors the current iOS
state to the PWA so it can be a fallback if the upgrade misbehaves.

Wiped: ``feeds``, ``pumps``, ``diapers``, ``weight_entries``, ``meds``,
``med_doses``. iOS-managed ``app_settings`` keys are upserted; non-iOS
keys are left alone.

Preserved as-is (iOS doesn't model these and replacing them would
destroy state iOS can't reproduce):
- ``vitals`` (raw Owlet readings)
- ``vitals_daily`` (per-feeding-day aggregates)
- ``push_subscriptions``
- ``viewer_passcodes``
- ``app_settings`` keys: ``owlet_*``, ``vitals_enabled``

Single transaction: either everything lands or nothing changes.

Gated by ``require_edit``: same auth shape as every other write route.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from .. import db, services
from ..auth import require_edit
from ..comparisons import now_local


router = APIRouter(prefix="/api", tags=["snapshot"], dependencies=[Depends(require_edit)])


# Settings keys this endpoint will overwrite. Anything outside this set
# (Owlet credentials, vitals toggle, future PWA-only knobs) is left
# untouched in app_settings so iOS pushes don't silently destroy state
# the iOS client doesn't know about.
IOS_MANAGED_SETTING_KEYS: frozenset[str] = frozenset({
    "baby_name",
    "parent_names",
    "day_start_hour",
    "day_start_minute",
    "feeds_per_day",
    "bottle_prep_ml",
    "comparison_threshold_pct",
    "birth_date",
    "gestational_age_weeks",
    "birth_weight_grams",
    "target_concern_ml_per_kg",
    "target_low_ml_per_kg",
    "target_solid_ml_per_kg",
    "target_high_ml_per_kg",
})


@router.post("/snapshot")
def replace_snapshot(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    schema_version = payload.get("schema_version")
    if schema_version is not None and schema_version != 1:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported snapshot schema_version {schema_version!r}; expected 1",
        )

    feeds = _list(payload, "feeds")
    pumps = _list(payload, "pumps")
    weights = _list(payload, "weights")
    diapers = _list(payload, "diapers")
    meds = _list(payload, "meds")
    med_doses = _list(payload, "med_doses")
    settings_dict = payload.get("settings") or {}
    if not isinstance(settings_dict, dict):
        raise HTTPException(status_code=400, detail="`settings` must be an object")

    with db.get_conn() as conn:
        # Order matters: med_doses references meds; clear children first.
        conn.execute("DELETE FROM med_doses")
        conn.execute("DELETE FROM meds")
        conn.execute("DELETE FROM feeds")
        conn.execute("DELETE FROM pumps")
        conn.execute("DELETE FROM diapers")
        conn.execute("DELETE FROM weight_entries")

        for f in feeds:
            conn.execute(
                "INSERT INTO feeds (fed_at, amount_ml, method, duration_min, is_extra, feeding_day_override, notes) VALUES (?,?,?,?,?,?,?)",
                (
                    _required_str(f, "fed_at"),
                    _required_float(f, "amount_ml"),
                    f.get("method") or "bottle",
                    _opt_int(f.get("duration_min")),
                    1 if f.get("is_extra") else 0,
                    _opt_str(f.get("feeding_day_override")),
                    _opt_str(f.get("notes")),
                ),
            )
        for p in pumps:
            conn.execute(
                "INSERT INTO pumps (pumped_at, amount_ml, notes) VALUES (?,?,?)",
                (
                    _required_str(p, "pumped_at"),
                    _required_float(p, "amount_ml"),
                    _opt_str(p.get("notes")),
                ),
            )
        for d in diapers:
            kind = d.get("kind")
            if kind not in ("wet", "dirty"):
                continue
            conn.execute(
                "INSERT INTO diapers (recorded_at, kind, notes) VALUES (?,?,?)",
                (_required_str(d, "recorded_at"), kind, _opt_str(d.get("notes"))),
            )
        for w in weights:
            conn.execute(
                "INSERT INTO weight_entries (recorded_at, weight_grams, ml_per_kg_per_day, notes, is_auto) VALUES (?,?,?,?,?)",
                (
                    _required_str(w, "recorded_at"),
                    _required_int(w, "weight_grams"),
                    _required_int(w, "ml_per_kg_per_day"),
                    _opt_str(w.get("notes")),
                    1 if w.get("is_auto") else 0,
                ),
            )

        med_id_remap: dict[int, int] = {}
        for m in meds:
            cursor = conn.execute(
                "INSERT INTO meds (name, doses_per_day, sort_order, archived, created_at) VALUES (?,?,?,?,?)",
                (
                    _required_str(m, "name"),
                    _opt_int(m.get("doses_per_day")) or 1,
                    _opt_int(m.get("sort_order")) or 0,
                    1 if m.get("archived") else 0,
                    m.get("created_at") or now_local().isoformat(),
                ),
            )
            old_id = _opt_int(m.get("id"))
            new_id = int(cursor.lastrowid) if cursor.lastrowid is not None else None
            if old_id is not None and new_id is not None:
                med_id_remap[old_id] = new_id

        for d in med_doses:
            old_med_id = _opt_int(d.get("med_id"))
            new_med_id = med_id_remap.get(old_med_id) if old_med_id is not None else None
            conn.execute(
                "INSERT INTO med_doses (med_id, name, given_at, notes, is_extra, feeding_day_override, created_at) VALUES (?,?,?,?,?,?,?)",
                (
                    new_med_id,
                    _opt_str(d.get("name")),
                    _required_str(d, "given_at"),
                    _opt_str(d.get("notes")),
                    1 if d.get("is_extra") else 0,
                    _opt_str(d.get("feeding_day_override")),
                    d.get("created_at") or now_local().isoformat(),
                ),
            )

        for key, value in settings_dict.items():
            if key not in IOS_MANAGED_SETTING_KEYS:
                continue
            if value is None:
                continue
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, str(value)),
            )

    # Trigger an auto-weight regenerate so the PWA's interpolated weights
    # match the new manual entries instead of dangling against the old set.
    try:
        services.regenerate_auto_weights()
    except Exception:  # noqa: BLE001
        pass

    return {
        "counts": {
            "feeds": len(feeds),
            "pumps": len(pumps),
            "diapers": len(diapers),
            "weights": len(weights),
            "meds": len(meds),
            "med_doses": len(med_doses),
        },
        "replaced_at": now_local().isoformat(),
    }


# ─── Cell parsing ─────────────────────────────────────────────────────────

def _list(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    v = payload.get(key) or []
    if not isinstance(v, list):
        raise HTTPException(status_code=400, detail=f"`{key}` must be an array")
    return v


def _required_str(d: dict[str, Any], key: str) -> str:
    v = d.get(key)
    if not isinstance(v, str) or not v:
        raise HTTPException(status_code=400, detail=f"missing or empty `{key}`")
    return v


def _required_float(d: dict[str, Any], key: str) -> float:
    v = d.get(key)
    if v is None:
        raise HTTPException(status_code=400, detail=f"missing `{key}`")
    return float(v)


def _required_int(d: dict[str, Any], key: str) -> int:
    v = d.get(key)
    if v is None:
        raise HTTPException(status_code=400, detail=f"missing `{key}`")
    return int(v)


def _opt_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _opt_str(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None

"""CSV data import.

Counterpart to ``backend/routers/export.py``. Accepts one or more CSV files
in a single multipart request, identifies each by header signature, and
appends its rows to the corresponding table.

Behavioural notes:
- Imported rows always get a fresh primary key. The CSV's ``id`` column is
  kept only so meds → med_doses can remap ``med_id`` within one upload.
- ``meds.csv`` is processed before ``med_doses.csv`` so the remap is
  available. If meds aren't in the upload, doses fall back to free-text
  (``med_id`` cleared, the ``name`` column carries the label).
- Rows that fail to parse are skipped and counted; valid rows in the same
  file still go through. Each file imports inside its own transaction, so
  a malformed weights.csv can't roll back a successful feeds.csv.
- ``app_settings.csv`` and ``manifest.json`` are accepted but ignored —
  the export bundle includes them for context, but importing settings
  would silently overwrite the baby profile and intake bands.

Gated by ``require_edit``: import is a write, so viewer sessions are
rejected like every other mutation route.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile

from .. import repo
from ..auth import require_edit


router = APIRouter(prefix="/api/import", tags=["import"], dependencies=[Depends(require_edit)])


# ─── Detection ────────────────────────────────────────────────────────────

# Map of (frozenset of distinguishing columns) → kind. We match on a
# small distinguishing subset rather than the full header so the importer
# survives the export adding optional columns later.
_DETECT: list[tuple[frozenset[str], str]] = [
    (frozenset({"fed_at", "amount_ml"}), "feeds"),
    (frozenset({"pumped_at", "amount_ml"}), "pumps"),
    (frozenset({"recorded_at", "kind"}), "diapers"),
    (frozenset({"recorded_at", "weight_grams"}), "weights"),
    (frozenset({"doses_per_day"}), "meds"),
    (frozenset({"given_at"}), "med_doses"),
]


def _detect_kind(headers: list[str]) -> Optional[str]:
    h = {x.strip() for x in headers}
    for needed, kind in _DETECT:
        if needed.issubset(h):
            return kind
    return None


# ─── Cell parsing ─────────────────────────────────────────────────────────

def _opt_str(v: str) -> Optional[str]:
    s = v.strip() if v is not None else ""
    return s if s else None


def _opt_int(v: str) -> Optional[int]:
    s = (v or "").strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return int(float(s))  # tolerate "60.0"


def _opt_float(v: str) -> Optional[float]:
    s = (v or "").strip()
    if not s:
        return None
    return float(s)


def _opt_bool(v: str) -> bool:
    s = (v or "").strip().lower()
    return s in {"true", "1", "yes", "y"}


def _parse_dt(v: str) -> datetime:
    """Strict ISO-8601 parse. Raises ValueError on empty / malformed input
    so the row gets counted as an error rather than a silent NULL insert."""
    s = (v or "").strip()
    if not s:
        raise ValueError("empty datetime")
    return datetime.fromisoformat(s)


# ─── Per-kind importers ───────────────────────────────────────────────────

def _import_feeds(reader: csv.DictReader) -> tuple[int, int]:
    ok = err = 0
    for row in reader:
        try:
            fed_at = _parse_dt(row["fed_at"])
            amount = _opt_float(row["amount_ml"])
            if amount is None:
                raise ValueError("amount_ml required")
            method = (row.get("method") or "").strip() or "bottle"
            if method not in ("bottle", "breast"):
                method = "bottle"
            repo.insert_feed(
                fed_at=fed_at,
                amount_ml=amount,
                notes=_opt_str(row.get("notes", "")),
                is_extra=_opt_bool(row.get("is_extra", "")),
                method=method,
                duration_min=_opt_int(row.get("duration_min", "")),
                feeding_day_override=_opt_str(row.get("feeding_day_override", "")),
            )
            ok += 1
        except (KeyError, ValueError, TypeError):
            err += 1
    return ok, err


def _import_pumps(reader: csv.DictReader) -> tuple[int, int]:
    ok = err = 0
    for row in reader:
        try:
            pumped_at = _parse_dt(row["pumped_at"])
            amount = _opt_float(row["amount_ml"])
            if amount is None or amount <= 0:
                raise ValueError("amount_ml > 0 required")
            repo.insert_pump(pumped_at, amount, _opt_str(row.get("notes", "")))
            ok += 1
        except (KeyError, ValueError, TypeError):
            err += 1
    return ok, err


def _import_diapers(reader: csv.DictReader) -> tuple[int, int]:
    ok = err = 0
    for row in reader:
        try:
            recorded_at = _parse_dt(row["recorded_at"])
            kind = (row.get("kind") or "").strip()
            if kind not in ("wet", "dirty"):
                raise ValueError("kind must be wet or dirty")
            repo.insert_diaper(recorded_at, kind, _opt_str(row.get("notes", "")))
            ok += 1
        except (KeyError, ValueError, TypeError):
            err += 1
    return ok, err


def _import_weights(reader: csv.DictReader) -> tuple[int, int]:
    """Drops ``is_auto=true`` rows on the floor: auto-fill weights are
    derived state, regenerated by the live app from the manual series.
    Importing them would just produce stale interpolation that the next
    save would overwrite anyway."""
    ok = err = 0
    for row in reader:
        try:
            if _opt_bool(row.get("is_auto", "")):
                continue
            recorded_at = _parse_dt(row["recorded_at"])
            grams = _opt_int(row["weight_grams"])
            mlkg = _opt_int(row.get("ml_per_kg_per_day", "")) or 0
            if grams is None:
                raise ValueError("weight_grams required")
            repo.insert_weight(
                recorded_at, grams, mlkg, _opt_str(row.get("notes", "")), is_auto=False,
            )
            ok += 1
        except (KeyError, ValueError, TypeError):
            err += 1
    return ok, err


def _import_meds(reader: csv.DictReader, id_map: dict[int, int]) -> tuple[int, int]:
    """Inserts each med and records old_id → new_id in ``id_map`` so a
    subsequent ``med_doses.csv`` in the same upload can translate FKs."""
    ok = err = 0
    for row in reader:
        try:
            name = (row.get("name") or "").strip()
            if not name:
                raise ValueError("name required")
            doses = _opt_int(row.get("doses_per_day", "")) or 1
            sort_order = _opt_int(row.get("sort_order", "")) or 0
            archived = _opt_bool(row.get("archived", ""))
            new_id = repo.insert_med(name, doses, sort_order)
            if archived:
                repo.update_med(new_id, archived=True)
            old_id = _opt_int(row.get("id", ""))
            if old_id is not None:
                id_map[old_id] = new_id
            ok += 1
        except (KeyError, ValueError, TypeError):
            err += 1
    return ok, err


def _import_med_doses(reader: csv.DictReader, id_map: dict[int, int]) -> tuple[int, int]:
    """``med_id`` is rewritten through the meds id_map (same upload). If
    no map entry exists, drops to free-text mode (med_id=NULL) so the
    dose still resolves a label via its ``name`` column."""
    ok = err = 0
    for row in reader:
        try:
            given_at = _parse_dt(row["given_at"])
            old_med_id = _opt_int(row.get("med_id", ""))
            new_med_id: Optional[int] = None
            if old_med_id is not None and old_med_id in id_map:
                new_med_id = id_map[old_med_id]
            name = _opt_str(row.get("name", ""))
            if new_med_id is None and not name:
                # Without a med link or a free-text label we have nothing to
                # display; rather than insert an unidentifiable dose, drop it.
                raise ValueError("med_id or name required")
            repo.insert_med_dose(
                med_id=new_med_id,
                name=name,
                given_at=given_at,
                notes=_opt_str(row.get("notes", "")),
                is_extra=_opt_bool(row.get("is_extra", "")),
                feeding_day_override=_opt_str(row.get("feeding_day_override", "")),
            )
            ok += 1
        except (KeyError, ValueError, TypeError):
            err += 1
    return ok, err


# ─── Endpoint ─────────────────────────────────────────────────────────────

# Order matters: meds before med_doses so the FK remap is populated. Other
# files are independent and processed in upload order.
_KIND_ORDER = ["feeds", "pumps", "diapers", "weights", "meds", "med_doses"]


@router.post("")
async def import_csvs(files: list[UploadFile] = File(...)) -> dict:
    """Accept one or more CSVs and append their rows. Files with an
    unknown header signature (e.g. ``app_settings.csv``, ``manifest.json``)
    are reported as ``ignored`` rather than failed — the export bundle
    includes them for context but importing settings would silently
    overwrite the baby profile."""
    parsed: list[dict] = []
    for f in files:
        raw = (await f.read()).decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(raw))
        kind = _detect_kind(reader.fieldnames or [])
        parsed.append({"file": f, "filename": f.filename or "", "kind": kind, "raw": raw})

    id_map: dict[int, int] = {}
    results: list[dict] = []
    total_imported = 0
    total_errors = 0

    def _process(item: dict) -> None:
        nonlocal total_imported, total_errors
        kind = item["kind"]
        if kind is None:
            results.append({
                "filename": item["filename"], "kind": None,
                "imported": 0, "errors": 0, "ignored": True,
            })
            return
        reader = csv.DictReader(io.StringIO(item["raw"]))
        if kind == "feeds":
            ok, err = _import_feeds(reader)
        elif kind == "pumps":
            ok, err = _import_pumps(reader)
        elif kind == "diapers":
            ok, err = _import_diapers(reader)
        elif kind == "weights":
            ok, err = _import_weights(reader)
        elif kind == "meds":
            ok, err = _import_meds(reader, id_map)
        elif kind == "med_doses":
            ok, err = _import_med_doses(reader, id_map)
        else:
            ok, err = 0, 0
        total_imported += ok
        total_errors += err
        results.append({
            "filename": item["filename"], "kind": kind,
            "imported": ok, "errors": err, "ignored": False,
        })

    # Process in deterministic order so meds always lands before med_doses.
    # Files of unknown kind are emitted last so the result list reads
    # "what we imported, then what we skipped".
    by_kind = {k: [] for k in _KIND_ORDER}
    unknown: list[dict] = []
    for item in parsed:
        if item["kind"] in by_kind:
            by_kind[item["kind"]].append(item)
        else:
            unknown.append(item)
    for k in _KIND_ORDER:
        for item in by_kind[k]:
            _process(item)
    for item in unknown:
        _process(item)

    return {
        "files": results,
        "total_imported": total_imported,
        "total_errors": total_errors,
    }

"""CSV data export.

Bundles all user-recorded entities as a ZIP of CSVs plus a manifest, so
the data can be migrated into the native Zoey iOS app during the crossover
period when both clients are in use. Per-entity CSV endpoints exist for
re-pulling a single table without a full bundle.

Gated by ``require_edit``: viewer (read-only) sessions can already see this
data on screen, but downloading the full dataset is an owner-only operation.

Format conventions:
- ISO-8601 with offset for all timestamps (matches DB storage exactly).
- Booleans as ``true``/``false``.
- Empty cells for SQL NULL.
- Header row first; column order is stable for forward-compatible importers.
- ``manifest.json`` carries ``schema_version`` so the iOS importer can refuse
  unfamiliar shapes rather than silently mis-parse.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import datetime
from typing import Any, Iterable

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from .. import repo
from ..auth import require_edit
from ..comparisons import now_local


router = APIRouter(prefix="/api/export", tags=["export"], dependencies=[Depends(require_edit)])


SCHEMA_VERSION = 1


# ─── CSV helpers ──────────────────────────────────────────────────────────

def _cell(v: Any) -> str:
    """Render a SQLite-shaped value into a CSV cell.

    SQLite booleans come back as 0/1 ints; we render them as true/false only
    for columns we know are booleans (the caller picks the renderer). For
    everything else: empty string for NULL, str() otherwise."""
    if v is None:
        return ""
    return str(v)


def _bool_cell(v: Any) -> str:
    if v is None:
        return ""
    return "true" if int(v) else "false"


def _write_csv(headers: list[str], rows: Iterable[list[str]]) -> bytes:
    buf = io.StringIO(newline="")
    w = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    w.writerow(headers)
    w.writerows(rows)
    return buf.getvalue().encode("utf-8")


# ─── Per-entity CSV builders ──────────────────────────────────────────────

def _feeds_csv() -> bytes:
    headers = [
        "id", "fed_at", "amount_ml", "method", "duration_min",
        "is_extra", "feeding_day_override", "notes",
    ]
    rows = [
        [
            _cell(r["id"]),
            _cell(r["fed_at"]),
            _cell(r["amount_ml"]),
            _cell(r.get("method") or "bottle"),
            _cell(r.get("duration_min")),
            _bool_cell(r.get("is_extra", 0)),
            _cell(r.get("feeding_day_override")),
            _cell(r.get("notes")),
        ]
        for r in repo.list_all_feeds()
    ]
    return _write_csv(headers, rows)


def _pumps_csv() -> bytes:
    headers = ["id", "pumped_at", "amount_ml", "notes"]
    rows = [
        [_cell(r["id"]), _cell(r["pumped_at"]), _cell(r["amount_ml"]), _cell(r.get("notes"))]
        for r in repo.list_all_pumps()
    ]
    return _write_csv(headers, rows)


def _diapers_csv() -> bytes:
    headers = ["id", "recorded_at", "kind", "notes"]
    rows = [
        [_cell(r["id"]), _cell(r["recorded_at"]), _cell(r["kind"]), _cell(r.get("notes"))]
        for r in repo.list_all_diapers()
    ]
    return _write_csv(headers, rows)


def _weights_csv() -> bytes:
    headers = ["id", "recorded_at", "weight_grams", "ml_per_kg_per_day", "is_auto", "notes"]
    rows = [
        [
            _cell(r["id"]),
            _cell(r["recorded_at"]),
            _cell(r["weight_grams"]),
            _cell(r["ml_per_kg_per_day"]),
            _bool_cell(r.get("is_auto", 0)),
            _cell(r.get("notes")),
        ]
        for r in repo.list_weights()
    ]
    return _write_csv(headers, rows)


def _meds_csv() -> bytes:
    headers = ["id", "name", "doses_per_day", "sort_order", "archived"]
    rows = [
        [
            _cell(r["id"]),
            _cell(r["name"]),
            _cell(r["doses_per_day"]),
            _cell(r["sort_order"]),
            _bool_cell(r.get("archived", 0)),
        ]
        for r in repo.list_meds(include_archived=True)
    ]
    return _write_csv(headers, rows)


def _med_doses_csv() -> bytes:
    headers = [
        "id", "med_id", "name", "given_at",
        "is_extra", "feeding_day_override", "notes",
    ]
    rows = [
        [
            _cell(r["id"]),
            _cell(r.get("med_id")),
            _cell(r.get("name")),
            _cell(r["given_at"]),
            _bool_cell(r.get("is_extra", 0)),
            _cell(r.get("feeding_day_override")),
            _cell(r.get("notes")),
        ]
        for r in repo.list_all_med_doses()
    ]
    return _write_csv(headers, rows)


def _settings_csv() -> bytes:
    """Baby profile and intake bands. Owlet credentials and other
    operator-only secrets are excluded — they're not relevant to the iOS
    import and shouldn't ride along in a file the user might share."""
    skip_keys = {"owlet_email", "owlet_password_encrypted", "owlet_region"}
    s = repo.get_settings()
    headers = ["key", "value"]
    rows = [[k, v] for k, v in sorted(s.items()) if k not in skip_keys]
    return _write_csv(headers, rows)


def _manifest_json() -> bytes:
    s = repo.get_settings()
    payload = {
        "schema_version": SCHEMA_VERSION,
        "exported_at": now_local().isoformat(),
        "source": "zoey-web",
        "baby": {
            "name": s.get("baby_name", ""),
            "birth_date": s.get("birth_date", ""),
            "gestational_age_weeks": s.get("gestational_age_weeks", ""),
            "birth_weight_grams": s.get("birth_weight_grams", ""),
        },
        "files": [
            "feeds.csv",
            "pumps.csv",
            "diapers.csv",
            "weights.csv",
            "meds.csv",
            "med_doses.csv",
            "app_settings.csv",
        ],
    }
    return (json.dumps(payload, indent=2) + "\n").encode("utf-8")


# ─── Endpoints ────────────────────────────────────────────────────────────

def _csv_response(body: bytes, filename: str) -> Response:
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/feeds.csv")
def export_feeds() -> Response:
    return _csv_response(_feeds_csv(), "feeds.csv")


@router.get("/pumps.csv")
def export_pumps() -> Response:
    return _csv_response(_pumps_csv(), "pumps.csv")


@router.get("/diapers.csv")
def export_diapers() -> Response:
    return _csv_response(_diapers_csv(), "diapers.csv")


@router.get("/weights.csv")
def export_weights() -> Response:
    return _csv_response(_weights_csv(), "weights.csv")


@router.get("/meds.csv")
def export_meds() -> Response:
    return _csv_response(_meds_csv(), "meds.csv")


@router.get("/med_doses.csv")
def export_med_doses() -> Response:
    return _csv_response(_med_doses_csv(), "med_doses.csv")


@router.get("/app_settings.csv")
def export_settings() -> Response:
    return _csv_response(_settings_csv(), "app_settings.csv")


def _settings_dict() -> dict[str, str]:
    """Settings as a flat string-keyed dict for JSON snapshots. Same Owlet
    exclusion as the CSV builder."""
    skip_keys = {"owlet_email", "owlet_password_encrypted", "owlet_region"}
    s = repo.get_settings()
    return {k: v for k, v in s.items() if k not in skip_keys}


def _snapshot_payload() -> dict[str, Any]:
    """JSON shape consumed by the Zoey iOS app's Sync-from-PWA flow.
    Mirrors `Zoey/Resources/zoey-snapshot.json` in the iOS bundle and
    extends it with `meds` and `med_doses`. `vitals_daily` is kept as an
    empty list for shape compatibility — iOS does not model vitals."""
    feeds = [
        {
            "id": r["id"],
            "fed_at": r["fed_at"],
            "amount_ml": r["amount_ml"],
            "method": r.get("method") or "bottle",
            "duration_min": r.get("duration_min"),
            "is_extra": int(r.get("is_extra") or 0),
            "feeding_day_override": r.get("feeding_day_override"),
            "notes": r.get("notes"),
        }
        for r in repo.list_all_feeds()
    ]
    pumps = [
        {
            "id": r["id"],
            "pumped_at": r["pumped_at"],
            "amount_ml": r["amount_ml"],
            "notes": r.get("notes"),
        }
        for r in repo.list_all_pumps()
    ]
    weights = [
        {
            "id": r["id"],
            "recorded_at": r["recorded_at"],
            "weight_grams": r["weight_grams"],
            "ml_per_kg_per_day": r["ml_per_kg_per_day"],
            "is_auto": int(r.get("is_auto") or 0),
            "notes": r.get("notes"),
        }
        for r in repo.list_weights()
    ]
    diapers = [
        {
            "id": r["id"],
            "recorded_at": r["recorded_at"],
            "kind": r["kind"],
            "notes": r.get("notes"),
        }
        for r in repo.list_all_diapers()
    ]
    meds = [
        {
            "id": r["id"],
            "name": r["name"],
            "doses_per_day": r["doses_per_day"],
            "sort_order": r["sort_order"],
            "archived": int(r.get("archived") or 0),
            "created_at": r.get("created_at"),
        }
        for r in repo.list_meds(include_archived=True)
    ]
    med_doses = [
        {
            "id": r["id"],
            "med_id": r.get("med_id"),
            "name": r.get("name"),
            "given_at": r["given_at"],
            "is_extra": int(r.get("is_extra") or 0),
            "feeding_day_override": r.get("feeding_day_override"),
            "notes": r.get("notes"),
            "created_at": r.get("created_at"),
        }
        for r in repo.list_all_med_doses()
    ]
    return {
        "schema_version": SCHEMA_VERSION,
        "exported_at": now_local().isoformat(),
        "source": "zoey-web",
        "feeds": feeds,
        "pumps": pumps,
        "weights": weights,
        "diapers": diapers,
        "meds": meds,
        "med_doses": med_doses,
        "vitals_daily": [],
        "settings": _settings_dict(),
    }


@router.get("/snapshot.json")
def export_snapshot_json() -> Response:
    """Single JSON document with every iOS-relevant entity. Consumed by
    Zoey iOS during the testing/cutover period for one-way pulls from
    the PWA. Same auth as the CSV exports."""
    body = json.dumps(_snapshot_payload(), indent=2, default=str).encode("utf-8")
    return Response(content=body, media_type="application/json; charset=utf-8")


@router.get("/all.zip")
def export_all() -> Response:
    """One ZIP with every CSV + a manifest. Filename includes the baby
    name and date so the user can drop multiple exports into Files
    without renaming. Built fully in memory — the dataset is at most a
    few thousand rows even after a year, so streaming isn't needed."""
    s = repo.get_settings()
    name = (s.get("baby_name") or "zoey").lower().replace(" ", "-")
    stamp = datetime.fromisoformat(now_local().isoformat()).strftime("%Y%m%d-%H%M")
    filename = f"{name}-export-{stamp}.zip"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", _manifest_json())
        zf.writestr("feeds.csv", _feeds_csv())
        zf.writestr("pumps.csv", _pumps_csv())
        zf.writestr("diapers.csv", _diapers_csv())
        zf.writestr("weights.csv", _weights_csv())
        zf.writestr("meds.csv", _meds_csv())
        zf.writestr("med_doses.csv", _med_doses_csv())
        zf.writestr("app_settings.csv", _settings_csv())

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

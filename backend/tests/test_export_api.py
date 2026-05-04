"""Export API smoke tests.

Covers: auth gating (anon + viewer rejected, edit allowed), per-entity CSV
shape, and ZIP bundle contents incl. manifest.json schema_version.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile

from backend.comparisons import now_local


def _seed_minimal(c) -> None:
    """Create one of each tracked entity so CSVs aren't empty."""
    c.post("/api/feeds", json={"amount_ml": 60})
    c.post("/api/pumps", json={"amount_ml": 90})
    c.post("/api/diapers", json={"kind": "wet"})
    c.post(
        "/api/weight",
        json={"weight_grams": 2200, "ml_per_kg_per_day": 160},
    )
    med = c.post("/api/meds", json={"name": "Iron", "doses_per_day": 1}).json()
    c.post("/api/meds/doses", json={"med_id": med["id"]})


def test_export_zip_requires_auth(client):
    r = client.get("/api/export/all.zip")
    assert r.status_code == 401


def test_export_zip_blocks_viewers(viewer_client):
    r = viewer_client.get("/api/export/all.zip")
    assert r.status_code == 403


def test_export_feeds_csv_shape(edit_client):
    edit_client.post("/api/feeds", json={"amount_ml": 65, "method": "bottle"})
    r = edit_client.get("/api/export/feeds.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'attachment; filename="feeds.csv"' in r.headers["content-disposition"]

    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0] == [
        "id", "fed_at", "amount_ml", "method", "duration_min",
        "is_extra", "feeding_day_override", "notes",
    ]
    assert len(rows) == 2
    assert rows[1][2] == "65.0" or rows[1][2] == "65"  # SQLite REAL
    assert rows[1][3] == "bottle"
    assert rows[1][5] == "false"


def test_export_weights_csv_includes_auto_flag(edit_client):
    edit_client.post(
        "/api/weight",
        json={"weight_grams": 2300, "ml_per_kg_per_day": 160},
    )
    r = edit_client.get("/api/export/weights.csv")
    assert r.status_code == 200
    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0] == [
        "id", "recorded_at", "weight_grams", "ml_per_kg_per_day", "is_auto", "notes",
    ]
    # Manual entry → is_auto false
    assert any(row[4] == "false" for row in rows[1:])


def test_export_zip_bundle_contains_all_files(edit_client):
    _seed_minimal(edit_client)
    r = edit_client.get("/api/export/all.zip")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(zf.namelist())
    assert names == {
        "manifest.json",
        "feeds.csv",
        "pumps.csv",
        "diapers.csv",
        "weights.csv",
        "meds.csv",
        "med_doses.csv",
        "app_settings.csv",
    }

    manifest = json.loads(zf.read("manifest.json"))
    assert manifest["schema_version"] == 1
    assert manifest["source"] == "zoey-web"
    assert "exported_at" in manifest
    # Baby block exists even if mostly defaults
    assert "name" in manifest["baby"]


def test_export_app_settings_excludes_owlet_secrets(edit_client):
    r = edit_client.get("/api/export/app_settings.csv")
    assert r.status_code == 200
    body = r.text
    assert "owlet_password_encrypted" not in body
    assert "owlet_email" not in body
    assert "owlet_region" not in body
    # But user-facing settings are present
    assert "baby_name" in body
    assert "feeds_per_day" in body


def test_export_zip_filename_uses_baby_name(edit_client):
    edit_client.patch("/api/settings", json={"baby_name": "Test Baby"})
    r = edit_client.get("/api/export/all.zip")
    assert r.status_code == 200
    cd = r.headers["content-disposition"]
    assert "test-baby-export-" in cd
    assert cd.endswith('.zip"')

"""CSV import smoke tests.

Covers: auth gating, header detection by content (not filename), per-entity
counts, malformed-row tolerance, med_id remap when meds + med_doses land in
the same upload, and a round-trip through export → import on a fresh DB.
"""

from __future__ import annotations

import csv
import io
import zipfile


def _files(*pairs: tuple[str, str]) -> list[tuple[str, tuple[str, bytes, str]]]:
    """Build a httpx-style list of multipart files.

    Each pair is ``(filename, csv_text)``. Repeated form keys are how httpx
    sends multiple files under the same field name."""
    return [
        ("files", (name, body.encode("utf-8"), "text/csv"))
        for name, body in pairs
    ]


def test_import_requires_auth(client):
    r = client.post("/api/import", files=_files(("feeds.csv", "fed_at,amount_ml\n")))
    assert r.status_code == 401


def test_import_blocks_viewers(viewer_client):
    r = viewer_client.post(
        "/api/import",
        files=_files(("feeds.csv", "fed_at,amount_ml\n")),
    )
    assert r.status_code == 403


def test_import_feeds_basic(edit_client):
    body = (
        "id,fed_at,amount_ml,method,duration_min,is_extra,feeding_day_override,notes\n"
        "1,2026-05-01T08:00:00+02:00,60,bottle,,false,,morning\n"
        "2,2026-05-01T11:00:00+02:00,55,bottle,,false,,\n"
    )
    r = edit_client.post("/api/import", files=_files(("feeds.csv", body)))
    assert r.status_code == 200
    data = r.json()
    assert data["total_imported"] == 2
    assert data["total_errors"] == 0
    assert data["files"][0]["kind"] == "feeds"

    # Sanity: feeds are now visible to the API
    listed = edit_client.get("/api/feeds?days=400").json()
    assert len(listed) == 2


def test_import_detects_kind_from_headers_not_filename(edit_client):
    """Even with a misleading filename, the body's header is the source of
    truth — so user-renamed exports still route correctly."""
    body = (
        "id,fed_at,amount_ml,method,duration_min,is_extra,feeding_day_override,notes\n"
        "1,2026-05-01T08:00:00+02:00,60,bottle,,false,,\n"
    )
    r = edit_client.post("/api/import", files=_files(("totally-not-feeds.csv", body)))
    assert r.json()["files"][0]["kind"] == "feeds"


def test_import_skips_malformed_rows(edit_client):
    body = (
        "id,fed_at,amount_ml,method,duration_min,is_extra,feeding_day_override,notes\n"
        "1,2026-05-01T08:00:00+02:00,60,bottle,,false,,\n"
        "2,not-a-date,55,bottle,,false,,\n"
        "3,2026-05-01T10:00:00+02:00,,bottle,,false,,\n"
    )
    r = edit_client.post("/api/import", files=_files(("feeds.csv", body)))
    data = r.json()
    assert data["total_imported"] == 1
    assert data["total_errors"] == 2


def test_import_drops_auto_weights(edit_client):
    body = (
        "id,recorded_at,weight_grams,ml_per_kg_per_day,is_auto,notes\n"
        "1,2026-05-01T09:00:00+02:00,2200,160,false,birth+5\n"
        "2,2026-05-02T09:00:00+02:00,2210,160,true,interp\n"
    )
    r = edit_client.post("/api/import", files=_files(("weights.csv", body)))
    data = r.json()
    # is_auto rows are intentionally skipped (regenerated client-side from
    # the manual series), so they don't count as errors either.
    assert data["total_imported"] == 1
    assert data["total_errors"] == 0


def test_import_remaps_med_id_across_files(edit_client):
    meds_csv = (
        "id,name,doses_per_day,sort_order,archived\n"
        "7,Iron,1,0,false\n"
        "9,Vitamin D,1,1,false\n"
    )
    doses_csv = (
        "id,med_id,name,given_at,is_extra,feeding_day_override,notes\n"
        "1,7,Iron,2026-05-01T09:00:00+02:00,false,,\n"
        "2,9,Vitamin D,2026-05-01T10:00:00+02:00,false,,\n"
        "3,,Saline drops,2026-05-01T11:00:00+02:00,false,,one-off\n"
    )
    r = edit_client.post(
        "/api/import",
        files=_files(("meds.csv", meds_csv), ("med_doses.csv", doses_csv)),
    )
    data = r.json()
    assert data["total_imported"] == 5  # 2 meds + 3 doses
    assert data["total_errors"] == 0

    # The two meds got fresh ids; the dose's med_id should point at the
    # *new* Iron / Vitamin D ids, not 7/9. Easiest way to check: the
    # doses-with-name resolver returns the same name we expect.
    meds = {m["name"]: m for m in edit_client.get("/api/meds").json()}
    iron_id = meds["Iron"]["id"]
    vitd_id = meds["Vitamin D"]["id"]
    assert iron_id != 7  # SQLite picked its own id

    doses = edit_client.get("/api/meds/doses?days=400").json()
    by_name = {d["name"]: d for d in doses}
    assert by_name["Iron"]["med_id"] == iron_id
    assert by_name["Vitamin D"]["med_id"] == vitd_id
    # Free-text dose has no med link
    assert by_name["Saline drops"]["med_id"] is None


def test_import_med_doses_without_meds_falls_back_to_freetext(edit_client):
    doses_csv = (
        "id,med_id,name,given_at,is_extra,feeding_day_override,notes\n"
        "1,42,Iron,2026-05-01T09:00:00+02:00,false,,\n"
    )
    r = edit_client.post("/api/import", files=_files(("med_doses.csv", doses_csv)))
    assert r.json()["total_imported"] == 1
    doses = edit_client.get("/api/meds/doses?days=400").json()
    assert doses[0]["med_id"] is None
    assert doses[0]["name"] == "Iron"


def test_import_unknown_kind_is_ignored_not_errored(edit_client):
    """The export bundle includes app_settings.csv and manifest.json; the
    importer should accept those payloads silently rather than reject the
    whole upload."""
    settings_body = "key,value\nbaby_name,Test\n"
    r = edit_client.post(
        "/api/import",
        files=_files(("app_settings.csv", settings_body)),
    )
    data = r.json()
    assert data["total_imported"] == 0
    assert data["total_errors"] == 0
    assert data["files"][0]["ignored"] is True


def test_export_then_import_round_trip(edit_client):
    # Seed source DB with one of each entity type
    edit_client.post("/api/feeds", json={"amount_ml": 60, "method": "bottle"})
    edit_client.post("/api/feeds", json={"amount_ml": 0, "method": "breast", "duration_min": 10})
    edit_client.post("/api/pumps", json={"amount_ml": 90})
    edit_client.post("/api/diapers", json={"kind": "wet"})
    edit_client.post("/api/diapers", json={"kind": "dirty"})
    edit_client.post("/api/weight", json={"weight_grams": 2200, "ml_per_kg_per_day": 160})
    med = edit_client.post("/api/meds", json={"name": "Iron", "doses_per_day": 1}).json()
    edit_client.post("/api/meds/doses", json={"med_id": med["id"]})

    # Pull the bundle, then unpack and re-feed each CSV back through import.
    zip_resp = edit_client.get("/api/export/all.zip")
    assert zip_resp.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(zip_resp.content))
    csv_files: list[tuple[str, str]] = [
        (name, zf.read(name).decode("utf-8"))
        for name in zf.namelist()
        if name.endswith(".csv")
    ]

    r = edit_client.post("/api/import", files=_files(*csv_files))
    assert r.status_code == 200
    data = r.json()
    # 2 feeds + 1 pump + 2 diapers + 1 weight + 3 meds (1 user + 2 seeded
    # by db.init_db on first run) + 1 dose = 10. app_settings.csv lands
    # as ignored, contributing nothing.
    assert data["total_imported"] == 10
    assert data["total_errors"] == 0

    # Each table now holds the original + the re-imported copy.
    assert len(edit_client.get("/api/feeds?days=400").json()) == 4
    assert len(edit_client.get("/api/pumps?days=400").json()) == 2
    assert len(edit_client.get("/api/diapers?days=400").json()) == 4

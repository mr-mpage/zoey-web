"""Weight API integration tests. The auto-fill cascade is the most
important behaviour to pin — manual writes must trigger a regenerate
visible in the next GET."""

from datetime import datetime, timedelta

from backend import repo
from backend.comparisons import TZ, feeding_day_for, now_local


def _today():
    return feeding_day_for(now_local(), 2, 30)


def _at_day(days_ago: int):
    target = _today() - timedelta(days=days_ago)
    return datetime(target.year, target.month, target.day, 9, 0, tzinfo=TZ)


def test_get_weight_empty(edit_client):
    r = edit_client.get("/api/weight")
    assert r.status_code == 200
    body = r.json()
    assert body["current"] is None
    assert body["history"] == []
    assert body["daily_target_ml"] == 0


def test_post_weight_creates_manual_and_regenerates_autos(edit_client):
    """Backfill an old weight, then a recent one → response should include
    interpolated auto rows for the days between."""
    repo.insert_weight(_at_day(6), 2200, 160, "earliest")
    r = edit_client.post(
        "/api/weight",
        json={"weight_grams": 2440, "ml_per_kg_per_day": 160, "notes": "now"},
    )
    assert r.status_code == 201

    body = edit_client.get("/api/weight").json()
    history = body["history"]
    autos = [w for w in history if w["is_auto"]]
    manuals = [w for w in history if not w["is_auto"]]
    assert len(manuals) == 2
    assert 4 <= len(autos) <= 5  # 5 days between ±boundary


def test_patch_weight_rejects_auto_entries(edit_client):
    """Auto-fill rows must be immutable through the API — they're computed,
    not stored intent. To change them, change the manual that anchors them."""
    repo.insert_weight(_at_day(5), 2300, 160, "anchor")
    edit_client.get("/api/weight")  # triggers regen
    body = edit_client.get("/api/weight").json()
    auto = next(w for w in body["history"] if w["is_auto"])

    r = edit_client.patch(f"/api/weight/{auto['id']}", json={"weight_grams": 9999})
    assert r.status_code == 400


def test_delete_weight_rejects_auto_entries(edit_client):
    repo.insert_weight(_at_day(5), 2300, 160, "anchor")
    edit_client.get("/api/weight")
    body = edit_client.get("/api/weight").json()
    auto = next(w for w in body["history"] if w["is_auto"])

    r = edit_client.delete(f"/api/weight/{auto['id']}")
    assert r.status_code == 400


def test_delete_manual_recomputes_autos(edit_client):
    """Deleting a manual that anchored a segment should leave the
    surrounding auto rows reshaped, not stale."""
    repo.insert_weight(_at_day(10), 2200, 160, "A")
    middle_id = repo.insert_weight(_at_day(7), 2280, 160, "B")
    repo.insert_weight(_at_day(4), 2370, 160, "C")
    # Trigger regen via a read.
    edit_client.get("/api/weight")
    body_before = edit_client.get("/api/weight").json()
    day9_before = next(w for w in body_before["history"] if w["recorded_at"][:10] == (_today() - timedelta(days=9)).isoformat())

    r = edit_client.delete(f"/api/weight/{middle_id}")
    assert r.status_code == 200

    body_after = edit_client.get("/api/weight").json()
    day9_after = next(w for w in body_after["history"] if w["recorded_at"][:10] == (_today() - timedelta(days=9)).isoformat())
    # Slope changes: A→B was 80g/3d, A→C is 170g/6d. Day 9 weight should differ.
    assert day9_before["weight_grams"] != day9_after["weight_grams"]


def test_daily_target_uses_latest_entry(edit_client):
    """The daily_target_ml in the WeightStatus response is what drives the
    Today screen's progress ring. Must reflect the latest entry, including
    auto-extrapolated today rows."""
    repo.insert_weight(_at_day(5), 2400, 160, "anchor")
    body = edit_client.get("/api/weight").json()
    target = body["daily_target_ml"]
    # 2400g at 160 ml/kg/day = 384 ml. Auto-extrapolation may shift the
    # current weight slightly, but the target should be close.
    assert 380 <= target <= 420


def test_notes_field_length_capped(edit_client):
    """Pydantic max_length on notes prevents DoS via large bodies."""
    r = edit_client.post(
        "/api/weight",
        json={"weight_grams": 2400, "ml_per_kg_per_day": 160, "notes": "x" * 5000},
    )
    assert r.status_code == 422

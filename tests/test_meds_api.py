"""Meds API tests — focus on feeding-day-override boundaries that
were previously miscounted in is_extra."""

from datetime import timedelta

from backend.comparisons import feeding_day_for, now_local


def _anchor() -> tuple[int, int]:
    # Match defaults seeded into a fresh DB.
    return 2, 30


def test_dose_with_override_pointing_away_does_not_inflate_is_extra(edit_client):
    """A dose given today but tagged to tomorrow should not count toward
    today's slot — the second dose logged today (no override) is dose #1
    of today, not #2."""
    med_id = edit_client.post(
        "/api/meds", json={"name": "Iron", "doses_per_day": 1, "sort_order": 0},
    ).json()["id"]

    anchor_h, anchor_m = _anchor()
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    tomorrow_iso = (today + timedelta(days=1)).isoformat()

    early = (now_local() - timedelta(hours=4)).isoformat()
    a = edit_client.post(
        "/api/meds/doses",
        json={
            "med_id": med_id,
            "given_at": early,
            "feeding_day_override": tomorrow_iso,
        },
    ).json()
    assert a["is_extra"] is False  # first (and only) dose tagged to tomorrow

    b = edit_client.post(
        "/api/meds/doses",
        json={"med_id": med_id},  # given_at defaults to now → today
    ).json()
    # Bug regression: previously this returned True because the wall-clock
    # window query for today picked up dose A even though A was overridden
    # away to tomorrow.
    assert b["is_extra"] is False


def test_dose_with_override_pointing_into_day_counts(edit_client):
    """A dose given before today's anchor with override pointing INTO
    today should count for today, so a subsequent today-dose is is_extra."""
    med_id = edit_client.post(
        "/api/meds", json={"name": "Vit D", "doses_per_day": 1, "sort_order": 0},
    ).json()["id"]

    anchor_h, anchor_m = _anchor()
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    today_iso = today.isoformat()

    # A dose timestamped 5 days ago but tagged to today.
    past = (now_local() - timedelta(days=5)).isoformat()
    a = edit_client.post(
        "/api/meds/doses",
        json={
            "med_id": med_id,
            "given_at": past,
            "feeding_day_override": today_iso,
        },
    ).json()
    assert a["is_extra"] is False

    # Second dose today — should be flagged extra because A is counted
    # against today via override even though its given_at is far away.
    b = edit_client.post("/api/meds/doses", json={"med_id": med_id}).json()
    assert b["is_extra"] is True


def test_meds_today_excludes_overridden_away_doses(edit_client):
    """get /meds/today must not show a dose whose override points away,
    even if its wall-clock time falls inside today."""
    med_id = edit_client.post(
        "/api/meds", json={"name": "Caffeine", "doses_per_day": 1, "sort_order": 0},
    ).json()["id"]
    anchor_h, anchor_m = _anchor()
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    tomorrow_iso = (today + timedelta(days=1)).isoformat()

    edit_client.post(
        "/api/meds/doses",
        json={"med_id": med_id, "feeding_day_override": tomorrow_iso},
    )

    today_payload = edit_client.get("/api/meds/today").json()
    row = next(r for r in today_payload["rows"] if r["med"]["id"] == med_id)
    # Slot is empty — the dose belongs to tomorrow.
    assert all(slot["dose"] is None for slot in row["slots"])
    assert row["extras"] == []

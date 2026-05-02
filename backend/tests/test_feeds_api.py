"""Feeds API smoke tests."""

from datetime import datetime, timedelta

from backend.comparisons import TZ, now_local


def test_feed_post_happy_path(edit_client):
    r = edit_client.post("/api/feeds", json={"amount_ml": 60})
    assert r.status_code == 201
    body = r.json()
    assert body["amount_ml"] == 60
    assert body["method"] == "bottle"


def test_feed_post_with_explicit_time(edit_client):
    when = (now_local() - timedelta(hours=2)).isoformat()
    r = edit_client.post("/api/feeds", json={"amount_ml": 55, "fed_at": when})
    assert r.status_code == 201


def test_feed_rejects_far_future_time(edit_client):
    when = (now_local() + timedelta(hours=2)).isoformat()
    r = edit_client.post("/api/feeds", json={"amount_ml": 60, "fed_at": when})
    assert r.status_code == 422


def test_feed_amount_clamped_to_500ml(edit_client):
    r = edit_client.post("/api/feeds", json={"amount_ml": 9999})
    assert r.status_code == 422


def test_feed_can_be_deleted(edit_client):
    created = edit_client.post("/api/feeds", json={"amount_ml": 60}).json()
    r = edit_client.delete(f"/api/feeds/{created['id']}")
    assert r.status_code == 200


def test_feed_method_breast_accepted(edit_client):
    r = edit_client.post(
        "/api/feeds",
        json={"amount_ml": 0, "method": "breast", "duration_min": 12},
    )
    assert r.status_code == 201

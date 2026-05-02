"""Auth flow + boundary tests. The security guarantees we want pinned:
1. Wrong passcode is rejected.
2. Correct passcode issues a session cookie.
3. After 5 failed attempts in the rate-limit window, further attempts 429.
4. Viewer (read-only) sessions cannot mutate.
5. Endpoints unauthenticated → 401."""

from .conftest import TEST_PASSCODE


def test_login_with_correct_passcode_succeeds(client):
    r = client.post("/api/auth/login", json={"passcode": TEST_PASSCODE})
    assert r.status_code == 200
    # Session cookie should be set.
    assert "zoey_session" in client.cookies


def test_login_with_wrong_passcode_rejected(client):
    r = client.post("/api/auth/login", json={"passcode": "wrong-pin"})
    assert r.status_code == 401


def test_unauthenticated_protected_route_is_401(client):
    r = client.get("/api/weight")
    assert r.status_code == 401


def test_edit_session_can_read_and_write(edit_client):
    r = edit_client.get("/api/weight")
    assert r.status_code == 200
    r = edit_client.post(
        "/api/weight",
        json={"weight_grams": 2400, "ml_per_kg_per_day": 160, "notes": "test"},
    )
    assert r.status_code == 201


def test_viewer_session_can_read(viewer_client):
    r = viewer_client.get("/api/weight")
    assert r.status_code == 200


def test_viewer_session_cannot_post_weight(viewer_client):
    r = viewer_client.post(
        "/api/weight",
        json={"weight_grams": 2400, "ml_per_kg_per_day": 160},
    )
    assert r.status_code == 403


def test_viewer_session_cannot_post_feed(viewer_client):
    r = viewer_client.post(
        "/api/feeds",
        json={"amount_ml": 60},
    )
    assert r.status_code == 403


def test_viewer_session_cannot_list_push_subscriptions(viewer_client):
    """Defense-in-depth: device endpoints + labels are operator-only."""
    r = viewer_client.get("/api/push")
    assert r.status_code == 403


def test_rate_limit_kicks_in_after_max_attempts(client, monkeypatch):
    """Five wrong passcode attempts in the window → 429 on the sixth.
    Test client's peer ('testclient') is non-IP and therefore untrusted, so
    XFF is ignored and the bucket key is the peer string itself."""
    from backend import auth
    # Reset the in-memory bucket so we don't pick up state from earlier tests.
    auth._attempts.clear()

    for i in range(5):
        r = client.post("/api/auth/login", json={"passcode": "nope"})
        assert r.status_code == 401, f"attempt {i + 1} should still 401"

    r = client.post("/api/auth/login", json={"passcode": "nope"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_passcode_input_is_length_capped(client):
    """LoginIn.passcode max_length=128 — defends bcrypt's 72-byte truncation
    + general DoS via large bodies."""
    r = client.post("/api/auth/login", json={"passcode": "x" * 200})
    assert r.status_code == 422

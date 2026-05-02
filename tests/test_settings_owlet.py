"""Owlet integration settings: encrypted-at-rest password storage,
viewer-mode write rejection, password-never-returned guarantee, and
hot-reload of the poll task on save."""

from unittest.mock import patch

import pytest


def test_get_returns_unconfigured_state(edit_client):
    r = edit_client.get("/api/settings/owlet")
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "enabled": True,
        "email": "",
        "region": "europe",
        "has_password": False,
        "configured": False,
    }


@patch("backend.routers.settings.start_owlet_poller")
def test_patch_stores_encrypted_password_and_marks_configured(_mock_start, edit_client):
    r = edit_client.patch(
        "/api/settings/owlet",
        json={"email": "parent@example.com", "password": "owlet-pass-1", "region": "europe"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "parent@example.com"
    assert body["region"] == "europe"
    assert body["has_password"] is True
    assert body["configured"] is True
    # The plaintext password must never be in the response.
    assert "password" not in body
    assert "owlet-pass-1" not in r.text


@patch("backend.routers.settings.start_owlet_poller")
def test_password_is_encrypted_in_storage(_mock_start, edit_client):
    """Round-trip the plaintext via Repo: it should come back equal, but
    the raw stored value should NOT match the plaintext (Fernet token)."""
    from backend import repo
    edit_client.patch(
        "/api/settings/owlet",
        json={"email": "p@example.com", "password": "secret-plaintext", "region": "world"},
    )
    raw = repo.get_settings()["owlet_password_encrypted"]
    assert raw  # something is stored
    assert raw != "secret-plaintext"  # not plaintext
    assert "secret-plaintext" not in raw  # not even a substring
    creds = repo.get_owlet_credentials()
    assert creds is not None
    assert creds["password"] == "secret-plaintext"  # decrypts correctly
    assert creds["email"] == "p@example.com"
    assert creds["region"] == "world"


@patch("backend.routers.settings.start_owlet_poller")
def test_password_omitted_in_patch_leaves_existing_password(_mock_start, edit_client):
    """An email-only edit must not require re-typing the password."""
    edit_client.patch(
        "/api/settings/owlet",
        json={"email": "first@example.com", "password": "p1", "region": "europe"},
    )
    # Edit only the email — no password field at all.
    r = edit_client.patch(
        "/api/settings/owlet",
        json={"email": "second@example.com"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "second@example.com"
    assert body["has_password"] is True  # still stored

    from backend import repo
    creds = repo.get_owlet_credentials()
    assert creds is not None
    assert creds["password"] == "p1"


@patch("backend.routers.settings.start_owlet_poller")
def test_empty_password_clears_and_disables(_mock_start, edit_client):
    edit_client.patch(
        "/api/settings/owlet",
        json={"email": "p@example.com", "password": "p1", "region": "europe"},
    )
    r = edit_client.patch("/api/settings/owlet", json={"password": ""})
    assert r.status_code == 200
    body = r.json()
    assert body["has_password"] is False
    assert body["configured"] is False


def test_viewer_session_cannot_patch_owlet(viewer_client):
    r = viewer_client.patch(
        "/api/settings/owlet",
        json={"email": "intruder@example.com", "password": "x", "region": "europe"},
    )
    assert r.status_code == 403


def test_unauthenticated_get_is_401(client):
    r = client.get("/api/settings/owlet")
    assert r.status_code == 401


def test_invalid_region_rejected(edit_client):
    r = edit_client.patch(
        "/api/settings/owlet",
        json={"email": "p@example.com", "password": "x", "region": "asia"},
    )
    assert r.status_code == 422


@patch("backend.routers.settings.start_owlet_poller")
def test_toggle_off_hides_without_clearing_credentials(_mock_start, edit_client):
    """Turning off the Vitals integration toggle must keep the saved
    email + password — the operator can flip it back on without re-typing."""
    edit_client.patch(
        "/api/settings/owlet",
        json={"email": "p@example.com", "password": "kept", "region": "europe"},
    )
    r = edit_client.patch("/api/settings/owlet", json={"enabled": False})
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False
    assert body["has_password"] is True  # creds preserved
    assert body["email"] == "p@example.com"

    from backend import repo
    creds = repo.get_owlet_credentials()
    assert creds is not None
    assert creds["password"] == "kept"


@patch("backend.routers.settings.start_owlet_poller")
def test_toggle_default_is_on_for_fresh_install(_mock_start, edit_client):
    """Default-on is the contract: a household that does use the sock
    shouldn't need to flip a switch before configuring credentials."""
    r = edit_client.get("/api/settings/owlet")
    assert r.json()["enabled"] is True


@pytest.mark.asyncio
async def test_patch_triggers_poller_restart(edit_client):
    """Saving credentials must hot-restart the poll task so the operator
    doesn't need to bounce the container for a new password to take
    effect."""
    with patch("backend.routers.settings.start_owlet_poller") as mock_start:
        # AsyncMock isn't strictly required since FastAPI awaits the
        # returned coroutine — make the mock return a completed awaitable.
        async def noop():
            return None
        mock_start.side_effect = noop
        r = edit_client.patch(
            "/api/settings/owlet",
            json={"email": "p@example.com", "password": "x", "region": "europe"},
        )
        assert r.status_code == 200
        mock_start.assert_called_once()

"""Test fixtures.

Importing the backend triggers two things that need to be in place first:
the startup secret-gate (so SESSION_SECRET + ZOEY_PASSCODE_HASH must be set)
and the SQLite path resolver (so DB_PATH must point at a writable file). We
set both via env *before* the first import below, then offer a `client`
fixture that points each test at its own tmp DB.

The TestClient is constructed without entering its context manager, so the
lifespan's background tasks (Owlet poller, reminder loop, vitals compaction)
don't fire — they'd race with the test and aren't under test here.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import bcrypt

# ─── module-level env: must precede backend imports ──────────────────────
TEST_PASSCODE = "1234test"
_BCRYPT_HASH = bcrypt.hashpw(TEST_PASSCODE.encode(), bcrypt.gensalt(rounds=4)).decode()

os.environ["SESSION_SECRET"] = "test-session-secret-do-not-use-in-prod"
os.environ["ZOEY_PASSCODE_HASH"] = _BCRYPT_HASH
os.environ.setdefault("DB_PATH", str(Path(tempfile.mkdtemp()) / "bootstrap.db"))
# Loopback only — the test client's peer is the non-IP literal "testclient",
# which is never trusted, so XFF spoofing in tests would be ignored. Tests
# that need a stable bucket key just rely on the peer.
os.environ.setdefault("TRUSTED_PROXIES", "127.0.0.1")

import pytest
from fastapi.testclient import TestClient

from backend import config, db
from backend.auth import COOKIE_NAME, _signer
from backend.main import app


@pytest.fixture
def db_path(tmp_path, monkeypatch) -> Path:
    """Per-test SQLite file. Mutates the singleton settings so every
    backend code path that calls config.db_file() reads the new path."""
    p = tmp_path / "test.db"
    monkeypatch.setattr(config.settings, "db_path", str(p))
    db.init_db()
    return p


@pytest.fixture
def client(db_path) -> TestClient:
    """Bare TestClient with a fresh DB. No auth cookie set."""
    return TestClient(app)


def _set_cookie(c: TestClient, payload: str) -> None:
    token = _signer.sign(payload.encode()).decode()
    c.cookies.set(COOKIE_NAME, token)


@pytest.fixture
def edit_client(client) -> TestClient:
    """Logged in as the edit account. Bypasses bcrypt by signing a cookie
    directly — keeps the test fast and decouples 'I want a session' from
    'I want to test the login flow'."""
    _set_cookie(client, "edit")
    return client


@pytest.fixture
def viewer_client(client) -> TestClient:
    """Logged in as a read-only viewer named 'family'."""
    _set_cookie(client, "view:family")
    return client

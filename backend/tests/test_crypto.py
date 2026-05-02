"""crypto.encrypt_str / decrypt_str round-trip + tamper / drift behaviour."""

import pytest


def test_round_trip_recovers_plaintext():
    from backend.crypto import decrypt_str, encrypt_str
    token = encrypt_str("super-secret-owlet-password!")
    assert decrypt_str(token) == "super-secret-owlet-password!"


def test_each_encryption_uses_a_fresh_iv():
    """Same plaintext should yield distinct tokens — so a casual reader
    of two app_settings rows can't tell whether two records hold the
    same secret."""
    from backend.crypto import encrypt_str
    a = encrypt_str("hello")
    b = encrypt_str("hello")
    assert a != b


def test_tampered_token_fails_to_decrypt():
    from backend.crypto import InvalidToken, decrypt_str, encrypt_str
    token = encrypt_str("hello")
    # Flip a char near the middle — Fernet's HMAC will catch it.
    tampered = token[:20] + ("A" if token[20] != "A" else "B") + token[21:]
    with pytest.raises(InvalidToken):
        decrypt_str(tampered)


def test_decrypt_with_rotated_session_secret_fails(monkeypatch):
    """Rotating SESSION_SECRET should invalidate stored secrets so the
    operator gets a clear failure (and re-enters the password) rather
    than silently decrypting to junk."""
    from backend import crypto
    from backend.config import settings
    token = crypto.encrypt_str("hello")
    # Rotate and clear the cached Fernet so the next call rederives.
    monkeypatch.setattr(settings, "session_secret", "a-different-secret-of-some-length")
    monkeypatch.setattr(crypto, "_FERNET", None)
    with pytest.raises(crypto.InvalidToken):
        crypto.decrypt_str(token)

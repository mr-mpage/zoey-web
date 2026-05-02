"""Symmetric encryption for credentials stored in the SQLite app_settings.

Used by Owlet integration to keep the Owlet account password out of
plaintext in the DB (and out of the nightly off-server backup if a
filter slips). Keyed off ``SESSION_SECRET`` via HKDF, so rotating the
session secret invalidates both signed cookies and stored secrets in
one go — operators must re-enter integration passwords after rotation.

We use Fernet (HMAC-SHA256 + AES-128-CBC, authenticated, fresh random
IV per call). That gives us:

- two encryptions of the same plaintext yield different ciphertexts,
- tampering with the ciphertext is detected on decrypt,
- the encoded format is URL-safe text, so it slots into the existing
  ``key/value`` text columns without a schema change.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
import base64

from .config import settings


_FERNET: Fernet | None = None


def _derive_key() -> bytes:
    """HKDF-SHA256 from session_secret to a 32-byte Fernet key. The
    ``info`` string isolates this key from any other use of the same
    session_secret (e.g. cookie HMAC), so a future feature that wants
    its own derived key won't collide with this one."""
    if not settings.session_secret:
        raise RuntimeError(
            "crypto: session_secret is empty — startup gate should have "
            "refused to boot before this is ever called."
        )
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"zoey-tracker/app-settings-secrets/v1",
    )
    raw = hkdf.derive(settings.session_secret.encode())
    return base64.urlsafe_b64encode(raw)


def _fernet() -> Fernet:
    global _FERNET
    if _FERNET is None:
        _FERNET = Fernet(_derive_key())
    return _FERNET


def encrypt_str(plaintext: str) -> str:
    """Encrypt a UTF-8 string. Returns a URL-safe ASCII token suitable
    for storing in a text column."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_str(token: str) -> str:
    """Decrypt a token produced by ``encrypt_str``. Raises ``InvalidToken``
    if the token has been tampered with or was encrypted under a
    different key (e.g. SESSION_SECRET rotation)."""
    return _fernet().decrypt(token.encode()).decode()


__all__ = ["encrypt_str", "decrypt_str", "InvalidToken"]

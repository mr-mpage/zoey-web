"""Generate a VAPID keypair for Web Push.

Run once. Paste the two lines into /srv/zoey-tracker/.env, restart the container.
The public key is also served by /api/push/vapid-key so the frontend can subscribe.
"""

import base64

from cryptography.hazmat.primitives.asymmetric import ec


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def main() -> None:
    sk = ec.generate_private_key(ec.SECP256R1())
    priv = sk.private_numbers().private_value.to_bytes(32, "big")
    pub_n = sk.public_key().public_numbers()
    pub = b"\x04" + pub_n.x.to_bytes(32, "big") + pub_n.y.to_bytes(32, "big")
    print("VAPID_PRIVATE_KEY=" + b64url(priv))
    print("VAPID_PUBLIC_KEY=" + b64url(pub))


if __name__ == "__main__":
    main()

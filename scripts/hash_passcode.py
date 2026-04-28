"""Generate a bcrypt hash for a passcode. Usage: python scripts/hash_passcode.py 123456"""

import sys

import bcrypt


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python scripts/hash_passcode.py <passcode>", file=sys.stderr)
        sys.exit(1)
    passcode = sys.argv[1].encode()
    hashed = bcrypt.hashpw(passcode, bcrypt.gensalt(rounds=12)).decode()
    print(hashed)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Probe the Owlet API. Run before wiring vitals into the app.

What it does
------------
1. Authenticates against the Owlet/Ayla cloud using your account credentials.
2. Lists the devices on the account (you should see the Dream Sock).
3. Pulls the full property dump a few times, 30s apart, so you can see what
   data is available, what fields look like when the sock is on/off the
   baby, and confirm the polling actually returns fresh values.

Setup (one-time, in a throwaway venv so it doesn't pollute your project venv)
----------------------------------------------------------------------------
    python3 -m venv /tmp/owlet-probe
    source /tmp/owlet-probe/bin/activate
    pip install pyowletapi

Run
---
    OWLET_EMAIL='you@example.com' OWLET_PASSWORD='secret' \
        python scripts/test_owlet.py --region europe

Or omit env vars and it prompts. Try `--region europe` first (Vienna account
is most likely on the EU backend); if that fails with auth error, retry
`--region world`.

Flags
-----
    --region world|europe   default: europe
    --samples N             how many polls to do (default 3)
    --interval N            seconds between polls (default 30)
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import sys

try:
    from pyowletapi.api import OwletAPI
    from pyowletapi.sock import Sock
except ImportError:
    sys.exit(
        "pyowletapi not installed. Run:\n"
        "  python3 -m venv /tmp/owlet-probe && source /tmp/owlet-probe/bin/activate && pip install pyowletapi"
    )


async def probe(region: str, email: str, password: str, samples: int, interval: int) -> bool:
    print(f"→ authenticating against region={region!r} as {email}…")
    api = OwletAPI(region, email, password)
    try:
        await api.authenticate()
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ auth failed: {type(e).__name__}: {e}")
        if region == "europe":
            print("  Tip: retry with --region world if your account is on the US/world backend.")
        else:
            print("  Tip: retry with --region europe if your account is in the EU.")
        return False
    print("  ✓ authenticated")

    try:
        devices = await api.get_devices()
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ get_devices failed: {type(e).__name__}: {e}")
        return False

    if not devices:
        print("  ✗ no devices on this account. Is the sock paired in the Owlet app?")
        return False

    print(f"  found {len(devices)} device(s):")
    socks: list[Sock] = []
    for d in devices:
        dev = d.get("device", {})
        print(f"    · {dev.get('product_name', '?')} — DSN {dev.get('dsn', '?')}")
        socks.append(Sock(api, dev))

    for i in range(samples):
        print(f"\n=== sample {i + 1}/{samples} ===")
        for sock in socks:
            try:
                result = await sock.update_properties()
            except Exception as e:  # noqa: BLE001
                print(f"  ✗ poll failed for {sock}: {type(e).__name__}: {e}")
                continue

            props = result.get("properties", {})
            raw = result.get("raw_properties", {})

            print("\n-- 'properties' (curated by pyowletapi) --")
            print(json.dumps(props, indent=2, default=str))
            print(f"\n-- 'raw_properties' keys ({len(raw)} total) --")
            for k in sorted(raw):
                v = raw[k]
                if isinstance(v, dict):
                    val = v.get("value", v)
                    print(f"  {k}: {val!r}")
                else:
                    print(f"  {k}: {v!r}")

        if i + 1 < samples:
            print(f"\n→ sleeping {interval}s before next sample…")
            await asyncio.sleep(interval)

    print("\n✓ probe complete. If heart_rate, oxygen_saturation, and movement looked sane,")
    print("  the integration is viable.")
    return True


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "--region",
        default=os.environ.get("OWLET_REGION", "europe"),
        choices=["world", "europe"],
        help="Owlet account region (default: europe)",
    )
    p.add_argument("--samples", type=int, default=3, help="Number of polls (default 3)")
    p.add_argument("--interval", type=int, default=30, help="Seconds between polls (default 30)")
    args = p.parse_args()

    email = os.environ.get("OWLET_EMAIL") or input("Owlet email: ").strip()
    password = os.environ.get("OWLET_PASSWORD") or getpass.getpass("Owlet password: ")

    if not email or not password:
        print("email and password are required", file=sys.stderr)
        return 2

    ok = asyncio.run(probe(args.region, email, password, args.samples, args.interval))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

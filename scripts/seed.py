"""Seed 7 days of fake feeds + pumps for comparison testing.

Usage: ZOEY_DB_PATH=./local.db python scripts/seed.py
"""

import os
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("DB_PATH", str(Path(__file__).resolve().parent.parent / "local.db"))

from backend.db import init_db  # noqa: E402
from backend import repo  # noqa: E402

TZ = ZoneInfo("Europe/Vienna")


def main() -> None:
    init_db()
    repo.insert_weight(datetime.now(TZ), weight_grams=2400, ml_per_kg_per_day=160, notes="seeded")
    today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    feed_targets = [55, 50, 60, 45, 55, 50, 60, 45]  # baseline ml at each of the 8 feeds
    for d in range(1, 8):
        day = today - timedelta(days=d)
        for i, target in enumerate(feed_targets):
            t = day + timedelta(hours=i * 3)
            amount = max(20, target + random.randint(-8, 8))
            repo.insert_feed(t, amount, None)
            if random.random() < 0.85:
                repo.insert_pump(t + timedelta(minutes=20), amount + random.randint(0, 20), None)
    print("Seeded 7 days of feeds + pumps.")


if __name__ == "__main__":
    main()

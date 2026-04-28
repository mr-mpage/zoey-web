#!/bin/bash
# Daily export of Zoey tracker data → CSV/JSON files committed to GitHub.
# Lives at /srv/zoey-tracker/scripts/export-to-github.sh on the server.

set -euo pipefail

REPO_DIR=/srv/zoey-tracker/data-backup
DB_PATH=/srv/zoey-tracker/data/zoey.db

cd "$REPO_DIR"
git pull --rebase --autostash 2>/dev/null || true

python3 - "$DB_PATH" "$REPO_DIR" <<'PY'
import csv, json, sqlite3, sys
from datetime import datetime
from pathlib import Path

db_path = sys.argv[1]
out = Path(sys.argv[2])

db = sqlite3.connect(db_path)
db.row_factory = sqlite3.Row

def write_csv(name, rows, headers):
    with (out / f"{name}.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(headers)
        for r in rows:
            w.writerow([r[h] for h in headers])

feeds = list(db.execute("SELECT id, fed_at, amount_ml, notes FROM feeds ORDER BY fed_at"))
pumps = list(db.execute("SELECT id, pumped_at, amount_ml, notes FROM pumps ORDER BY pumped_at"))
weights = list(db.execute("SELECT id, recorded_at, weight_grams, ml_per_kg_per_day, notes FROM weight_entries ORDER BY recorded_at"))
settings = {r["key"]: r["value"] for r in db.execute("SELECT key, value FROM app_settings")}

write_csv("feeds", feeds, ["id", "fed_at", "amount_ml", "notes"])
write_csv("pumps", pumps, ["id", "pumped_at", "amount_ml", "notes"])
write_csv("weights", weights, ["id", "recorded_at", "weight_grams", "ml_per_kg_per_day", "notes"])
(out / "settings.json").write_text(json.dumps(settings, indent=2, sort_keys=True) + "\n")

snapshot = {
    "feeds": [dict(r) for r in feeds],
    "pumps": [dict(r) for r in pumps],
    "weights": [dict(r) for r in weights],
    "settings": settings,
}
(out / "snapshot.json").write_text(json.dumps(snapshot, indent=2, default=str) + "\n")

total_feeds = sum(r["amount_ml"] for r in feeds)
total_pumps = sum(r["amount_ml"] for r in pumps)
latest_w = weights[-1] if weights else None
ts = datetime.now().astimezone().isoformat(timespec="seconds")

lines = [
    "# Zoey tracker — data backup",
    "",
    "Off-server snapshot of the SQLite database behind the Zoey feed tracker.",
    "Refreshed daily at 06:00 local time by a cron job on the home server.",
    "",
    "## Last export",
    ts,
    "",
    "## Counts",
    f"- Feeds: {len(feeds)} ({total_feeds:.0f} ml total)",
    f"- Pumps: {len(pumps)} ({total_pumps:.0f} ml total)",
    f"- Weight entries: {len(weights)}",
]
if latest_w:
    lines.append(
        f"- Latest weight: {latest_w['weight_grams']} g @ "
        f"{latest_w['ml_per_kg_per_day']} ml/kg/day (recorded {latest_w['recorded_at']})"
    )
lines += [
    "",
    "## Files",
    "- feeds.csv / pumps.csv / weights.csv — append-only history, line-oriented for clean diffs",
    "- settings.json — current app settings (day anchor, ml/kg/day band)",
    "- snapshot.json — combined snapshot of all four",
    "",
    "To restore from this backup, load the rows back into the SQLite tables `feeds`, `pumps`, `weight_entries`, `app_settings`.",
    "",
]
(out / "README.md").write_text("\n".join(lines))
print("export complete")
PY

if git diff --quiet && git diff --staged --quiet; then
    # No tracked changes; check for untracked (first run case)
    if [ -z "$(git status --porcelain)" ]; then
        echo "no changes since last export"
        exit 0
    fi
fi

git add -A
git -c user.email="zoey-data-bot@example.com" \
    -c user.name="Zoey data bot" \
    commit -m "data: $(date +'%Y-%m-%d %H:%M %Z')"
git push 2>&1 | tail -3
echo "pushed"

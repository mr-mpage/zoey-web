#!/bin/bash
# Daily export of tracker data → CSV/JSON files committed to a separate
# git repo. Drop this in cron and point the env vars at your data-backup
# repo + DB path:
#
#   ZOEY_DATA_REPO=/srv/zoey-tracker/data-backup \
#   ZOEY_DB_PATH=/srv/zoey-tracker/data/zoey.db \
#   ZOEY_BOT_EMAIL=tracker-bot@example.com \
#   ZOEY_BOT_NAME="Tracker bot" \
#       /srv/zoey-tracker/scripts/export-to-github.sh

set -euo pipefail

REPO_DIR="${ZOEY_DATA_REPO:?set ZOEY_DATA_REPO to the data-backup repo path}"
DB_PATH="${ZOEY_DB_PATH:?set ZOEY_DB_PATH to the live SQLite file}"
BOT_EMAIL="${ZOEY_BOT_EMAIL:-tracker-bot@example.invalid}"
BOT_NAME="${ZOEY_BOT_NAME:-Tracker bot}"

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

feeds = list(db.execute(
    "SELECT id, fed_at, amount_ml, notes, is_extra, method, duration_min, feeding_day_override "
    "FROM feeds ORDER BY fed_at"
))
pumps = list(db.execute("SELECT id, pumped_at, amount_ml, notes FROM pumps ORDER BY pumped_at"))
weights = list(db.execute("SELECT id, recorded_at, weight_grams, ml_per_kg_per_day, notes, is_auto FROM weight_entries ORDER BY recorded_at"))
diapers = list(db.execute("SELECT id, recorded_at, kind, notes FROM diapers ORDER BY recorded_at"))
settings = {r["key"]: r["value"] for r in db.execute("SELECT key, value FROM app_settings")}
# Defence-in-depth: exclude Owlet credentials from the off-site backup
# even though the password is stored Fernet-encrypted in the DB. The
# backup repo is private but a copy that lives outside the home server
# shouldn't carry integration credentials at all.
for k in ("owlet_email", "owlet_password_encrypted", "owlet_region"):
    settings.pop(k, None)
# Daily vitals aggregates: tiny and worth backing up. Raw vitals are
# transient (rolled up after 14 days) so we skip them.
try:
    vitals_daily = list(db.execute(
        "SELECT feeding_day, hr_avg, hr_min, hr_max, spo2_avg, spo2_min_avg10, "
        "monitoring_minutes, session_count, low_spo2_alert_count, sample_count, computed_at "
        "FROM vitals_daily ORDER BY feeding_day"
    ))
except sqlite3.OperationalError:
    vitals_daily = []  # table missing on older deploys

write_csv("feeds", feeds, ["id", "fed_at", "amount_ml", "notes", "is_extra", "method", "duration_min", "feeding_day_override"])
write_csv("pumps", pumps, ["id", "pumped_at", "amount_ml", "notes"])
write_csv("weights", weights, ["id", "recorded_at", "weight_grams", "ml_per_kg_per_day", "notes", "is_auto"])
write_csv("diapers", diapers, ["id", "recorded_at", "kind", "notes"])
if vitals_daily:
    write_csv("vitals_daily", vitals_daily, [
        "feeding_day", "hr_avg", "hr_min", "hr_max", "spo2_avg", "spo2_min_avg10",
        "monitoring_minutes", "session_count", "low_spo2_alert_count", "sample_count", "computed_at",
    ])
(out / "settings.json").write_text(json.dumps(settings, indent=2, sort_keys=True) + "\n")

snapshot = {
    "feeds": [dict(r) for r in feeds],
    "pumps": [dict(r) for r in pumps],
    "weights": [dict(r) for r in weights],
    "diapers": [dict(r) for r in diapers],
    "vitals_daily": [dict(r) for r in vitals_daily],
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
    f"- Diapers: {len(diapers)}",
]
if latest_w:
    lines.append(
        f"- Latest weight: {latest_w['weight_grams']} g @ "
        f"{latest_w['ml_per_kg_per_day']} ml/kg/day (recorded {latest_w['recorded_at']})"
    )
lines += [
    "",
    "## Files",
    "- feeds.csv / pumps.csv / weights.csv / diapers.csv — append-only history, line-oriented for clean diffs",
    "- settings.json — current app settings (day anchor, ml/kg/day bands, etc.)",
    "- snapshot.json — combined lossless snapshot, suitable for restore",
    "",
    "## Restore",
    "From the main repo: `python scripts/restore-from-snapshot.py <snapshot.json> --db <path/to/zoey.db>`",
    "Run against an empty DB. Pass `--force` to wipe and replace an existing DB.",
    "",
]
(out / "README.md").write_text("\n".join(lines))
print("export complete")
PY

if git diff --quiet && git diff --staged --quiet; then
    if [ -z "$(git status --porcelain)" ]; then
        echo "no changes since last export"
        exit 0
    fi
fi

git add -A
git -c user.email="$BOT_EMAIL" \
    -c user.name="$BOT_NAME" \
    commit -m "data: $(date +'%Y-%m-%d %H:%M %Z')"
git push 2>&1 | tail -3
echo "pushed"

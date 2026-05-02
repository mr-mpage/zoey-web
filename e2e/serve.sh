#!/usr/bin/env bash
# Build the frontend bundle and start the FastAPI app serving both /api
# and the SPA on a single port, so Playwright doesn't have to dance
# between two dev servers (and the same-origin cookie path matches prod).
#
# Idempotent: skips the rebuild if the frontend bundle is fresher than
# the source. The static/ dir is symlinked rather than copied so we
# don't churn the filesystem each run.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Build frontend if dist is missing or stale relative to source.
needs_build=0
if [ ! -d "frontend/dist" ]; then
    needs_build=1
elif [ -n "$(find frontend/src frontend/public frontend/index.html frontend/vite.config.ts -newer frontend/dist 2>/dev/null | head -1)" ]; then
    needs_build=1
fi

if [ "$needs_build" = "1" ]; then
    echo "[e2e] building frontend..."
    (cd frontend && npm run build)
fi

# Point the FastAPI app's static_dir at the freshly built bundle.
ln -sfn frontend/dist static

# Per-run DB so each suite starts clean.
DB="$(mktemp -t zoey-e2e.XXXXXX.db)"
trap 'rm -f "$DB"' EXIT

# Test passcode + matching bcrypt hash, generated once and reused.
# Numeric, since the lock-screen UI is a digit keypad.
# (rounds=4 → fast; we're not protecting anything in CI.)
HASH="$(.venv/bin/python -c 'import bcrypt; print(bcrypt.hashpw(b"9999", bcrypt.gensalt(rounds=4)).decode())')"

export SESSION_SECRET="e2e-session-secret"
export ZOEY_PASSCODE_HASH="$HASH"
export DB_PATH="$DB"
# Disable Owlet polling so a missing test account doesn't spam logs.
unset ZOEY_OWLET_EMAIL
# Anyone hitting the loopback port is "trusted" for XFF purposes.
export TRUSTED_PROXIES="127.0.0.1,::1,testclient"

echo "[e2e] starting backend on http://127.0.0.1:8081"
exec .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8081 --log-level warning

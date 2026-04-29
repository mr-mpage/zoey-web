# Zoey Feed Tracker

Mobile-first webapp for tracking feeds, pumps, diapers, and weight for our daughter
Zoey, who was born preterm at 35 weeks. Surfaces same-feed-of-day historical
comparisons, weight-based daily intake targets, and PMA-aware growth bands so we
can answer the actual decision-day questions: *is this low feed normal?*, *are we
on track today?*, *is she gaining at the right rate?*

Live at <https://zoey.example.com>, behind a shared 6-digit passcode.

## Features

- **Today** — progress ring vs daily target, 7-tier pace chip with signed gap,
  next-feed adaptive schedule with catch-up math, per-feed comparison badges
  (↓ ≈ ↑) against the same feed-of-day from the last 7 days, encouragement card.
- **Feeds** — bottle and breast (estimated, doesn't pollute bottle averages),
  scheduled and extras, day-anchor with override picker for boundary feeds,
  free-text notes for ad-hoc context (fortifier, spit-up, etc.).
- **Pumps** — 30-day supply chart with rolling 7-day average, day-grouped detail
  view of the last 7 days, edit/delete with undo.
- **Weight** — append-only history, weight trend sparkline, **Fenton 2025 girls
  percentile chart** with PMA-derived percentile estimate, per-row gain coloured
  against PMA-aware bands (Fenton + AAP/ESPGHAN 2022).
- **Diapers** — wet/dirty counters with single-tap log, hydration verdict on the
  Overview tab.
- **Overview** — at-a-glance status across Intake, Growth, Today's pace, Hydration.
- **Reminders** — Web Push 15 min before each scheduled feed, adaptive to her
  actual rhythm. iOS requires the PWA installed to Home Screen.
- **Doctor report** — `/api/report?days=14` renders a printable HTML summary
  (intake table, weight history with gains, all feed notes); iOS Safari "Save
  to Files → PDF" handles export.
- **Symmetrical toasts** — every save flashes a confirmation; every delete shows
  a 5-second undo toast that re-creates the snapshot via the existing POST.

## Stack

- **Backend** — FastAPI + SQLite, Python 3.12, web-push (`pywebpush`), bcrypt
  for the passcode, signed session cookie via `itsdangerous`.
- **Frontend** — React 19 + TanStack Query 5 + Tailwind v4 + Vite +
  TypeScript. PWA service worker for installable iOS standalone mode.
- **Container** — single multi-stage Docker image (frontend bundle copied into
  the FastAPI static dir). No Node runtime in production.
- **Reverse proxy** — Nginx Proxy Manager (out-of-band on the server) terminates
  TLS via Let's Encrypt and routes `zoey.example.com` to `127.0.0.1:8087`.

## Local development

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api → :8000
```

First-time setup of `.env` from `.env.example`:

```bash
python scripts/hash_passcode.py 123456            # bcrypt hash
python -c "import secrets; print(secrets.token_urlsafe(48))"   # session secret
```

When pasting a bcrypt hash into `.env` for `docker-compose env_file`, escape every
`$` as `$$` — Compose interpolates single `$` as a variable reference.

## Production build

```bash
docker compose up --build
# http://localhost:8087
```

## Deploy

The production server runs Compose with a base file plus `docker-compose.prod.yml`,
which switches the data bind-mount to `/srv/zoey-tracker/data` (so it's
swept by the existing nightly `backup-appdata.sh`). The base file alone won't
find the live database.

```bash
cd frontend && npm run build && cd ..
rsync -az \
  --exclude .git --exclude node_modules --exclude .venv --exclude __pycache__ \
  --exclude 'frontend/dist' --exclude 'backend/data' --exclude '.env' \
  ./ your-server:/srv/zoey-tracker/

ssh your-server '
  cd /srv/zoey-tracker \
  && docker compose -f docker-compose.yml -f docker-compose.prod.yml build \
  && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
'
```

Verify with `ssh your-server 'docker logs --tail 30 zoey-tracker'` and
`curl -s -o /dev/null -w "%{http_code}\n" https://zoey.example.com/api/auth/me`
(should return `401` without a session cookie).

## Off-server backup

`scripts/export-to-github.sh` runs daily via cron (`0 6 * * *`), exporting feeds,
pumps, weights, diapers, and settings as CSV + JSON, committing to a private
GitHub repo (`mr-mpage/your-data-backup`) over a deploy-key SSH key. Combined
with the appdata sweep to the Hetzner Storage Box, the database has two
independent off-host copies.

## Auth

- Single shared 6-digit passcode (intentionally — two-parent household, no need
  for per-user attribution). Stored as a bcrypt hash in `.env`.
- 90-day signed session cookie (HttpOnly, Secure, SameSite=Lax).
- 5 failed attempts in 15 min → 429 lockout (in-memory; resets on container
  restart).

To rotate the passcode:

```bash
python scripts/hash_passcode.py <new-pin>
# update ZOEY_PASSCODE_HASH in /srv/zoey-tracker/.env, escaping every $ as $$
ssh your-server '
  cd /srv/zoey-tracker \
  && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
'
```

## Project structure

```
backend/
  main.py            FastAPI app + SPA fallback
  auth.py            passcode + signed session cookie + rate limit
  db.py              schema + migrations on startup
  repo.py            thin SQLite data-access helpers
  comparisons.py     feeding-day indexing, PMA helpers
  services.py        compute_overview, compute_next_feed
  scheduler.py       background reminder loop (Web Push)
  push.py            VAPID key handling, push delivery
  routers/           feeds, pumps, weight, diapers, settings, push,
                       overview, dashboard, report, auth
frontend/
  src/api/           client + typed hooks
  src/components/    ToastHost, FentonChart, PumpDailyChart, modals,
                       sparklines, etc.
  src/screens/       Today, Pumps, History (Feeds + Weight sub-tabs),
                       Settings, Overview
  src/lib/           growth bands, fenton 2025 reference, push helpers,
                       formatting
scripts/
  hash_passcode.py        one-shot bcrypt helper
  export-to-github.sh     nightly off-server backup
docker-compose.yml         base service definition, dev-style ./data mount
docker-compose.prod.yml    server overlay: appdata data mount, cap_drop, etc.
Dockerfile                 multi-stage: frontend bundle → FastAPI image
```

## Data model

SQLite at `/data/zoey.db` (bind-mounted from `/srv/zoey-tracker/data`
in production):

- `weight_entries` — append-only weight + ml/kg/day rate history
- `feeds` — `fed_at`, `amount_ml`, `notes`, `is_extra`, `method`,
  `duration_min`, `feeding_day_override`
- `pumps` — `pumped_at`, `amount_ml`, `notes`
- `diapers` — `recorded_at`, `kind` (`wet`|`dirty`), `notes`
- `push_subscriptions` — Web Push endpoints + keys, last-notified marker
- `app_settings` — anchor time, feeds per day, colour bands, birth date,
  GA weeks

# Zoey Feed Tracker

Mobile-first webapp for tracking Zoey's bottle feeds and pumping sessions, comparing intake against a weight-based daily goal, and surfacing same-feed-of-day historical averages so we can judge when a low feed is normal vs. a problem.

Runs on the family Hetzner VPS at `https://zoey.example.com` behind NPM, protected by a shared 6-digit passcode.

See [docs/PLAN.md](docs/PLAN.md) for full design rationale.

## Local development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api → :8000
```

Set up `.env` first — copy `.env.example`, then:

```bash
python scripts/hash_passcode.py 123456   # outputs the bcrypt hash
python -c "import secrets; print(secrets.token_urlsafe(48))"   # session secret
```

## Production build (single container)

```bash
docker compose up --build
# http://localhost:8087
```

## Deploy

```bash
cd frontend && npm run build && cd ..
rsync -avz --exclude node_modules --exclude .git --exclude frontend/dist \
  ./ your-server:/srv/zoey-tracker/
ssh your-server 'cd /srv/zoey-tracker && docker compose build && docker compose up -d'
```

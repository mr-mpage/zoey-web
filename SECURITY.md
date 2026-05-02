# Security

## Threat model

Zoey Tracker is a **single-household, self-hosted webapp**. The intended
deployment is one container behind a TLS-terminating reverse proxy on a
private VPS, accessed by 1–4 adults from their phones. It is not designed
for multi-tenant use, and there is no per-user account model — there's a
single shared edit passcode and optional shared read-only viewer PINs.

The defenders are the operators (you). The attackers we care about are:

- **Drive-by scanners** hitting the public hostname — covered by passcode
  auth, rate limiting, no public registration.
- **Curious read-only viewers** with a guest PIN — should not be able to
  reach mutation endpoints or list device push endpoints.
- **An attacker who learns one passcode** — the lockout window slows brute
  force; the operator is expected to rotate after any suspected compromise.

We **do not** defend against:
- A compromised operator workstation (`.env` exfiltrated).
- Forensic access to the SQLite file or backups.
- The Owlet account being compromised (vitals are read directly from the
  Owlet API; we don't add a security layer over it).

## Data handling

What's stored, where, and for how long:

| Data | Where | Retention |
| --- | --- | --- |
| Feeds, pumps, weights, diapers, meds, vitals | SQLite at `/data/zoey.db` | Forever (until you delete) |
| Raw Owlet samples | `vitals` table | `VITALS_RAW_RETAIN_DAYS` (default 14d) before being rolled into `vitals_daily` and pruned |
| Web Push subscription endpoints + keys | `push_subscriptions` | Until the subscription is unsubscribed or invalidated by the push provider |
| Login attempt counters (per-IP) | In-memory dict | Up to `RATE_LIMIT_WINDOW_MIN` (default 15 min) or until container restart |
| Bcrypt hashes (passcodes) | `.env` (edit) and `viewer_passcodes` table | Until rotated |

No analytics, no telemetry, no third-party requests. The container only
talks to:
1. Web Push providers (Apple, Google, Mozilla) when reminders fire, signed
   with your VAPID keys.
2. Owlet's API, if you've configured `ZOEY_OWLET_EMAIL`.

## Posture

- **HTTPS only.** The session cookie has `Secure`, `HttpOnly`, `SameSite=Lax`.
  The app sets `Strict-Transport-Security`, `X-Frame-Options: DENY`, `CSP`
  with a per-request nonce for inline scripts, `Permissions-Policy` denying
  camera/mic/geolocation/etc., and `X-Robots-Tag: noindex, nofollow`.
- **Bcrypt cost 12** for both the edit passcode and viewer passcodes.
- **Constant-time compares** (bcrypt internally; cookie HMAC via
  `itsdangerous`).
- **Rate limit:** 5 failed attempts per IP in a 15-minute rolling window
  yields a 429. The IP is the connection peer unless it's in
  `TRUSTED_PROXIES`, in which case the leftmost `X-Forwarded-For` value is
  used. **If you bind the container to a public address rather than
  localhost-behind-proxy, update `TRUSTED_PROXIES` accordingly or attackers
  can spoof XFF and bypass the limiter.**
- **SQL is parameterised** throughout `backend/repo.py`; no string
  concatenation into queries.
- **PDF report HTML** escapes every user-controlled value (`html.escape`).
- **Service worker** clamps `notificationclick` URLs to same-origin paths.
- **Container** runs as non-root UID 1000, `read_only: true`, `cap_drop: ALL`,
  `no-new-privileges`. Bind the upstream port to `127.0.0.1` (the included
  `docker-compose.yml` does this).

## On first boot

The app refuses to start if `SESSION_SECRET` or `ZOEY_PASSCODE_HASH` is
empty. This is intentional — running with a default-key cookie signer means
anyone can forge sessions, and running without a passcode means anyone can
log in.

## Reporting a vulnerability

This is a personal project; there is no formal bounty programme. If you
find something real, please open a private security advisory on GitHub or
email the author at the address listed in the repo metadata. Drive-by
issues (e.g. "the container doesn't enforce HTTPS internally") will be
read but probably not fixed unless they're exploitable from the threat
model above.

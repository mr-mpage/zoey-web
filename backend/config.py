from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    zoey_passcode_hash: str = ""
    # Empty by default — startup checks (main.py) refuse to boot until both
    # this and zoey_passcode_hash are set, so a misconfigured deploy fails
    # loudly instead of running with a known-public HMAC key or no auth.
    session_secret: str = ""
    db_path: str = "/data/zoey.db"
    tz: str = "Europe/Vienna"
    # 15% — tolerance for per-feed comparison badges (↓ ≈ ↑) where natural
    # variation between feeds at the same slot is wide.
    comparison_threshold_pct: float = 15.0
    session_max_age_days: int = 90
    viewer_session_max_age_days: int = 7
    rate_limit_window_min: int = 15
    rate_limit_max_attempts: int = 5
    # Comma-separated CIDRs / IPs that may set X-Forwarded-For. The
    # auth.client_ip helper only honours XFF when the connection peer is
    # in this list; otherwise it uses request.client.host. Default is the
    # loopback addresses used by `docker compose -p host`.
    trusted_proxies: str = "127.0.0.1,::1"
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_contact_email: str = ""
    push_lead_minutes: int = 15
    push_check_interval_s: int = 60
    # Owlet integration. Optional — leave email blank to disable polling.
    zoey_owlet_email: str = ""
    zoey_owlet_password: str = ""
    zoey_owlet_region: str = "europe"  # "world" or "europe"
    owlet_poll_interval_s: int = 120
    # Tiered retention for raw vitals: keep N days raw (so we can recompute
    # aggregates if the formula changes); roll older days into vitals_daily
    # and delete the raw rows.
    vitals_raw_retain_days: int = 14


settings = Settings()


def db_file() -> Path:
    return Path(settings.db_path)

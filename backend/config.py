from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    zoey_passcode_hash: str = ""
    session_secret: str = "dev-secret-change-me"
    db_path: str = "/data/zoey.db"
    tz: str = "Europe/Vienna"
    # 15% — tolerance for per-feed comparison badges (↓ ≈ ↑) where natural
    # variation between feeds at the same slot is wide.
    comparison_threshold_pct: float = 15.0
    # 10% — tolerance for the cumulative pace chip ('on track / behind /
    # ahead'). Tighter than per-feed because deviations accumulate across
    # multiple feeds.
    pace_threshold_pct: float = 10.0
    session_max_age_days: int = 90
    viewer_session_max_age_days: int = 7
    rate_limit_window_min: int = 15
    rate_limit_max_attempts: int = 5
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_contact_email: str = "m.page@vendure.io"
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
    # Threshold for what counts as a "low SpO2 alert event" — Owlet's own
    # alerts are also persisted via the LOW_OX_ALRT property, but we count
    # crossings of this band as a backup signal.
    vitals_low_spo2_threshold: int = 90


settings = Settings()


def db_file() -> Path:
    return Path(settings.db_path)

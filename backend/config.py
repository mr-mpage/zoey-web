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
    rate_limit_window_min: int = 15
    rate_limit_max_attempts: int = 5
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_contact_email: str = "m.page@vendure.io"
    push_lead_minutes: int = 15
    push_check_interval_s: int = 60


settings = Settings()


def db_file() -> Path:
    return Path(settings.db_path)

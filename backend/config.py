from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    zoey_passcode_hash: str = ""
    session_secret: str = "dev-secret-change-me"
    db_path: str = "/data/zoey.db"
    tz: str = "Europe/Vienna"
    comparison_threshold_pct: float = 15.0
    session_max_age_days: int = 90
    rate_limit_window_min: int = 15
    rate_limit_max_attempts: int = 5


settings = Settings()


def db_file() -> Path:
    return Path(settings.db_path)

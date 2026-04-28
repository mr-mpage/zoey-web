from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FeedIn(BaseModel):
    amount_ml: float = Field(gt=0, le=500)
    fed_at: Optional[datetime] = None
    notes: Optional[str] = None


class FeedPatch(BaseModel):
    amount_ml: Optional[float] = Field(default=None, gt=0, le=500)
    fed_at: Optional[datetime] = None
    notes: Optional[str] = None


class Feed(BaseModel):
    id: int
    fed_at: datetime
    amount_ml: float
    notes: Optional[str] = None


class PumpIn(BaseModel):
    amount_ml: float = Field(gt=0, le=1000)
    pumped_at: Optional[datetime] = None
    notes: Optional[str] = None


class PumpPatch(BaseModel):
    amount_ml: Optional[float] = Field(default=None, gt=0, le=1000)
    pumped_at: Optional[datetime] = None
    notes: Optional[str] = None


class Pump(BaseModel):
    id: int
    pumped_at: datetime
    amount_ml: float
    notes: Optional[str] = None


class WeightIn(BaseModel):
    weight_grams: int = Field(gt=500, lt=20000)
    ml_per_kg_per_day: int = Field(gt=50, lt=300)
    notes: Optional[str] = None


class Weight(BaseModel):
    id: int
    recorded_at: datetime
    weight_grams: int
    ml_per_kg_per_day: int
    notes: Optional[str] = None


class WeightStatus(BaseModel):
    current: Optional[Weight]
    daily_target_ml: float
    per_feed_target_ml: float
    feeds_per_day: int = 8
    history: list[Weight]


class FeedComparison(BaseModel):
    feed_index: int
    avg_ml: Optional[float]
    min_ml: Optional[float]
    max_ml: Optional[float]
    sample_days: int


class FeedWithComparison(Feed):
    feed_index: int
    comparison: FeedComparison
    status: str  # "below" | "normal" | "above"


class NextFeedHint(BaseModel):
    feed_index: int
    target_ml: float        # catch-up target — adjusts to current pace
    base_target_ml: float   # static daily/8 baseline
    historical_avg_ml: Optional[float]


class Dashboard(BaseModel):
    today_date: str
    feeding_day_start: datetime
    feeding_day_end: datetime
    daily_target_ml: float
    per_feed_target_ml: float
    feeds_today: list[FeedWithComparison]
    feeds_total_ml: float
    feeds_avg_ml: Optional[float]
    feeds_remaining: int
    pace_status: str  # "behind" | "on_track" | "ahead"
    gap_ml: float  # positive = ahead, negative = behind, vs expected at this feed count
    pumps_today_ml: float
    pumps_today_count: int
    next_feed: Optional[NextFeedHint]
    weight: WeightStatus


class LoginIn(BaseModel):
    passcode: str


class AppSettings(BaseModel):
    day_start_hour: int = Field(ge=0, le=23)
    day_start_minute: int = Field(ge=0, le=59)


class AppSettingsPatch(BaseModel):
    day_start_hour: Optional[int] = Field(default=None, ge=0, le=23)
    day_start_minute: Optional[int] = Field(default=None, ge=0, le=59)

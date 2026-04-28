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
    target_ml: float
    historical_avg_ml: Optional[float]


class Dashboard(BaseModel):
    today_date: str
    daily_target_ml: float
    per_feed_target_ml: float
    feeds_today: list[FeedWithComparison]
    feeds_total_ml: float
    feeds_avg_ml: Optional[float]
    feeds_remaining: int
    pace_status: str  # "behind" | "on_track" | "ahead"
    pumps_today_ml: float
    pumps_today_count: int
    next_feed: Optional[NextFeedHint]
    weight: WeightStatus


class LoginIn(BaseModel):
    passcode: str

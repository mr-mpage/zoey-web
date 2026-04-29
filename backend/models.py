from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FeedIn(BaseModel):
    amount_ml: float = Field(ge=0, le=500)  # 0 allowed for breast comfort attempts
    fed_at: Optional[datetime] = None
    notes: Optional[str] = None
    is_extra: bool = False
    method: str = Field(default="bottle", pattern="^(bottle|breast)$")
    duration_min: Optional[int] = Field(default=None, ge=0, le=240)
    feeding_day_override: Optional[str] = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")


class FeedPatch(BaseModel):
    amount_ml: Optional[float] = Field(default=None, ge=0, le=500)
    fed_at: Optional[datetime] = None
    notes: Optional[str] = None
    is_extra: Optional[bool] = None
    method: Optional[str] = Field(default=None, pattern="^(bottle|breast)$")
    duration_min: Optional[int] = Field(default=None, ge=0, le=240)
    feeding_day_override: Optional[str] = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")


class Feed(BaseModel):
    id: int
    fed_at: datetime
    amount_ml: float
    notes: Optional[str] = None
    is_extra: bool = False
    method: str = "bottle"
    duration_min: Optional[int] = None
    feeding_day_override: Optional[str] = None


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
    feed_index: Optional[int] = None  # None for extras
    comparison: Optional[FeedComparison] = None
    status: str = "normal"  # "below" | "normal" | "above"


class NextFeedHint(BaseModel):
    feed_index: int
    target_ml: float        # catch-up target — adjusts to current pace
    base_target_ml: float   # static daily/N baseline
    historical_avg_ml: Optional[float]
    expected_at: datetime   # adaptive: last scheduled feed + interval, or anchor for feed #1


class DiaperIn(BaseModel):
    kind: str = Field(pattern="^(wet|dirty)$")
    recorded_at: Optional[datetime] = None
    notes: Optional[str] = None


class DiaperPatch(BaseModel):
    kind: Optional[str] = Field(default=None, pattern="^(wet|dirty)$")
    recorded_at: Optional[datetime] = None
    notes: Optional[str] = None


class Diaper(BaseModel):
    id: int
    recorded_at: datetime
    kind: str
    notes: Optional[str] = None


class DiaperSummary(BaseModel):
    wet: int = 0
    dirty: int = 0


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
    schedule_drift_min: Optional[int]  # avg minutes late/early vs the rigid grid; null if no scheduled feeds yet
    projected_last_feed_at: Optional[datetime]  # when feed #N (last) lands if continuing at interval
    day_fit: str  # "fits" | "tight" | "overflow" | "n/a"
    pumps_today_ml: float
    pumps_today_count: int
    diapers_today: DiaperSummary
    breastfeeds_today_count: int = 0
    breastfeeds_today_ml_est: float = 0.0
    breastfeeds_today_minutes: int = 0
    next_feed: Optional[NextFeedHint]
    weight: WeightStatus


class LoginIn(BaseModel):
    passcode: str


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys
    label: Optional[str] = None


class PushSubscriptionOut(BaseModel):
    id: int
    label: Optional[str]
    created_at: datetime
    last_notified_for: Optional[datetime]


class VapidKeyOut(BaseModel):
    vapid_public_key: str


class OverviewIndicator(BaseModel):
    key: str  # 'intake' | 'growth' | 'today_pace' | 'hydration'
    title: str
    status: str  # 'good' | 'watch' | 'concern' | 'over' | 'unknown'
    headline: str  # short verdict, e.g. "In target zone"
    detail: str  # one-sentence supporting context


class OverviewSummary(BaseModel):
    status: str  # aggregate of indicators
    text: str


class Overview(BaseModel):
    indicators: list[OverviewIndicator]
    summary: OverviewSummary


class AppSettings(BaseModel):
    day_start_hour: int = Field(ge=0, le=23)
    day_start_minute: int = Field(ge=0, le=59)
    feeds_per_day: int = Field(ge=4, le=12)
    target_concern_ml_per_kg: int = Field(ge=20, le=300)
    target_low_ml_per_kg: int = Field(ge=50, le=300)
    target_solid_ml_per_kg: int = Field(ge=50, le=400)
    target_high_ml_per_kg: int = Field(ge=50, le=400)
    birth_date: str  # YYYY-MM-DD
    gestational_age_weeks: int = Field(ge=22, le=42)


class AppSettingsPatch(BaseModel):
    day_start_hour: Optional[int] = Field(default=None, ge=0, le=23)
    day_start_minute: Optional[int] = Field(default=None, ge=0, le=59)
    feeds_per_day: Optional[int] = Field(default=None, ge=4, le=12)
    target_concern_ml_per_kg: Optional[int] = Field(default=None, ge=20, le=300)
    target_low_ml_per_kg: Optional[int] = Field(default=None, ge=50, le=300)
    target_solid_ml_per_kg: Optional[int] = Field(default=None, ge=50, le=400)
    target_high_ml_per_kg: Optional[int] = Field(default=None, ge=50, le=400)
    birth_date: Optional[str] = None
    gestational_age_weeks: Optional[int] = Field(default=None, ge=22, le=42)

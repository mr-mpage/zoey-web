export type FeedMethod = 'bottle' | 'breast'

export type Feed = {
  id: number
  fed_at: string
  amount_ml: number
  notes: string | null
  is_extra: boolean
  method: FeedMethod
  duration_min: number | null
  /** YYYY-MM-DD; when set, this feed counts toward this feeding day rather
   *  than the one derived from fed_at + anchor. */
  feeding_day_override: string | null
}

export type Pump = {
  id: number
  pumped_at: string
  amount_ml: number
  notes: string | null
}

export type Diaper = {
  id: number
  recorded_at: string
  kind: 'wet' | 'dirty'
  notes: string | null
}

export type DiaperSummary = {
  wet: number
  dirty: number
}

export type Weight = {
  id: number
  recorded_at: string
  weight_grams: number
  ml_per_kg_per_day: number
  notes: string | null
  /** True for rows the server filled in by extrapolating from manual
   *  history. These are not editable; logging a manual weight for that
   *  day overrides the estimate. */
  is_auto: boolean
}

export type WeightStatus = {
  current: Weight | null
  daily_target_ml: number
  per_feed_target_ml: number
  feeds_per_day: number
  history: Weight[]
}

export type FeedComparison = {
  feed_index: number
  avg_ml: number | null
  min_ml: number | null
  max_ml: number | null
  sample_days: number
}

export type FeedWithComparison = Feed & {
  feed_index: number | null
  comparison: FeedComparison | null
  status: 'below' | 'normal' | 'above'
}

export type NextFeedHint = {
  feed_index: number
  target_ml: number       // catch-up target
  base_target_ml: number  // static daily/N baseline
  historical_avg_ml: number | null
  expected_at: string     // ISO timestamp, adaptive (last scheduled + interval)
}

export type Dashboard = {
  today_date: string
  feeding_day_start: string
  feeding_day_end: string
  daily_target_ml: number
  per_feed_target_ml: number
  feeds_today: FeedWithComparison[]
  feeds_total_ml: number
  feeds_avg_ml: number | null
  feeds_remaining: number
  pace_status:
    | 'well_behind'
    | 'behind'
    | 'slightly_behind'
    | 'on_track'
    | 'slightly_ahead'
    | 'ahead'
    | 'well_ahead'
  gap_ml: number
  schedule_drift_min: number | null
  projected_last_feed_at: string | null
  day_fit: 'fits' | 'tight' | 'overflow' | 'n/a'
  pumps_today_ml: number
  pumps_today_count: number
  diapers_today: DiaperSummary
  breastfeeds_today_count: number
  breastfeeds_today_ml_est: number
  breastfeeds_today_minutes: number
  next_feed: NextFeedHint | null
  weight: WeightStatus
}

export type OverviewStatus = 'good' | 'watch' | 'concern' | 'over' | 'unknown'

export type OverviewIndicator = {
  key: string
  title: string
  status: OverviewStatus
  headline: string
  detail: string
}

export type Overview = {
  indicators: OverviewIndicator[]
  summary: { status: OverviewStatus; text: string }
}

export type AppSettings = {
  baby_name: string
  parent_names: string
  day_start_hour: number
  day_start_minute: number
  feeds_per_day: number
  bottle_prep_ml: number
  target_concern_ml_per_kg: number
  target_low_ml_per_kg: number
  target_solid_ml_per_kg: number
  target_high_ml_per_kg: number
  birth_date: string
  gestational_age_weeks: number
  birth_weight_grams: number
}

export type Med = {
  id: number
  name: string
  doses_per_day: number
  sort_order: number
  archived: boolean
}

export type MedDoseWithMed = {
  id: number
  med_id: number | null
  name: string  // resolved (med name or one-off label)
  given_at: string
  notes: string | null
  is_extra: boolean
  feeding_day_override: string | null
}

export type MedTodaySlot = {
  slot_index: number
  dose: MedDoseWithMed | null
  is_extra: boolean
}

export type MedTodayRow = {
  med: Med
  slots: MedTodaySlot[]
  extras: MedDoseWithMed[]
}

export type MedsToday = {
  feeding_day: string
  rows: MedTodayRow[]
  one_offs: MedDoseWithMed[]
}

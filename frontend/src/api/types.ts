export type Feed = {
  id: number
  fed_at: string
  amount_ml: number
  notes: string | null
}

export type Pump = {
  id: number
  pumped_at: string
  amount_ml: number
  notes: string | null
}

export type Weight = {
  id: number
  recorded_at: string
  weight_grams: number
  ml_per_kg_per_day: number
  notes: string | null
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
  feed_index: number
  comparison: FeedComparison
  status: 'below' | 'normal' | 'above'
}

export type NextFeedHint = {
  feed_index: number
  target_ml: number       // catch-up target
  base_target_ml: number  // static daily/8 baseline
  historical_avg_ml: number | null
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
  pace_status: 'behind' | 'on_track' | 'ahead'
  gap_ml: number
  pumps_today_ml: number
  pumps_today_count: number
  next_feed: NextFeedHint | null
  weight: WeightStatus
}

export type AppSettings = {
  day_start_hour: number
  day_start_minute: number
}

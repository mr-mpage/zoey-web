import { useMemo } from 'react'
import { useAppSettings, useDiapers, useFeeds, useWeight } from '../api/hooks'
import { MlPerKgSparkline, buildSparklinePoints } from '../components/MlPerKgSparkline'
import { fmtDate } from '../lib/format'
import type { Weight } from '../api/types'

function feedingDayKey(d: Date, anchorH: number, anchorM: number): Date {
  const minutes = d.getHours() * 60 + d.getMinutes()
  const anchor = anchorH * 60 + anchorM
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (minutes < anchor) day.setDate(day.getDate() - 1)
  return day
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Pick the weight entry that should govern a given feeding day:
 * preference 1) entry recorded on that calendar date,
 * preference 2) the most recent entry recorded earlier,
 * fallback) the earliest available entry. */
function weightForDay(day: Date, weights: Weight[]): Weight | null {
  if (weights.length === 0) return null
  const dayStr = ymd(day)
  return (
    weights.find((w) => w.recorded_at.startsWith(dayStr)) ??
    weights.filter((w) => w.recorded_at.slice(0, 10) < dayStr).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0] ??
    [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))[0] ??
    null
  )
}

type Bands = { concern: number; low: number; solid: number; high: number }

/** 5 clinical tiers, edges configurable in Settings. */
function bandTone(mlPerKg: number, b: Bands): string {
  if (mlPerKg >= b.high) return 'text-sky-300'         // above zone
  if (mlPerKg >= b.solid) return 'text-emerald-300'    // solidly in zone
  if (mlPerKg >= b.low) return 'text-lime-300'         // at minimum / lower zone
  if (mlPerKg >= b.concern) return 'text-amber-400'    // under zone
  return 'text-rose-400'                                // significant concern
}

export function HistoryScreen() {
  const { data: feeds } = useFeeds(30)
  const { data: diapers } = useDiapers(30)
  const { data: weight } = useWeight()
  const { data: appSettings } = useAppSettings()
  const anchorH = appSettings?.day_start_hour ?? 2
  const anchorM = appSettings?.day_start_minute ?? 30
  const feedsPerDay = appSettings?.feeds_per_day ?? 8
  const bands: Bands = {
    concern: appSettings?.target_concern_ml_per_kg ?? 130,
    low: appSettings?.target_low_ml_per_kg ?? 150,
    solid: appSettings?.target_solid_ml_per_kg ?? 165,
    high: appSettings?.target_high_ml_per_kg ?? 180,
  }
  const weights = weight?.history ?? []

  const grid = useMemo(() => {
    type Bucket = { day: Date; entries: { time: number; amount: number }[] }
    const byDay = new Map<string, Bucket>()
    for (const f of feeds ?? []) {
      const d = new Date(f.fed_at)
      const dayKey = feedingDayKey(d, anchorH, anchorM)
      const key = dayKey.toDateString()
      if (!byDay.has(key)) byDay.set(key, { day: dayKey, entries: [] })
      byDay.get(key)!.entries.push({ time: +d, amount: f.amount_ml })
    }
    return Array.from(byDay.values())
      .map((b) => {
        const sorted = b.entries.sort((x, y) => x.time - y.time).map((e) => e.amount)
        while (sorted.length < feedsPerDay) sorted.push(0)
        return { day: b.day, feeds: sorted }
      })
      .sort((a, b) => +b.day - +a.day)
  }, [feeds, anchorH, anchorM, feedsPerDay])

  const diapersByDay = useMemo(() => {
    const map = new Map<string, { wet: number; dirty: number }>()
    for (const d of diapers ?? []) {
      const dt = new Date(d.recorded_at)
      const dayKey = feedingDayKey(dt, anchorH, anchorM)
      const key = dayKey.toDateString()
      if (!map.has(key)) map.set(key, { wet: 0, dirty: 0 })
      const bucket = map.get(key)!
      if (d.kind === 'wet') bucket.wet++
      else if (d.kind === 'dirty') bucket.dirty++
    }
    return map
  }, [diapers, anchorH, anchorM])

  const sparkPoints = useMemo(
    () => buildSparklinePoints(feeds ?? [], weights, anchorH, anchorM, 30),
    [feeds, weights, anchorH, anchorM],
  )

  // Show only the last 7 completed days + today in the grid
  const visibleGrid = grid.slice(0, 8)

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-4">Last 7 days</div>

      {sparkPoints.length >= 2 && (
        <div className="rounded-xl bg-zinc-900/60 p-3 mb-4">
          <div className="flex justify-between items-baseline mb-1.5">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">30-day trend</div>
            <div className="text-[11px] text-zinc-500 tabular-nums">{sparkPoints.length} days</div>
          </div>
          <MlPerKgSparkline points={sparkPoints} bands={bands} />
          <div className="mt-1 text-[10px] text-zinc-600 text-center">ml/kg/day · shaded = target zone</div>
        </div>
      )}

      {grid.length === 0 && (
        <div className="rounded-xl bg-zinc-900/40 p-6 text-center text-zinc-500 text-sm">No feeds logged yet.</div>
      )}
      <div className="space-y-3">
        {visibleGrid.map((row) => {
          const total = row.feeds.reduce((a, b) => a + b, 0)
          const dayWeight = weightForDay(row.day, weights)
          const dayTarget = dayWeight ? (dayWeight.weight_grams / 1000) * dayWeight.ml_per_kg_per_day : 0
          const mlPerKg = dayWeight ? total / (dayWeight.weight_grams / 1000) : 0
          const pct = dayTarget > 0 ? total / dayTarget : 0
          const delta = total - dayTarget
          const deltaSign = delta >= 0 ? '+' : '−'
          const todayKey = feedingDayKey(new Date(), anchorH, anchorM)
          const isToday = ymd(row.day) === ymd(todayKey)
          const colour = bandTone(mlPerKg, bands)
          const totalTone = isToday ? 'text-zinc-300' : colour
          const subTone = isToday ? 'text-zinc-500' : colour
          return (
            <div key={row.day.toISOString()} className="rounded-xl bg-zinc-900/60 p-3">
              <div className="flex justify-between items-baseline mb-2">
                <div>
                  <div className="text-sm flex items-center gap-2">
                    {fmtDate(row.day.toISOString())}
                    {isToday && (
                      <span className="text-[10px] uppercase tracking-wider text-pink-300/80 bg-pink-300/10 px-1.5 py-0.5 rounded">today</span>
                    )}
                  </div>
                  {dayTarget > 0 && !isToday && (
                    <div className={`text-[11px] tabular-nums ${subTone}`}>
                      {mlPerKg.toFixed(0)} ml/kg · {deltaSign}{Math.abs(delta).toFixed(0)} ml ({(pct * 100).toFixed(0)}%)
                    </div>
                  )}
                  {isToday && (
                    <div className="text-[11px] text-zinc-500">in progress</div>
                  )}
                </div>
                <div className={`text-sm tabular-nums ${totalTone}`}>
                  {total.toFixed(0)} / {dayTarget.toFixed(0)} ml
                </div>
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${feedsPerDay}, minmax(0, 1fr))` }}>
                {row.feeds.map((v, i) => (
                  <div
                    key={i}
                    className={`text-[11px] tabular-nums text-center py-1.5 rounded ${
                      v > 0 ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-900 text-zinc-700'
                    }`}
                  >
                    {v > 0 ? v.toFixed(0) : '—'}
                  </div>
                ))}
              </div>
              {(() => {
                const dc = diapersByDay.get(row.day.toDateString()) ?? { wet: 0, dirty: 0 }
                if (dc.wet === 0 && dc.dirty === 0) return null
                const lowWet = !isToday && dc.wet < 6
                return (
                  <div className="mt-1.5 text-[11px] text-zinc-500 text-right">
                    <span className={lowWet ? 'text-amber-400' : 'text-zinc-400'}>{dc.wet} wet</span>
                    <span className="text-zinc-600"> · </span>
                    <span className="text-zinc-400">{dc.dirty} dirty</span>
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

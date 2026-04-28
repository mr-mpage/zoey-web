import { useMemo } from 'react'
import { useAppSettings, useFeeds, useWeight } from '../api/hooks'
import { fmtDate } from '../lib/format'
import type { Weight } from '../api/types'

const FEEDS_PER_DAY = 8

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

/** Pick the weight entry that should govern target for a given feeding day:
 * preference 1) entry recorded on that calendar date,
 * preference 2) the most recent entry recorded earlier,
 * fallback) the earliest available entry. */
function targetForDay(day: Date, weights: Weight[]): number {
  if (weights.length === 0) return 0
  const dayStr = ymd(day)
  const sameDay = weights.find((w) => w.recorded_at.startsWith(dayStr))
  const pick =
    sameDay ??
    weights.filter((w) => w.recorded_at.slice(0, 10) < dayStr).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0] ??
    [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))[0]
  return (pick.weight_grams / 1000) * pick.ml_per_kg_per_day
}

function tone(pct: number): string {
  if (pct >= 1.1) return 'text-sky-300'
  if (pct >= 1.0) return 'text-emerald-300'
  if (pct >= 0.95) return 'text-yellow-300'
  if (pct >= 0.85) return 'text-amber-400'
  return 'text-rose-400'
}

export function HistoryScreen() {
  const { data: feeds } = useFeeds(7)
  const { data: weight } = useWeight()
  const { data: appSettings } = useAppSettings()
  const anchorH = appSettings?.day_start_hour ?? 2
  const anchorM = appSettings?.day_start_minute ?? 30
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
        while (sorted.length < FEEDS_PER_DAY) sorted.push(0)
        return { day: b.day, feeds: sorted }
      })
      .sort((a, b) => +b.day - +a.day)
  }, [feeds, anchorH, anchorM])

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-4">Last 7 days</div>
      {grid.length === 0 && (
        <div className="rounded-xl bg-zinc-900/40 p-6 text-center text-zinc-500 text-sm">No feeds logged yet.</div>
      )}
      <div className="space-y-3">
        {grid.map((row) => {
          const total = row.feeds.reduce((a, b) => a + b, 0)
          const dayTarget = targetForDay(row.day, weights)
          const pct = dayTarget > 0 ? total / dayTarget : 0
          const delta = total - dayTarget
          const deltaSign = delta >= 0 ? '+' : '−'
          return (
            <div key={row.day.toISOString()} className="rounded-xl bg-zinc-900/60 p-3">
              <div className="flex justify-between items-baseline mb-2">
                <div>
                  <div className="text-sm">{fmtDate(row.day.toISOString())}</div>
                  {dayTarget > 0 && (
                    <div className={`text-[11px] tabular-nums ${tone(pct)}`}>
                      {deltaSign}{Math.abs(delta).toFixed(0)} ml · {(pct * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
                <div className={`text-sm tabular-nums ${tone(pct)}`}>
                  {total.toFixed(0)} / {dayTarget.toFixed(0)} ml
                </div>
              </div>
              <div className="grid grid-cols-8 gap-1">
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

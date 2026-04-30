import { useMemo, useState } from 'react'
import { useAppSettings, useDiapers, useFeeds, useWeight } from '../api/hooks'
import { MlPerKgSparkline, buildSparklinePoints } from '../components/MlPerKgSparkline'
import { feedingDayKeyOfFeed } from '../lib/feedingday'
import { fmtDate } from '../lib/format'
import type { Weight } from '../api/types'
import { VitalsHistorySection } from './VitalsHistory'
import { WeightHistorySection } from './WeightHistory'

type SubTab = 'feeds' | 'weight' | 'vitals'

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
  const [tab, setTab] = useState<SubTab>('feeds')
  const { data: feeds } = useFeeds(90)
  const { data: diapers } = useDiapers(90)
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
    type Entry = { time: number; amount: number; is_extra: boolean }
    type Bucket = { day: Date; entries: Entry[] }
    const byDay = new Map<string, Bucket>()
    for (const f of feeds ?? []) {
      // Honour per-feed feeding_day_override so a feed that was logged at
      // 02:20 but tagged as 'first of today' shows up under today, not
      // under yesterday's calendar date.
      const dayIso = feedingDayKeyOfFeed(f, anchorH, anchorM)
      const dayDate = new Date(dayIso + 'T00:00:00')
      const key = dayDate.toDateString()
      const time = new Date(f.fed_at).getTime()
      if (!byDay.has(key)) byDay.set(key, { day: dayDate, entries: [] })
      byDay.get(key)!.entries.push({ time, amount: f.amount_ml, is_extra: f.is_extra })
    }
    return Array.from(byDay.values())
      .map((b) => {
        const sortedEntries = b.entries.sort((x, y) => x.time - y.time)
        const feedsArr = sortedEntries.map((e) => e.amount)
        while (feedsArr.length < feedsPerDay) feedsArr.push(0)
        const scheduled = sortedEntries.filter((e) => !e.is_extra)
        const extrasTotal = sortedEntries
          .filter((e) => e.is_extra)
          .reduce((a, e) => a + e.amount, 0)
        return {
          day: b.day,
          feeds: feedsArr,
          scheduledCount: scheduled.length,
          scheduledTotal: scheduled.reduce((a, e) => a + e.amount, 0),
          extrasTotal,
        }
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

  const breastByDay = useMemo(() => {
    const map = new Map<string, { count: number; ml: number; min: number }>()
    for (const f of feeds ?? []) {
      if (f.method !== 'breast') continue
      const dayIso = feedingDayKeyOfFeed(f, anchorH, anchorM)
      const key = new Date(dayIso + 'T00:00:00').toDateString()
      if (!map.has(key)) map.set(key, { count: 0, ml: 0, min: 0 })
      const b = map.get(key)!
      b.count++
      b.ml += f.amount_ml
      b.min += f.duration_min ?? 0
    }
    return map
  }, [feeds, anchorH, anchorM])

  const sparkPoints = useMemo(
    () => buildSparklinePoints(feeds ?? [], weights, anchorH, anchorM, 30),
    [feeds, weights, anchorH, anchorM],
  )

  // Show all loaded days (up to 90, capped by API). Doctor visits sometimes
  // need older history, so the grid keeps everything we have.
  const visibleGrid = grid

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-3">Trends</div>

      <div className="grid grid-cols-3 gap-1 bg-zinc-800/40 rounded-lg p-1 mb-4">
        <button
          type="button"
          onClick={() => setTab('feeds')}
          className={`py-2 rounded-md text-sm font-medium transition ${
            tab === 'feeds' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400'
          }`}
        >
          Feeds
        </button>
        <button
          type="button"
          onClick={() => setTab('weight')}
          className={`py-2 rounded-md text-sm font-medium transition ${
            tab === 'weight' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400'
          }`}
        >
          Weight
        </button>
        <button
          type="button"
          onClick={() => setTab('vitals')}
          className={`py-2 rounded-md text-sm font-medium transition ${
            tab === 'vitals' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400'
          }`}
        >
          Vitals
        </button>
      </div>

      {tab === 'weight' && <WeightHistorySection />}
      {tab === 'vitals' && <VitalsHistorySection />}
      {tab === 'feeds' && (
        <FeedsHistorySection
          grid={visibleGrid}
          weights={weights}
          bands={bands}
          feedsPerDay={feedsPerDay}
          anchorH={anchorH}
          anchorM={anchorM}
          sparkPoints={sparkPoints}
          diapersByDay={diapersByDay}
          breastByDay={breastByDay}
        />
      )}
    </div>
  )
}

type FeedsHistoryProps = {
  grid: {
    day: Date
    feeds: number[]
    scheduledCount: number
    scheduledTotal: number
    extrasTotal: number
  }[]
  weights: Weight[]
  bands: Bands
  feedsPerDay: number
  anchorH: number
  anchorM: number
  sparkPoints: ReturnType<typeof buildSparklinePoints>
  diapersByDay: Map<string, { wet: number; dirty: number }>
  breastByDay: Map<string, { count: number; ml: number; min: number }>
}

function FeedsHistorySection({
  grid,
  weights,
  bands,
  feedsPerDay,
  anchorH,
  anchorM,
  sparkPoints,
  diapersByDay,
  breastByDay,
}: FeedsHistoryProps) {
  return (
    <>
      {sparkPoints.length >= 2 && (() => {
        // Headline = avg over the last (up to) 7 completed days
        const recent = sparkPoints.slice(-7)
        const recentAvg = recent.reduce((s, p) => s + p.mlPerKg, 0) / recent.length
        const verdict =
          recentAvg >= bands.high
            ? { word: 'above target zone', tone: 'text-sky-300' }
            : recentAvg >= bands.solid
              ? { word: 'solidly in target zone', tone: 'text-emerald-300' }
              : recentAvg >= bands.low
                ? { word: 'in target zone (lower edge)', tone: 'text-lime-300' }
                : recentAvg >= bands.concern
                  ? { word: 'under target zone', tone: 'text-amber-400' }
                  : { word: 'well under target', tone: 'text-rose-400' }
        return (
          <div className="rounded-xl bg-zinc-900/60 p-3 mb-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
              Daily intake · ml per kg
            </div>
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <div className="text-3xl font-light tabular-nums leading-none">
                  {recentAvg.toFixed(0)}
                  <span className="text-zinc-500 text-base font-normal ml-1">ml/kg/day</span>
                </div>
                <div className={`text-[11px] mt-1 ${verdict.tone}`}>{verdict.word}</div>
              </div>
              <div className="text-right text-[11px] text-zinc-500">
                <div>last {recent.length} day{recent.length === 1 ? '' : 's'} avg</div>
                <div className="mt-0.5 text-zinc-600">{sparkPoints.length}-day trend below</div>
              </div>
            </div>
            <div className="relative">
              <MlPerKgSparkline points={sparkPoints} bands={bands} />
              <div className="absolute top-0 left-1 text-[10px] text-zinc-600 tabular-nums">
                {Math.max(...sparkPoints.map((p) => p.mlPerKg)).toFixed(0)}
              </div>
              <div className="absolute bottom-0 left-1 text-[10px] text-zinc-600 tabular-nums">
                {Math.min(...sparkPoints.map((p) => p.mlPerKg)).toFixed(0)}
              </div>
            </div>
            <div className="mt-1.5 flex justify-between items-center text-[10px] text-zinc-600">
              <span>← {sparkPoints.length} days ago</span>
              <span>
                <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/30 mr-1 align-middle" />
                target zone {bands.low}–{bands.high}
              </span>
              <span>yesterday →</span>
            </div>
          </div>
        )
      })()}

      {grid.length === 0 && (
        <div className="rounded-xl bg-zinc-900/40 p-6 text-center text-zinc-500 text-sm">No feeds logged yet.</div>
      )}
      <div className="space-y-3">
        {grid.map((row) => {
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
                  {isToday && (() => {
                    const kg = dayWeight ? dayWeight.weight_grams / 1000 : 0
                    if (kg <= 0) return <div className="text-[11px] text-zinc-500">in progress</div>
                    const liveMlPerKg = total / kg
                    const remaining = Math.max(0, feedsPerDay - row.scheduledCount)
                    const perFeedAvg = row.scheduledCount > 0 ? row.scheduledTotal / row.scheduledCount : 0
                    if (row.scheduledCount === 0) {
                      return <div className="text-[11px] text-zinc-500">no scheduled feeds yet</div>
                    }
                    const forecastTotal = total + remaining * perFeedAvg
                    const forecastMlPerKg = forecastTotal / kg
                    const forecastTone = bandTone(forecastMlPerKg, bands)
                    return (
                      <div className="text-[11px] tabular-nums leading-snug">
                        <span className="text-zinc-300">{liveMlPerKg.toFixed(0)} ml/kg</span>
                        <span className="text-zinc-600"> so far</span>
                        {remaining > 0 && (
                          <>
                            <span className="text-zinc-700"> · </span>
                            <span className={forecastTone}>~{forecastMlPerKg.toFixed(0)}</span>
                            <span className="text-zinc-600"> at this pace</span>
                          </>
                        )}
                      </div>
                    )
                  })()}
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
                const bf = breastByDay.get(row.day.toDateString())
                if (dc.wet === 0 && dc.dirty === 0 && !bf) return null
                const lowWet = !isToday && dc.wet < 6
                return (
                  <div className="mt-1.5 text-[11px] text-right space-y-0.5">
                    {(dc.wet > 0 || dc.dirty > 0) && (
                      <div>
                        <span className={lowWet ? 'text-amber-400' : 'text-zinc-400'}>{dc.wet} wet</span>
                        <span className="text-zinc-600"> · </span>
                        <span className="text-zinc-400">{dc.dirty} dirty</span>
                      </div>
                    )}
                    {bf && (
                      <div className="text-zinc-500">
                        {bf.count} breastfeed{bf.count === 1 ? '' : 's'}
                        {bf.ml > 0 && <> · ~{bf.ml.toFixed(0)} ml est</>}
                        {bf.min > 0 && <> · {bf.min} min</>}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>
    </>
  )
}

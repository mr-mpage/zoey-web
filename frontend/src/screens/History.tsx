import { useMemo } from 'react'
import { useFeeds, useWeight } from '../api/hooks'
import { fmtDate } from '../lib/format'

const FEEDS_PER_DAY = 8

export function HistoryScreen() {
  const { data: feeds } = useFeeds(7)
  const { data: weight } = useWeight()
  const dailyTarget = weight?.daily_target_ml ?? 0

  const grid = useMemo(() => {
    type Bucket = { day: Date; entries: { time: number; amount: number }[] }
    const byDay = new Map<string, Bucket>()
    for (const f of feeds ?? []) {
      const d = new Date(f.fed_at)
      const key = d.toDateString()
      if (!byDay.has(key)) byDay.set(key, { day: new Date(d.getFullYear(), d.getMonth(), d.getDate()), entries: [] })
      byDay.get(key)!.entries.push({ time: +d, amount: f.amount_ml })
    }
    return Array.from(byDay.values())
      .map((b) => {
        const sorted = b.entries.sort((x, y) => x.time - y.time).map((e) => e.amount)
        while (sorted.length < FEEDS_PER_DAY) sorted.push(0)
        return { day: b.day, feeds: sorted }
      })
      .sort((a, b) => +b.day - +a.day)
  }, [feeds])

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-4">Last 7 days</div>
      {grid.length === 0 && (
        <div className="rounded-xl bg-zinc-900/40 p-6 text-center text-zinc-500 text-sm">No feeds logged yet.</div>
      )}
      <div className="space-y-3">
        {grid.map((row) => {
          const total = row.feeds.reduce((a, b) => a + b, 0)
          const pct = dailyTarget > 0 ? total / dailyTarget : 0
          const tone = pct >= 0.9 ? 'text-emerald-300' : pct >= 0.75 ? 'text-amber-300' : 'text-rose-300'
          return (
            <div key={row.day.toISOString()} className="rounded-xl bg-zinc-900/60 p-3">
              <div className="flex justify-between items-baseline mb-2">
                <div className="text-sm">{fmtDate(row.day.toISOString())}</div>
                <div className={`text-sm tabular-nums ${tone}`}>
                  {total.toFixed(0)} / {dailyTarget.toFixed(0)} ml
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

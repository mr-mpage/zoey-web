import type { Feed, Pump } from '../api/types'

type Props = {
  pumps: Pump[]
  feeds: Feed[]
  /** ml poured into each bottle. Supply draw is counted at this fixed
   *  volume per bottle feed, not at what Zoey actually drank, since
   *  leftover is discarded. */
  bottlePrepMl: number
  days?: number
  width?: number
  height?: number
}

type DayTotals = { date: Date; pumped: number; bottled: number }

function bucketize(pumps: Pump[], feeds: Feed[], bottlePrepMl: number, days: number): DayTotals[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const buckets: DayTotals[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    buckets.push({ date: d, pumped: 0, bottled: 0 })
  }
  const indexFor = (when: Date) => {
    const d = new Date(when)
    d.setHours(0, 0, 0, 0)
    return buckets.findIndex((b) => b.date.getTime() === d.getTime())
  }
  for (const p of pumps) {
    const i = indexFor(new Date(p.pumped_at))
    if (i >= 0) buckets[i].pumped += p.amount_ml
  }
  for (const f of feeds) {
    if (f.method === 'breast') continue
    const i = indexFor(new Date(f.fed_at))
    if (i >= 0) buckets[i].bottled += bottlePrepMl
  }
  return buckets
}

function formatBalance(v: number): string {
  if (v === 0) return '±0 ml'
  return `${v > 0 ? '+' : ''}${v.toFixed(0)} ml`
}

/** Daily pumped vs bottle-prep comparison so it's visible whether Sabrina
 *  is over- or under-producing relative to what's drawn from storage. Each
 *  bottle counts at the configured prep volume (not what Zoey drank — the
 *  leftover is discarded once thawed). Dual bars per day (sky = pumped,
 *  pink = bottle prep); summary tiles show today, the 4-day fridge cycle,
 *  and the 7-day rolling balance. */
export function PumpDailyChart({ pumps, feeds, bottlePrepMl, days = 7, width = 320, height = 100 }: Props) {
  const buckets = bucketize(pumps, feeds, bottlePrepMl, days)
  const todayB = buckets[buckets.length - 1]
  const last4 = buckets.slice(-4)
  const last7 = buckets.slice(-7)

  const sumP = (arr: DayTotals[]) => arr.reduce((s, b) => s + b.pumped, 0)
  const sumB = (arr: DayTotals[]) => arr.reduce((s, b) => s + b.bottled, 0)

  const balToday = todayB.pumped - todayB.bottled
  const bal4 = sumP(last4) - sumB(last4)
  const bal7 = sumP(last7) - sumB(last7)

  const padX = 8
  const padTop = 6
  const padBottom = 16
  const innerW = width - padX * 2
  const innerH = height - padTop - padBottom
  const max = Math.max(1, ...buckets.flatMap((b) => [b.pumped, b.bottled]))

  const dayW = innerW / days
  const barGap = 1
  const barW = (dayW - barGap * 3) / 2

  const colorFor = (n: number) =>
    n > 0
      ? 'text-emerald-300'
      : n < 0
        ? 'text-amber-300'
        : 'text-zinc-400'

  return (
    <div>
      {/* Summary card — today + rolling balances */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="rounded-lg bg-zinc-900/50 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Today</div>
          <div className={`tabular-nums text-sm leading-tight mt-0.5 ${colorFor(balToday)}`}>
            {formatBalance(balToday)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-900/50 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Fridge · 4d</div>
          <div className={`tabular-nums text-sm leading-tight mt-0.5 ${colorFor(bal4)}`}>
            {formatBalance(bal4)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-900/50 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">7 days</div>
          <div className={`tabular-nums text-sm leading-tight mt-0.5 ${colorFor(bal7)}`}>
            {formatBalance(bal7)}
          </div>
        </div>
      </div>

      {/* Dual-bar chart */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full block" preserveAspectRatio="none">
        {buckets.map((b, i) => {
          const x = padX + i * dayW + barGap
          const ph = (b.pumped / max) * innerH
          const bh = (b.bottled / max) * innerH
          return (
            <g key={i}>
              <rect
                x={x}
                y={padTop + innerH - ph}
                width={barW}
                height={Math.max(ph, b.pumped > 0 ? 1 : 0)}
                fill="rgb(125 211 252)"
                opacity={i === buckets.length - 1 ? 1 : 0.7}
                rx={0.6}
              />
              <rect
                x={x + barW + barGap}
                y={padTop + innerH - bh}
                width={barW}
                height={Math.max(bh, b.bottled > 0 ? 1 : 0)}
                fill="rgb(244 175 195)"
                opacity={i === buckets.length - 1 ? 1 : 0.7}
                rx={0.6}
              />
            </g>
          )
        })}
        {/* Date labels at start, mid, end. Anchor adjusted so they don't clip. */}
        {[
          { i: 0, anchor: 'start', dx: padX },
          { i: Math.floor(days / 2), anchor: 'middle', dx: padX + Math.floor(days / 2) * dayW + dayW / 2 },
          { i: days - 1, anchor: 'end', dx: width - padX },
        ].map(({ i, anchor, dx }) => (
          <text
            key={i}
            x={dx}
            y={height - 4}
            fontSize={9}
            textAnchor={anchor as 'start' | 'middle' | 'end'}
            fill="rgb(113 113 122)"
            className="tabular-nums"
          >
            {buckets[i].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </text>
        ))}
      </svg>

      <div className="flex items-center gap-3 text-[10px] text-zinc-500 mt-1 px-1">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'rgb(125 211 252)' }} />
          pumped
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'rgb(244 175 195)' }} />
          bottle prep ({bottlePrepMl} ml)
        </span>
        <span className="ml-auto tabular-nums">peak {max.toFixed(0)} ml</span>
      </div>
    </div>
  )
}

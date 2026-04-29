import type { Pump } from '../api/types'

type Props = {
  pumps: Pump[]
  days?: number
  width?: number
  height?: number
}

/** Daily total bar chart over `days` calendar days, ending today. */
export function PumpDailyChart({ pumps, days = 30, width = 320, height = 80 }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totals: number[] = new Array(days).fill(0)
  const dayLabels: Date[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    dayLabels.push(d)
  }
  for (const p of pumps) {
    const d = new Date(p.pumped_at)
    d.setHours(0, 0, 0, 0)
    const idx = dayLabels.findIndex((dd) => dd.getTime() === d.getTime())
    if (idx >= 0) totals[idx] += p.amount_ml
  }

  const padX = 6
  const padTop = 6
  const padBottom = 14
  const innerW = width - padX * 2
  const innerH = height - padTop - padBottom
  const max = Math.max(1, ...totals)

  const barGap = 1
  const barW = (innerW - barGap * (days - 1)) / days

  const recentNonZero = totals.filter((t) => t > 0)
  const avg7 = (() => {
    const last7 = totals.slice(-7).filter((t) => t > 0)
    if (!last7.length) return null
    return last7.reduce((s, v) => s + v, 0) / last7.length
  })()

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full block" preserveAspectRatio="none">
        {/* 7-day average reference line */}
        {avg7 !== null && (
          <line
            x1={padX}
            x2={width - padX}
            y1={padTop + innerH - (avg7 / max) * innerH}
            y2={padTop + innerH - (avg7 / max) * innerH}
            stroke="rgb(113 113 122)"
            strokeWidth={0.7}
            strokeDasharray="2 3"
          />
        )}
        {totals.map((t, i) => {
          const h = (t / max) * innerH
          const x = padX + i * (barW + barGap)
          const y = padTop + innerH - h
          const isToday = i === days - 1
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, t > 0 ? 1 : 0)}
              fill={isToday ? 'rgb(244 175 195)' : t > 0 ? 'rgb(212 175 195 / 0.55)' : 'rgb(63 63 70 / 0.4)'}
              rx={0.8}
            />
          )
        })}
        {/* Axis labels — first day, midpoint, today */}
        {[0, Math.floor(days / 2), days - 1].map((i) => (
          <text
            key={i}
            x={padX + i * (barW + barGap) + barW / 2}
            y={height - 3}
            fontSize={9}
            textAnchor="middle"
            fill="rgb(113 113 122)"
            className="tabular-nums"
          >
            {dayLabels[i].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </text>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1 px-1 tabular-nums">
        <span>peak {max.toFixed(0)} ml</span>
        <span>{avg7 !== null ? `7-day avg ${avg7.toFixed(0)} ml/day` : 'no recent data'}</span>
        <span>{recentNonZero.length} active days</span>
      </div>
    </div>
  )
}

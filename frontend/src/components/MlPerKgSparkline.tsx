import type { Weight } from '../api/types'

type DayPoint = { date: Date; mlPerKg: number; total: number; weight_g: number }

type Props = {
  points: DayPoint[]
  bands: { concern: number; low: number; solid: number; high: number }
  width?: number
  height?: number
}

/** Compact 30-day sparkline of ml/kg/day, with target-zone shading. */
export function MlPerKgSparkline({ points, bands, width = 320, height = 56 }: Props) {
  if (points.length < 2) {
    return (
      <div className="text-[11px] text-zinc-500 text-center py-3">
        Need at least 2 days of data to show a trend.
      </div>
    )
  }

  const padX = 2
  const padY = 4
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const allValues = points.map((p) => p.mlPerKg).concat([bands.concern - 10, bands.high + 10])
  const yMin = Math.min(...allValues)
  const yMax = Math.max(...allValues)
  const yRange = Math.max(yMax - yMin, 1)
  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0

  const xy = (i: number, v: number) => {
    const x = padX + i * xStep
    const y = padY + innerH - ((v - yMin) / yRange) * innerH
    return [x, y] as const
  }

  const path = points
    .map((p, i) => {
      const [x, y] = xy(i, p.mlPerKg)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  // Shade the target zone (low → high)
  const [, yLow] = xy(0, bands.low)
  const [, yHigh] = xy(0, bands.high)
  const zoneY = Math.min(yLow, yHigh)
  const zoneH = Math.abs(yLow - yHigh)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-14 block" aria-hidden>
      <rect x={padX} y={zoneY} width={innerW} height={zoneH} fill="rgb(16 185 129 / 0.1)" />
      <path d={path} fill="none" stroke="rgb(244 175 195)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => {
        const [x, y] = xy(i, p.mlPerKg)
        const colour =
          p.mlPerKg >= bands.high
            ? 'rgb(125 211 252)'
            : p.mlPerKg >= bands.solid
              ? 'rgb(110 231 183)'
              : p.mlPerKg >= bands.low
                ? 'rgb(190 242 100)'
                : p.mlPerKg >= bands.concern
                  ? 'rgb(251 191 36)'
                  : 'rgb(251 113 133)'
        return <circle key={i} cx={x} cy={y} r={1.6} fill={colour} />
      })}
    </svg>
  )
}

/** Helper: build per-day points from raw feeds + weights, anchored to feeding-day.
 *  Respects per-feed feeding_day_override so off-by-one overrides land in the
 *  correct day's total. */
/** Local YYYY-MM-DD string (NOT toISOString — that uses UTC and produces
 *  off-by-one keys in any timezone east of UTC). */
function ymdLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function buildSparklinePoints(
  feeds: { fed_at: string; amount_ml: number; feeding_day_override?: string | null }[],
  weights: Weight[],
  anchorH: number,
  anchorM: number,
  windowDays = 30,
): DayPoint[] {
  const anchorMin = anchorH * 60 + anchorM
  const totalsByDay = new Map<string, number>()
  for (const f of feeds) {
    let key: string
    if (f.feeding_day_override) {
      key = f.feeding_day_override
    } else {
      const d = new Date(f.fed_at)
      const minutes = d.getHours() * 60 + d.getMinutes()
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      if (minutes < anchorMin) day.setDate(day.getDate() - 1)
      key = ymdLocal(day)
    }
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + f.amount_ml)
  }

  const todayKey = (() => {
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (minutes < anchorMin) day.setDate(day.getDate() - 1)
    return day
  })()

  const points: DayPoint[] = []
  // Walk backward from yesterday for `windowDays - 1` days (skip today, partial)
  for (let i = windowDays; i >= 1; i--) {
    const d = new Date(todayKey)
    d.setDate(d.getDate() - i)
    const key = ymdLocal(d)
    const total = totalsByDay.get(key)
    if (!total) continue

    // Find weight for this day (same date or most recent earlier)
    const dayStr = key
    const sorted = [...weights].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
    const w =
      sorted.find((x) => x.recorded_at.startsWith(dayStr)) ??
      sorted.find((x) => x.recorded_at.slice(0, 10) <= dayStr) ??
      sorted[sorted.length - 1]
    if (!w) continue
    const kg = w.weight_grams / 1000
    points.push({ date: d, mlPerKg: total / kg, total, weight_g: w.weight_grams })
  }
  return points
}

import type { Weight } from '../api/types'

type DayPoint = { date: Date; mlPerKg: number; total: number; weight_g: number }
type Bands = { concern: number; low: number; solid: number; high: number }

type Props = {
  points: DayPoint[]
  bands: Bands
  width?: number
  height?: number
}

/** Compact 30-day sparkline of ml/kg/day with FIXED y-axis showing every
 *  band as a labelled tinted zone, so the line's position relative to the
 *  clinical thresholds is read from the chart itself rather than inferred
 *  from numbers alone.
 *
 *  The "green" target zone is the [solid, high] band (typical 160–180);
 *  zones above and below it are tinted distinctly so a sustained dip into
 *  the under-target band reads as a visible drop, not just a pixel shift. */
export function MlPerKgSparkline({ points, bands, width = 320, height = 80 }: Props) {
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

  // Y-axis is FIXED so the band positions never shift with the data. Always
  // include all band thresholds with breathing room above and below.
  const observedMin = Math.min(...points.map((p) => p.mlPerKg))
  const observedMax = Math.max(...points.map((p) => p.mlPerKg))
  const yMin = Math.max(0, Math.min(observedMin - 8, bands.concern - 15))
  const yMax = Math.max(observedMax + 8, bands.high + 20)
  const yRange = Math.max(yMax - yMin, 1)
  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0

  const yPos = (v: number) => padY + innerH - ((v - yMin) / yRange) * innerH
  const xy = (i: number, v: number) => [padX + i * xStep, yPos(v)] as const

  const path = points
    .map((p, i) => {
      const [x, y] = xy(i, p.mlPerKg)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  // Build the five band rectangles top-to-bottom (above, target, edge,
  // under, below-safe). Each gets a low-opacity fill so the data line
  // remains the focal element.
  type Zone = { from: number; to: number; fill: string }
  const zones: Zone[] = [
    { from: bands.high, to: yMax,         fill: 'rgb(125 211 252 / 0.10)' },  // sky
    { from: bands.solid, to: bands.high,  fill: 'rgb(16 185 129 / 0.14)' },   // emerald (target)
    { from: bands.low, to: bands.solid,   fill: 'rgb(190 242 100 / 0.10)' },  // lime
    { from: bands.concern, to: bands.low, fill: 'rgb(251 191 36 / 0.10)' },   // amber
    { from: yMin, to: bands.concern,      fill: 'rgb(251 113 133 / 0.10)' },  // rose
  ]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full block" style={{ height }} aria-hidden>
      {zones.map((z, i) => {
        const yTop = yPos(z.to)
        const yBot = yPos(z.from)
        return <rect key={i} x={padX} y={yTop} width={innerW} height={Math.max(yBot - yTop, 0)} fill={z.fill} />
      })}
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
        return <circle key={i} cx={x} cy={y} r={1.8} fill={colour} />
      })}
    </svg>
  )
}

/** Small key showing the four band thresholds with plain-language labels.
 *  Rendered below the sparkline so the user knows what each colour means
 *  without having to remember the numeric thresholds. */
export function MlPerKgBandLegend({ bands }: { bands: Bands }) {
  const items: { label: string; range: string; tone: string }[] = [
    { label: 'above target', range: `> ${bands.high}`, tone: 'text-sky-300' },
    { label: 'target growth', range: `${bands.solid}–${bands.high}`, tone: 'text-emerald-300' },
    { label: 'lower edge', range: `${bands.low}–${bands.solid}`, tone: 'text-lime-300' },
    { label: 'under target', range: `${bands.concern}–${bands.low}`, tone: 'text-amber-400' },
    { label: 'below safe', range: `< ${bands.concern}`, tone: 'text-rose-400' },
  ]
  return (
    <div className="grid grid-cols-5 gap-1 text-[9.5px] mt-2 leading-tight">
      {items.map((i) => (
        <div key={i.label} className="text-center">
          <div className={`${i.tone} truncate`}>{i.label}</div>
          <div className="text-zinc-600 tabular-nums">{i.range}</div>
        </div>
      ))}
    </div>
  )
}

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

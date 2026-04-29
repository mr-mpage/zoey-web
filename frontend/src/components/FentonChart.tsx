import type { Weight } from '../api/types'
import { approxPercentile, fentonGirls, fentonPmaRange } from '../lib/fenton'

type Props = {
  weights: Weight[]
  birthDateIso: string
  gestationalAgeWeeks: number
  width?: number
  height?: number
}

/** Plots Zoey's weight overlaid on the Fenton 2013 girls reference percentile
 *  bands (3rd, 10th, 50th, 90th). PMA on x-axis, weight (g) on y-axis. */
export function FentonChart({
  weights,
  birthDateIso,
  gestationalAgeWeeks,
  width = 320,
  height = 200,
}: Props) {
  const padL = 32
  const padR = 6
  const padT = 8
  const padB = 18
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const birth = new Date(birthDateIso + 'T00:00:00').getTime()
  const points = [...weights]
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .map((w) => {
      const days = (new Date(w.recorded_at).getTime() - birth) / 86_400_000
      return { pma: gestationalAgeWeeks + days / 7, grams: w.weight_grams, recorded_at: w.recorded_at }
    })
    .filter((p) => p.pma >= fentonPmaRange[0] && p.pma <= fentonPmaRange[1])

  // Frame the chart around Zoey's weight + the Fenton band that brackets her
  // PMA — full-range axes (22-42w, 0-4500g) hide most detail.
  const visiblePmaMin = points.length ? Math.max(fentonPmaRange[0], Math.floor(Math.min(...points.map((p) => p.pma)) - 1)) : fentonPmaRange[0]
  const visiblePmaMax = points.length ? Math.min(fentonPmaRange[1], Math.ceil(Math.max(...points.map((p) => p.pma)) + 2)) : fentonPmaRange[1]
  const fenSlice = fentonGirls.filter((r) => r.pma >= visiblePmaMin && r.pma <= visiblePmaMax)
  const refMin = Math.min(...fenSlice.map((r) => r.p3))
  const refMax = Math.max(...fenSlice.map((r) => r.p90))
  const obsMin = points.length ? Math.min(...points.map((p) => p.grams)) : refMin
  const obsMax = points.length ? Math.max(...points.map((p) => p.grams)) : refMax
  const yMin = Math.floor(Math.min(refMin, obsMin) / 100) * 100 - 50
  const yMax = Math.ceil(Math.max(refMax, obsMax) / 100) * 100 + 50

  const x = (pma: number) => padL + ((pma - visiblePmaMin) / (visiblePmaMax - visiblePmaMin)) * innerW
  const y = (g: number) => padT + innerH - ((g - yMin) / (yMax - yMin)) * innerH

  const buildPath = (key: 'p3' | 'p10' | 'p50' | 'p90') =>
    fenSlice
      .map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.pma).toFixed(1)} ${y(r[key]).toFixed(1)}`)
      .join(' ')

  const observedPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.pma).toFixed(1)} ${y(p.grams).toFixed(1)}`)
    .join(' ')

  // X-axis ticks at integer weeks
  const xTicks: number[] = []
  for (let w = visiblePmaMin; w <= visiblePmaMax; w++) xTicks.push(w)

  // Y-axis ticks every 250 or 500 g depending on range
  const yStep = yMax - yMin > 2000 ? 500 : 250
  const yTicks: number[] = []
  for (let g = Math.ceil(yMin / yStep) * yStep; g <= yMax; g += yStep) yTicks.push(g)

  const latest = points[points.length - 1]
  const latestPct = latest ? approxPercentile(latest.pma, latest.grams) : null

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full block" preserveAspectRatio="none">
        {/* Y gridlines */}
        {yTicks.map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(g)}
              y2={y(g)}
              stroke="rgb(63 63 70)"
              strokeWidth={0.5}
              strokeDasharray="2 3"
            />
            <text x={padL - 4} y={y(g) + 3} fontSize={9} textAnchor="end" fill="rgb(113 113 122)" className="tabular-nums">
              {g}
            </text>
          </g>
        ))}

        {/* X axis tick labels (every 2 weeks) */}
        {xTicks.map((w) =>
          w % 2 === 0 ? (
            <text key={w} x={x(w)} y={height - 4} fontSize={9} textAnchor="middle" fill="rgb(113 113 122)" className="tabular-nums">
              {w}
            </text>
          ) : null,
        )}

        {/* Reference percentile lines */}
        <path d={buildPath('p3')} fill="none" stroke="rgb(120 113 108)" strokeWidth={0.7} strokeDasharray="2 2" />
        <path d={buildPath('p10')} fill="none" stroke="rgb(161 161 170)" strokeWidth={0.9} strokeDasharray="3 2" />
        <path d={buildPath('p50')} fill="none" stroke="rgb(212 212 216)" strokeWidth={1} />
        <path d={buildPath('p90')} fill="none" stroke="rgb(161 161 170)" strokeWidth={0.9} strokeDasharray="3 2" />

        {/* Observed weights */}
        {observedPath && (
          <path d={observedPath} fill="none" stroke="rgb(244 175 195)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {points.map((p, i) => (
          <circle key={i} cx={x(p.pma)} cy={y(p.grams)} r={2.2} fill="rgb(244 175 195)" />
        ))}
      </svg>

      <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1 px-1">
        <div>PMA (weeks)</div>
        <div className="flex gap-3 items-center">
          <span><span className="inline-block w-3 h-px bg-zinc-300 align-middle mr-1" />50th</span>
          <span><span className="inline-block w-3 h-px bg-zinc-500 align-middle mr-1" style={{ borderTop: '1px dashed' }} />10/90</span>
          <span><span className="inline-block w-3 h-px bg-pink-300 align-middle mr-1" />Zoey</span>
        </div>
      </div>

      {latest && latestPct !== null && (
        <div className="text-[11px] text-zinc-400 mt-2">
          Latest: <span className="text-zinc-200 tabular-nums">{latest.grams} g</span> at PMA{' '}
          <span className="tabular-nums">{latest.pma.toFixed(1)}w</span> ·
          {' '}≈ <span className="text-zinc-200 tabular-nums">{latestPct}th</span> percentile (Fenton 2013 girls).
        </div>
      )}
    </div>
  )
}

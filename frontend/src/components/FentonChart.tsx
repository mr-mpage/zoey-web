import type { Weight } from '../api/types'
import { approxPercentile, fentonGirls, fentonPmaRange } from '../lib/fenton'

type Props = {
  weights: Weight[]
  birthDateIso: string
  gestationalAgeWeeks: number
  babyName: string
  width?: number
  height?: number
}

const COLOR_P50 = 'rgb(212 212 216)'
const COLOR_P10_P90 = 'rgb(161 161 170)'
const COLOR_P3 = 'rgb(120 113 108)'
const COLOR_BABY = 'rgb(244 175 195)'

const DASH_P10_P90 = '3 2'
const DASH_P3 = '1.5 2.5'

/** Plots the baby's weight overlaid on the Fenton 2025 girls reference
 *  percentile bands (3rd, 10th, 50th, 90th). PMA on x-axis, weight (g) on y-axis. */
export function FentonChart({
  weights,
  birthDateIso,
  gestationalAgeWeeks,
  babyName,
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

  const xTicks: number[] = []
  for (let w = visiblePmaMin; w <= visiblePmaMax; w++) xTicks.push(w)

  const yStep = yMax - yMin > 2000 ? 500 : 250
  const yTicks: number[] = []
  for (let g = Math.ceil(yMin / yStep) * yStep; g <= yMax; g += yStep) yTicks.push(g)

  const latest = points[points.length - 1]
  const latestPct = latest ? approxPercentile(latest.pma, latest.grams) : null

  const LegendSwatch = ({ color, dash }: { color: string; dash?: string }) => (
    <svg width={18} height={6} className="inline-block align-middle mr-1" aria-hidden>
      <line x1={0} y1={3} x2={18} y2={3} stroke={color} strokeWidth={1.4} strokeDasharray={dash} />
    </svg>
  )

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full block" preserveAspectRatio="none">
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

        {xTicks.map((w) =>
          w % 2 === 0 ? (
            <text key={w} x={x(w)} y={height - 4} fontSize={9} textAnchor="middle" fill="rgb(113 113 122)" className="tabular-nums">
              {w}
            </text>
          ) : null,
        )}

        <path d={buildPath('p3')} fill="none" stroke={COLOR_P3} strokeWidth={0.7} strokeDasharray={DASH_P3} />
        <path d={buildPath('p10')} fill="none" stroke={COLOR_P10_P90} strokeWidth={0.9} strokeDasharray={DASH_P10_P90} />
        <path d={buildPath('p50')} fill="none" stroke={COLOR_P50} strokeWidth={1.2} />
        <path d={buildPath('p90')} fill="none" stroke={COLOR_P10_P90} strokeWidth={0.9} strokeDasharray={DASH_P10_P90} />

        {observedPath && (
          <path d={observedPath} fill="none" stroke={COLOR_BABY} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {points.map((p, i) => (
          <circle key={i} cx={x(p.pma)} cy={y(p.grams)} r={2.2} fill={COLOR_BABY} />
        ))}
      </svg>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400 mt-1 px-1">
        <span><LegendSwatch color={COLOR_BABY} />{babyName}</span>
        <span><LegendSwatch color={COLOR_P50} />50th (median)</span>
        <span><LegendSwatch color={COLOR_P10_P90} dash={DASH_P10_P90} />10th &amp; 90th</span>
        <span><LegendSwatch color={COLOR_P3} dash={DASH_P3} />3rd</span>
        <span className="ml-auto text-zinc-500">PMA (weeks)</span>
      </div>

      {latest && latestPct !== null && (
        <div className="text-[11px] text-zinc-400 mt-2 tabular-nums">
          Latest: <span className="text-zinc-200">{latest.grams} g</span> at PMA{' '}
          <span>{latest.pma.toFixed(1)}w</span> · ≈{' '}
          <span className="text-zinc-200">{latestPct}th</span> percentile
        </div>
      )}

      <details className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
        <summary className="cursor-pointer text-zinc-400">What this chart means</summary>
        <div className="mt-2 space-y-2">
          <p>
            This is the <span className="text-zinc-300">Fenton 2025</span> growth reference, built specifically
            for babies born preterm. The x-axis is{' '}
            <span className="text-zinc-300">postmenstrual age (PMA)</span> — gestational age plus how old she
            is — which is how preterm growth is tracked, since chronological age from birth doesn't line up
            with babies born at term.
          </p>
          <p>
            The grey lines show where preterm babies of the same PMA typically fall: most are between the 10th
            and 90th, half are above the 50th. A baby on the 25th percentile is smaller than 75% of preterm
            babies her age — which is normal and expected for many preemies, especially smaller ones at birth.
          </p>
          <p>
            <span className="text-zinc-300">Trajectory matters more than the absolute percentile.</span>{' '}
            The goal is for her line to{' '}
            <span className="text-zinc-300">stay roughly parallel</span> to the reference lines — i.e. she
            keeps following her own curve. Crossing percentiles upward is catch-up growth; crossing downward
            for several weigh-ins is a flag worth raising at her next visit.
          </p>
          <p className="text-zinc-600">
            Reference: Fenton TR et al., <em>Paediatr Perinat Epidemiol</em> 2025; girls weight-for-PMA cutoffs.
            Used here only for visual context — clinical assessment is the doctor's call.
          </p>
        </div>
      </details>
    </div>
  )
}

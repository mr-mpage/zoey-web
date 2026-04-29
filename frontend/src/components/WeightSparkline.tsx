import type { Weight } from '../api/types'

type Props = {
  weights: Weight[]
  width?: number
  height?: number
}

/** Compact line of weight (grams) over time. Y-axis bounds labelled inset. */
export function WeightSparkline({ weights, width = 320, height = 64 }: Props) {
  const sorted = [...weights].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  if (sorted.length < 2) {
    return (
      <div className="text-[11px] text-zinc-500 text-center py-3">
        Need at least 2 weight entries to show a trend.
      </div>
    )
  }

  const padX = 4
  const padY = 6
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const ys = sorted.map((w) => w.weight_grams)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const yRange = Math.max(yMax - yMin, 1)

  const xs = sorted.map((w) => new Date(w.recorded_at).getTime())
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const xRange = Math.max(xMax - xMin, 1)

  const xy = (i: number) => {
    const x = padX + ((xs[i] - xMin) / xRange) * innerW
    const y = padY + innerH - ((ys[i] - yMin) / yRange) * innerH
    return [x, y] as const
  }

  const path = sorted
    .map((_, i) => {
      const [x, y] = xy(i)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-16 block" aria-hidden>
        <path d={path} fill="none" stroke="rgb(244 175 195)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {sorted.map((_, i) => {
          const [x, y] = xy(i)
          return <circle key={i} cx={x} cy={y} r={1.8} fill="rgb(244 175 195)" />
        })}
      </svg>
      <div className="absolute top-0 left-1 text-[10px] text-zinc-600 tabular-nums">{yMax}</div>
      <div className="absolute bottom-0 left-1 text-[10px] text-zinc-600 tabular-nums">{yMin}</div>
    </div>
  )
}

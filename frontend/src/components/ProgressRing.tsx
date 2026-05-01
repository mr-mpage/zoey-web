type Props = {
  pct: number // 0..1+
  /** Optional pace tick — where today's intake should be by now (0..1).
   *  Renders a small notch on the ring at that position so the gap
   *  between current fill and expected pace reads at a glance. */
  paceTickPct?: number | null
  size?: number
  stroke?: number
  children?: React.ReactNode
}

export function ProgressRing({ pct, paceTickPct, size = 168, stroke = 12, children }: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(1, Math.max(0, pct))
  const offset = c * (1 - clamped)

  let tick: { x1: number; y1: number; x2: number; y2: number } | null = null
  if (paceTickPct != null && paceTickPct > 0 && paceTickPct <= 1) {
    // SVG element has -rotate-90, so angle 0 in SVG coords sits at 12 o'clock visually.
    const θ = paceTickPct * 2 * Math.PI
    const cx = size / 2
    const cy = size / 2
    const inner = r - stroke / 2 - 2
    const outer = r + stroke / 2 + 2
    tick = {
      x1: cx + inner * Math.cos(θ),
      y1: cy + inner * Math.sin(θ),
      x2: cx + outer * Math.cos(θ),
      y2: cy + outer * Math.sin(θ),
    }
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(39 39 42)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgb(244 175 195)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {tick && (
          <line
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgb(244 244 245)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

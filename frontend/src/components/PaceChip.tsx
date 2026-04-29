import type { Dashboard } from '../api/types'

type Pace = Dashboard['pace_status']

type Props = { pace: Pace; gap: number; hasFeeds: boolean }

const STYLES: Record<Pace, { color: string; icon: string }> = {
  well_behind:     { color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',     icon: '↓↓' },
  behind:          { color: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: '↓' },
  slightly_behind: { color: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30', icon: '↓' },
  on_track:        { color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', icon: '●' },
  slightly_ahead:  { color: 'bg-lime-500/10 text-lime-300 border-lime-500/30',     icon: '↑' },
  ahead:           { color: 'bg-sky-500/15 text-sky-300 border-sky-500/30',         icon: '↑' },
  well_ahead:      { color: 'bg-sky-500/25 text-sky-200 border-sky-500/40',         icon: '↑↑' },
}

const VERDICT: Record<Pace, string> = {
  well_behind:     'well behind',
  behind:          'behind',
  slightly_behind: 'slightly behind',
  on_track:        'on track',
  slightly_ahead:  'slightly ahead',
  ahead:           'ahead',
  well_ahead:      'well ahead',
}

export function PaceChip({ pace, gap, hasFeeds }: Props) {
  if (!hasFeeds) {
    return <span className="text-xs text-zinc-500">awaiting first feed</span>
  }
  const abs = Math.abs(gap)
  const showQuantity = abs >= 1 // hide '0 ml' clutter
  const onTrack = pace === 'on_track'
  const sign = gap > 0 ? '+' : '−'
  const s = STYLES[pace]
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border ${s.color}`}>
      <span>{s.icon}</span>
      <span>{VERDICT[pace]}</span>
      {showQuantity && (
        <span className={`tabular-nums ${onTrack ? 'opacity-60 text-xs' : ''}`}>
          · {onTrack ? `${sign}${abs.toFixed(0)}` : abs.toFixed(0)} ml
        </span>
      )}
    </span>
  )
}

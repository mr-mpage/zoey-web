type Props = { pace: 'behind' | 'on_track' | 'ahead'; gap: number; hasFeeds: boolean }

export function PaceChip({ pace, gap, hasFeeds }: Props) {
  if (!hasFeeds) {
    return <span className="text-xs text-zinc-500">awaiting first feed</span>
  }
  const abs = Math.abs(gap)
  const map = {
    behind: { color: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: '↓', label: `behind ${abs.toFixed(0)} ml` },
    on_track: { color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', icon: '●', label: 'on track' },
    ahead: { color: 'bg-sky-500/15 text-sky-300 border-sky-500/30', icon: '↑', label: `ahead ${abs.toFixed(0)} ml` },
  } as const
  const m = map[pace]
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border ${m.color}`}>
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  )
}

type Props = { status: 'below' | 'normal' | 'above'; sampleDays: number }

export function StatusBadge({ status, sampleDays }: Props) {
  if (sampleDays === 0) {
    return <span className="text-[10px] text-zinc-500 uppercase tracking-wider">no history</span>
  }
  const map = {
    below: { color: 'bg-amber-500/15 text-amber-300', icon: '↓', label: 'below avg' },
    normal: { color: 'bg-emerald-500/15 text-emerald-300', icon: '≈', label: 'normal' },
    above: { color: 'bg-sky-500/15 text-sky-300', icon: '↑', label: 'above avg' },
  } as const
  const m = map[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${m.color}`}>
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  )
}

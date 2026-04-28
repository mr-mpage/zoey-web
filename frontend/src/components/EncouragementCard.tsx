import type { Encouragement } from '../lib/encouragement'

const STYLES: Record<Encouragement['tone'], { bg: string; border: string; accent: string; label: string }> = {
  celebrate: {
    bg: 'bg-emerald-500/8',
    border: 'border-emerald-500/30',
    accent: 'text-emerald-300',
    label: 'Target reached',
  },
  positive: {
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/20',
    accent: 'text-emerald-300/90',
    label: 'On track',
  },
  neutral: {
    bg: 'bg-zinc-800/40',
    border: 'border-zinc-700/40',
    accent: 'text-zinc-400',
    label: 'Heads up',
  },
  concern: {
    bg: 'bg-amber-500/8',
    border: 'border-amber-500/30',
    accent: 'text-amber-300',
    label: 'Behind pace',
  },
}

export function EncouragementCard({ enc }: { enc: Encouragement }) {
  const s = STYLES[enc.tone]
  return (
    <div className={`mt-4 rounded-2xl border ${s.border} ${s.bg} p-4`}>
      <div className={`text-[10px] uppercase tracking-wider ${s.accent} mb-1`}>{s.label}</div>
      <div className="text-sm text-zinc-100 leading-relaxed">{enc.text}</div>
    </div>
  )
}

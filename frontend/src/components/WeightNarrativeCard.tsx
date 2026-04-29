import type { WeightNarrative } from '../lib/weightNarrative'

const TONE: Record<WeightNarrative['tone'], { border: string; bg: string; accent: string; dot: string }> = {
  celebrate: { border: 'border-sky-500/30',     bg: 'bg-sky-500/5',     accent: 'text-sky-300',     dot: 'bg-sky-400' },
  positive:  { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', accent: 'text-emerald-300', dot: 'bg-emerald-400' },
  neutral:   { border: 'border-zinc-700/40',    bg: 'bg-zinc-900/40',   accent: 'text-zinc-300',    dot: 'bg-zinc-500' },
  concern:   { border: 'border-amber-500/30',   bg: 'bg-amber-500/5',   accent: 'text-amber-300',   dot: 'bg-amber-400' },
}

export function WeightNarrativeCard({ narrative }: { narrative: WeightNarrative }) {
  const t = TONE[narrative.tone]
  return (
    <div className={`rounded-xl border ${t.border} ${t.bg} p-3 mb-4`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className={`text-[10px] uppercase tracking-wider ${t.accent}`}>What the chart shows</span>
      </div>
      <div className="text-sm text-zinc-100 leading-snug">{narrative.headline}</div>
      <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{narrative.detail}</div>
    </div>
  )
}

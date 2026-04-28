import { useOverview } from '../api/hooks'
import { ZOEY_BIRTH_ISO } from '../lib/constants'
import { ageInDays, fmtDateLong } from '../lib/format'
import type { OverviewIndicator, OverviewStatus } from '../api/types'

const TONE: Record<OverviewStatus, { border: string; bg: string; accent: string; dot: string; word: string }> = {
  good: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    accent: 'text-emerald-300',
    dot: 'bg-emerald-400',
    word: 'On track',
  },
  over: {
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/5',
    accent: 'text-sky-300',
    dot: 'bg-sky-400',
    word: 'Above',
  },
  watch: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    accent: 'text-amber-300',
    dot: 'bg-amber-400',
    word: 'Watch',
  },
  concern: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/5',
    accent: 'text-rose-300',
    dot: 'bg-rose-400',
    word: 'Flag',
  },
  unknown: {
    border: 'border-zinc-700/40',
    bg: 'bg-zinc-800/30',
    accent: 'text-zinc-400',
    dot: 'bg-zinc-500',
    word: '—',
  },
}

function IndicatorCard({ ind }: { ind: OverviewIndicator }) {
  const t = TONE[ind.status]
  return (
    <div className={`rounded-2xl border ${t.border} ${t.bg} p-4`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">{ind.title}</div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${t.dot}`} />
          <span className={`text-[11px] uppercase tracking-wider ${t.accent}`}>{t.word}</span>
        </div>
      </div>
      <div className="text-base text-zinc-100 leading-snug">{ind.headline}</div>
      <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{ind.detail}</div>
    </div>
  )
}

export function OverviewScreen() {
  const { data, isLoading } = useOverview()
  const day = ageInDays(ZOEY_BIRTH_ISO)
  const today = new Date().toISOString().slice(0, 10)

  if (isLoading || !data) {
    return <div className="p-8 text-center text-zinc-500">Loading…</div>
  }

  const summaryTone = TONE[data.summary.status]

  return (
    <div className="px-4 pt-6 pb-28 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-1">
        Day {day} · {fmtDateLong(today)}
      </div>
      <div className="text-center text-zinc-300 text-xl font-light mt-1">How is Zoey doing?</div>

      <div className={`mt-6 rounded-2xl border ${summaryTone.border} ${summaryTone.bg} p-5 text-center`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className={`w-2.5 h-2.5 rounded-full ${summaryTone.dot}`} />
          <span className={`text-[11px] uppercase tracking-wider ${summaryTone.accent}`}>Overall</span>
        </div>
        <div className="text-base text-zinc-100 leading-relaxed">{data.summary.text}</div>
      </div>

      <div className="mt-4 space-y-2.5">
        {data.indicators.map((ind) => (
          <IndicatorCard key={ind.key} ind={ind} />
        ))}
      </div>

      <div className="mt-6 text-[11px] text-zinc-600 text-center leading-relaxed">
        Indicators use the last few completed days, your configured target band, and her weight history.
        They're informational — your doctor's guidance always takes precedence.
      </div>
    </div>
  )
}

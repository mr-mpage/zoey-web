import { useAppSettings, useOverview } from '../api/hooks'
import { ageInDays, fmtDateLong } from '../lib/format'
import { buildOverviewNarrative } from '../lib/overviewNarrative'
import type { OverviewIndicator, OverviewStatus } from '../api/types'

const ICON_PROPS = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const KEY_ICON: Record<string, React.ReactNode> = {
  intake: (
    <svg {...ICON_PROPS}>
      <path d="M9 3h6" />
      <path d="M10 3v3.5a3 3 0 0 1-.4 1.5l-1.2 2a4 4 0 0 0-.4 1.7V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7.3a4 4 0 0 0-.4-1.7l-1.2-2A3 3 0 0 1 14 6.5V3" />
      <path d="M8 13h8" />
    </svg>
  ),
  growth: (
    <svg {...ICON_PROPS}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M7 16l4-5 3 3 5-7" />
    </svg>
  ),
  today_pace: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  hydration: (
    <svg {...ICON_PROPS}>
      <path d="M12 3.2c-3.4 4-6.5 7.4-6.5 11.1a6.5 6.5 0 0 0 13 0c0-3.7-3.1-7.1-6.5-11.1z" />
    </svg>
  ),
  vitals: (
    <svg {...ICON_PROPS}>
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  ),
}

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
  const icon = KEY_ICON[ind.key]
  return (
    <div className={`rounded-2xl border ${t.border} ${t.bg} p-4`}>
      <div className="flex items-center gap-3 mb-2">
        {icon && (
          <div className={`w-9 h-9 rounded-lg bg-zinc-900/40 ${t.accent} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">{ind.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${t.dot}`} />
            <span className={`text-[11px] uppercase tracking-wider ${t.accent}`}>{t.word}</span>
          </div>
        </div>
      </div>
      <div className="text-base text-zinc-100 leading-snug">{ind.headline}</div>
      <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{ind.detail}</div>
    </div>
  )
}

export function OverviewScreen() {
  const { data, isLoading } = useOverview()
  const { data: appSettings } = useAppSettings()
  const day = appSettings?.birth_date ? ageInDays(appSettings.birth_date) : 0
  const today = new Date().toISOString().slice(0, 10)

  if (isLoading || !data) {
    return <div className="p-8 text-center text-zinc-500">Loading…</div>
  }

  const summaryTone = TONE[data.summary.status]
  const narrative = buildOverviewNarrative(data)

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto">
      <div className="text-center text-zinc-500 text-sm mb-1">
        Day {day} · {fmtDateLong(today)}
      </div>
      <div className="text-center text-zinc-300 text-xl font-light mt-1">How is Zoey doing?</div>

      <div className={`mt-6 rounded-2xl border ${summaryTone.border} ${summaryTone.bg} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full ${summaryTone.dot}`} />
          <span className={`text-[11px] uppercase tracking-wider ${summaryTone.accent}`}>This week</span>
        </div>
        <p className="text-[15px] text-zinc-100 leading-relaxed">{narrative}</p>
      </div>

      <div className="mt-5 mb-2 px-1 text-[11px] uppercase tracking-wider text-zinc-500">The detail</div>
      <div className="space-y-2.5">
        {data.indicators.map((ind) => (
          <IndicatorCard key={ind.key} ind={ind} />
        ))}
      </div>

      <div className="mt-6 text-[11px] text-zinc-600 text-center leading-relaxed">
        Indicators use the last few completed days, your configured target band, and her weight history.
        Your doctor's guidance always takes precedence.
      </div>
    </div>
  )
}

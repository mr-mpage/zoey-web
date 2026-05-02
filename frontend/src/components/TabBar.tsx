type Tab = 'today' | 'overview' | 'history' | 'meds' | 'settings'

type IconProps = { className?: string }

function TodayIcon({ className }: IconProps) {
  // Calendar with a day-marker dot
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3.5v3M16 3.5v3" />
      <circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function OverviewIcon({ className }: IconProps) {
  // Heart — health overview
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 20.5s-7.5-4.6-7.5-10.3a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" />
    </svg>
  )
}

function HistoryIcon({ className }: IconProps) {
  // Bar chart
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3.5 20.5h17" />
      <rect x="6" y="12" width="3" height="8.5" rx="0.6" />
      <rect x="10.5" y="7.5" width="3" height="13" rx="0.6" />
      <rect x="15" y="14" width="3" height="6.5" rx="0.6" />
    </svg>
  )
}

function SettingsIcon({ className }: IconProps) {
  // Gear
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.6 21 13l-1.6-1.6.6-2.2-2.2-.6L17.2 6.4 15.6 7l-1.6-1L13 4.5h-2L10 6l-1.6 1L6.8 6.4l-.6 2.2-2.2.6L4.6 11.4 3 13l1.6 1.6-.6 2.2 2.2.6.6 2.2 2.2-.6 1.6 1H13l1-1.6 1.6-1 2.2.6.6-2.2 2.2-.6z" />
    </svg>
  )
}

function MedsIcon({ className }: IconProps) {
  // Pill — capsule shape, two halves
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-30 12 12)" />
      <path d="M9.4 7.4l5.2 9" />
    </svg>
  )
}

const TABS: { id: Tab; label: string; Icon: (p: IconProps) => React.ReactElement }[] = [
  { id: 'today', label: 'Today', Icon: TodayIcon },
  { id: 'overview', label: 'Overview', Icon: OverviewIcon },
  { id: 'history', label: 'Trends', Icon: HistoryIcon },
  { id: 'meds', label: 'Meds', Icon: MedsIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
]

export function TabBar({
  active,
  onChange,
  hideSettings = false,
}: {
  active: Tab
  onChange: (t: Tab) => void
  hideSettings?: boolean
}) {
  const visible = hideSettings ? TABS.filter((t) => t.id !== 'settings') : TABS
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur border-t border-zinc-900 pb-[env(safe-area-inset-bottom)]"
      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
    >
      <div
        className="max-w-xl mx-auto grid"
        style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
      >
        {visible.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`py-2.5 flex flex-col items-center gap-1 text-[11px] ${
              active === t.id ? 'text-pink-200' : 'text-zinc-500'
            }`}
          >
            <t.Icon className="w-6 h-6" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

export type { Tab }

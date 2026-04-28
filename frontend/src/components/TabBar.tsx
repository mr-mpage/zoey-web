type Tab = 'today' | 'pumps' | 'history' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '●' },
  { id: 'pumps', label: 'Pumps', icon: '◐' },
  { id: 'history', label: 'History', icon: '▦' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-900 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-xl mx-auto grid grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`py-3 flex flex-col items-center gap-1 text-[11px] ${
              active === t.id ? 'text-pink-200' : 'text-zinc-500'
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

export type { Tab }

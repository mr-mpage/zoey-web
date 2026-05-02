import { useState } from 'react'
import { useAuthStatus } from './api/hooks'
import { HelpModal } from './components/HelpModal'
import { LockScreen } from './components/LockScreen'
import { TabBar, type Tab } from './components/TabBar'
import { AuthModeContext } from './lib/authMode'
import { TodayScreen } from './screens/Today'
import { OverviewScreen } from './screens/Overview'
import { HistoryScreen } from './screens/History'
import { MedsScreen } from './screens/Meds'
import { SettingsScreen } from './screens/Settings'

function App() {
  const auth = useAuthStatus()
  const [tab, setTab] = useState<Tab>('today')
  const [helpOpen, setHelpOpen] = useState(false)

  if (auth.isLoading) {
    return <div className="h-full flex items-center justify-center text-zinc-600">…</div>
  }

  if (!auth.data?.authenticated) {
    return <LockScreen />
  }

  const mode: 'edit' | 'view' = auth.data.mode === 'view' ? 'view' : 'edit'
  const label = auth.data.label ?? null
  const isView = mode === 'view'

  // View sessions can't reach Settings (it's all configuration); if state still
  // points there from a prior edit session, snap back to Today.
  const activeTab: Tab = isView && tab === 'settings' ? 'today' : tab

  return (
    <AuthModeContext.Provider value={{ mode, label }}>
      {/* The outer is sized to var(--app-height), which is the live
          VisualViewport height tracked from main.tsx. Children that
          should pin to the screen edges use position:absolute against
          this container — not position:fixed, which iOS bounds to its
          own (inconsistent) visual-viewport report. */}
      <div className="relative h-full">
        <main className="absolute inset-0 overflow-y-auto overscroll-contain pt-[env(safe-area-inset-top)] pb-[calc(theme(spacing.20)+env(safe-area-inset-bottom))]">
          {activeTab === 'today' && <TodayScreen />}
          {activeTab === 'overview' && <OverviewScreen />}
          {activeTab === 'history' && <HistoryScreen />}
          {activeTab === 'meds' && <MedsScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
        </main>

        <button
          onClick={() => setHelpOpen(true)}
          aria-label="Help"
          className="absolute right-3 w-9 h-9 rounded-full bg-zinc-900/80 backdrop-blur border border-zinc-800 text-zinc-400 text-base flex items-center justify-center active:scale-95 z-40"
          style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
        >
          ?
        </button>

        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
        <TabBar active={activeTab} onChange={setTab} hideSettings={isView} />
      </div>
    </AuthModeContext.Provider>
  )
}

export default App

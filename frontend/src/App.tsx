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
    return <div className="min-h-dvh flex items-center justify-center text-zinc-600">…</div>
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
      {/* Inner-scrolling layout: outer fills the dynamic viewport and
          doesn't scroll itself; <main> scrolls; the tab bar is the
          static last child of the flex column. iOS Safari's
          position-fixed-during-scroll quirks (the bar drifting up
          mid-page on tab/scroll combos) don't apply when the bar
          isn't fixed. */}
      <div className="h-dvh flex flex-col pt-[env(safe-area-inset-top)] overflow-hidden">
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {activeTab === 'today' && <TodayScreen />}
          {activeTab === 'overview' && <OverviewScreen />}
          {activeTab === 'history' && <HistoryScreen />}
          {activeTab === 'meds' && <MedsScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
        </main>

        <button
          onClick={() => setHelpOpen(true)}
          aria-label="Help"
          className="fixed right-3 w-9 h-9 rounded-full bg-zinc-900/80 backdrop-blur border border-zinc-800 text-zinc-400 text-base flex items-center justify-center active:scale-95 z-40"
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

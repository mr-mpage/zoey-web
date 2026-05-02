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
      {/* html/body/#root are locked to height:100% + overflow:hidden in
          globals.css, so the document never scrolls. <main> is the only
          scroller; the TabBar is fixed to the visual viewport bottom
          (cleanest pinning on iOS PWA) and its safe-area padding extends
          the bar through the home-indicator zone. */}
      <div className="h-full pt-[env(safe-area-inset-top)]">
        <main className="h-full overflow-y-auto overscroll-contain pb-[calc(theme(spacing.20)+env(safe-area-inset-bottom))]">
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

import { useState } from 'react'
import { useAuthStatus, useLogout } from './api/hooks'
import { HelpModal } from './components/HelpModal'
import { LockScreen } from './components/LockScreen'
import { TabBar, type Tab } from './components/TabBar'
import { AuthModeContext } from './lib/authMode'
import { TodayScreen } from './screens/Today'
import { OverviewScreen } from './screens/Overview'
import { PumpsScreen } from './screens/Pumps'
import { HistoryScreen } from './screens/History'
import { SettingsScreen } from './screens/Settings'

function App() {
  const auth = useAuthStatus()
  const logout = useLogout()
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
      <div className="min-h-dvh pt-[env(safe-area-inset-top)]">
        {activeTab === 'today' && <TodayScreen />}
        {activeTab === 'overview' && <OverviewScreen />}
        {activeTab === 'pumps' && <PumpsScreen />}
        {activeTab === 'history' && <HistoryScreen />}
        {activeTab === 'settings' && <SettingsScreen />}

        <button
          onClick={() => setHelpOpen(true)}
          aria-label="Help"
          className="fixed right-3 w-9 h-9 rounded-full bg-zinc-900/80 backdrop-blur border border-zinc-800 text-zinc-400 text-base flex items-center justify-center active:scale-95 z-40"
          style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
        >
          ?
        </button>

        {isView && (
          <button
            onClick={() => logout.mutate()}
            aria-label="Sign out"
            className="fixed right-3 w-9 h-9 rounded-full bg-zinc-900/80 backdrop-blur border border-zinc-800 text-zinc-400 flex items-center justify-center active:scale-95 z-40"
            style={{ top: 'calc(env(safe-area-inset-top) + 3.5rem)' }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
              <path d="M10 17l-5-5 5-5" />
              <path d="M5 12h11" />
            </svg>
          </button>
        )}

        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
        <TabBar active={activeTab} onChange={setTab} hideSettings={isView} />
      </div>
    </AuthModeContext.Provider>
  )
}

export default App

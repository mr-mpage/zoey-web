import { useState } from 'react'
import { useAuthStatus } from './api/hooks'
import { HelpModal } from './components/HelpModal'
import { LockScreen } from './components/LockScreen'
import { TabBar, type Tab } from './components/TabBar'
import { TodayScreen } from './screens/Today'
import { PumpsScreen } from './screens/Pumps'
import { HistoryScreen } from './screens/History'
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

  return (
    <div className="min-h-dvh">
      {tab === 'today' && <TodayScreen />}
      {tab === 'pumps' && <PumpsScreen />}
      {tab === 'history' && <HistoryScreen />}
      {tab === 'settings' && <SettingsScreen />}

      <button
        onClick={() => setHelpOpen(true)}
        aria-label="Help"
        className="fixed top-3 right-3 w-9 h-9 rounded-full bg-zinc-900/80 backdrop-blur border border-zinc-800 text-zinc-400 text-base flex items-center justify-center active:scale-95 z-40"
      >
        ?
      </button>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}

export default App

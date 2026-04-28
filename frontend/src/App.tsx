import { useState } from 'react'
import { useAuthStatus } from './api/hooks'
import { LockScreen } from './components/LockScreen'
import { TabBar, type Tab } from './components/TabBar'
import { TodayScreen } from './screens/Today'
import { PumpsScreen } from './screens/Pumps'
import { HistoryScreen } from './screens/History'
import { SettingsScreen } from './screens/Settings'

function App() {
  const auth = useAuthStatus()
  const [tab, setTab] = useState<Tab>('today')

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
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}

export default App

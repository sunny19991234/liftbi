import { useState } from 'react'
import { isLoggedIn } from './lib/auth'
import Login from './components/Login'
import Home from './components/Home'
import VolumeDashboard from './components/VolumeDashboard'
import ExerciseLibrary from './components/ExerciseLibrary'
import Agenda from './components/Agenda'
import Sessions from './components/Sessions'
import MonthlyComparison from './components/MonthlyComparison'
import PersonalRecords from './components/PersonalRecords'

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'volume', label: 'Statistics' },
  { id: 'oefeningen', label: 'Oefeningen' },
  { id: 'maand', label: 'Maandvergelijking', hidden: true },
  { id: 'prs', label: "PR's", hidden: true },
  { id: 'agenda', label: 'Agenda' },
  { id: 'sessions', label: 'Sessies' },
]

function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [tab, setTab] = useState('home')
  const [pendingSessionId, setPendingSessionId] = useState(null)

  if (!loggedIn) {
    return <Login onLoginSuccess={() => setLoggedIn(true)} />
  }

  function goToSession(workoutId) {
    setPendingSessionId(workoutId)
    setTab('sessions')
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] font-[var(--font-body)]">
      <header className="px-plate-4 pt-plate-4 sticky top-0 z-40 bg-[var(--color-bg)]/95 backdrop-blur-sm border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center justify-between pb-plate-3">
          <h1 className="font-[var(--font-display)] font-semibold text-3xl tracking-tight">
            Lift<span className="text-[var(--color-accent)]">BI</span>
          </h1>
          <nav className="flex gap-plate-1 flex-wrap">
            {TABS.filter((t) => !t.hidden).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-plate-3 py-plate-1 rounded-lg text-sm font-[var(--font-body)] transition-all ${
                  tab === t.id
                    ? 'bg-[var(--color-accent)] text-white shadow-[0_2px_12px_-2px_rgba(255,75,62,0.5)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-card)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="loaded-bar rounded-full" style={{ '--load-pct': '100%' }} />
      </header>

      {tab === 'home' && <Home onNavigate={setTab} onTokenExpired={() => setLoggedIn(false)} />}
      {tab === 'volume' && <VolumeDashboard />}
      {tab === 'oefeningen' && <ExerciseLibrary />}
      {tab === 'maand' && <MonthlyComparison />}
      {tab === 'prs' && <PersonalRecords />}
      {tab === 'agenda' && <Agenda onViewSession={goToSession} />}
      {tab === 'sessions' && (
        <Sessions
          initialSelectedId={pendingSessionId}
          onSelectionHandled={() => setPendingSessionId(null)}
        />
      )}
    </div>
  )
}

export default App

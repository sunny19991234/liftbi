import { useState } from 'react'
import { isLoggedIn } from './lib/auth'
import Login from './components/Login'
import Home from './components/Home'
import VolumeDashboard from './components/VolumeDashboard'
import ExerciseLibrary from './components/ExerciseLibrary'
import MonthlyComparison from './components/MonthlyComparison'
import PersonalRecords from './components/PersonalRecords'
import Workouts from './components/Workouts'

const TABS = [
  { id: 'home',      label: 'Home',       icon: 'home'      },
  { id: 'volume',    label: 'Statistics', icon: 'chart-bar' },
  { id: 'oefeningen',label: 'Oefeningen', icon: 'dumbbell'  },
  { id: 'maand',     label: 'Maandvergelijking', hidden: true },
  { id: 'prs',       label: "PR's",       hidden: true      },
  { id: 'workouts',  label: 'Workouts',   icon: 'calendar'  },
]

function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [tab, setTab] = useState('home')
  const [initialExercise, setInitialExercise] = useState(null)

  function onNavigate(tabId, options = {}) {
    setTab(tabId)
    if (options.exercise) setInitialExercise(options.exercise)
  }

  if (!loggedIn) {
    return <Login onLoginSuccess={() => setLoggedIn(true)} />
  }

  const visibleTabs = TABS.filter((t) => !t.hidden)

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text-primary)] font-[var(--font-body)]">
      <header className="px-plate-3 sm:px-plate-4 pt-plate-2 sm:pt-plate-4 sticky top-0 z-40 bg-[var(--color-bg)]/95 backdrop-blur-sm border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center justify-between pb-plate-2 sm:pb-plate-3">
          <h1 className="font-[var(--font-display)] font-semibold text-2xl sm:text-3xl tracking-tight">
            Lift<span className="text-[var(--color-accent)]">BI</span>
          </h1>
          {/* Desktop nav — verborgen op mobiel */}
          <nav className="hidden sm:flex gap-plate-1">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => onNavigate(t.id)}
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

      {/* Pagina-inhoud — extra ondermarge op mobiel voor de bottom nav */}
      <div className="pb-20 sm:pb-0">
        {tab === 'home'       && <Home onNavigate={onNavigate} onTokenExpired={() => setLoggedIn(false)} />}
        {tab === 'volume'     && <VolumeDashboard />}
        {tab === 'oefeningen' && (
          <ExerciseLibrary
            initialExercise={initialExercise}
            onResetInitialExercise={() => setInitialExercise(null)}
          />
        )}
        {tab === 'maand'      && <MonthlyComparison />}
        {tab === 'prs'        && <PersonalRecords />}
        {tab === 'workouts'   && <Workouts />}
      </div>

      {/* Mobiele bottom nav — alleen zichtbaar op mobiel */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-bg)]/95 backdrop-blur-sm border-t border-[var(--color-border-subtle)]">
        <div className="flex items-stretch">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onNavigate(t.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${
                tab === t.id
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-tertiary)]'
              }`}
            >
              <i className={`ti ti-${t.icon}`} style={{ fontSize: 20 }} aria-hidden="true" />
              <span className="font-[var(--font-body)] text-[10px] leading-none">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default App

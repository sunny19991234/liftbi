// src/components/Home.jsx
//
// Startpagina: samenvatting van wat er nu toe doet -- eerstvolgende
// geplande sessie (of rustdag-signaal als vandaag niets gepland/uitgevoerd
// is), een dagstrip met recente + komende dagen, het weekvolume tot nu, en
// een proactief plateau-signaal (PRD 4.12) als er stagnerende oefeningen
// gevonden worden.
//
// Visueel signature-moment van de app: de hero-kaart krijgt de gestaalde
// .surface-hero behandeling (subtiele lichtstreep, diepere schaduw) -- de
// boldness wordt hier besteed, de rest van het scherm blijft rustig.

import { useEffect, useState } from 'react'
import { fetchNextPlanned, fetchDayStrip, fetchWeekVolume } from '../lib/homeData'
import { getTodayStr } from '../lib/calendarData'
import { detectPlateaus } from '../lib/plateauData'

const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

export default function Home({ onNavigate }) {
  const [nextPlanned, setNextPlanned] = useState(undefined) // undefined = loading, null = none
  const [dayStrip, setDayStrip] = useState(null)
  const [weekVolume, setWeekVolume] = useState(null)
  const [plateaus, setPlateaus] = useState(null) // null = loading, [] = geen plateaus
  const [error, setError] = useState(null)

  const today = getTodayStr()

  useEffect(() => {
    Promise.all([fetchNextPlanned(), fetchDayStrip(), fetchWeekVolume(), detectPlateaus()])
      .then(([next, strip, vol, plateauList]) => {
        setNextPlanned(next)
        setDayStrip(strip)
        setWeekVolume(vol)
        setPlateaus(plateauList)
      })
      .catch((err) => setError(err.message))
  }, [])

  const todayInfo = dayStrip?.find((d) => d.isToday)?.info
  const todayIsRestDay = dayStrip && !todayInfo

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout: {error}</p>
  }

  return (
    <div className="max-w-3xl mx-auto p-plate-4 flex flex-col gap-plate-4">
      <NextSessionCard
        nextPlanned={nextPlanned}
        todayInfo={todayInfo}
        todayIsRestDay={todayIsRestDay}
        onNavigate={onNavigate}
      />

      {plateaus && plateaus.length > 0 && (
        <PlateauSignal plateaus={plateaus} onNavigate={onNavigate} />
      )}

      <div className="surface rounded-xl p-plate-3">
        <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm mb-plate-2">
          Recent & aankomend
        </p>
        {!dayStrip ? (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
        ) : (
          <DayStrip days={dayStrip} onNavigate={onNavigate} />
        )}
      </div>

      <WeekVolumeCard weekVolume={weekVolume} onNavigate={onNavigate} />
    </div>
  )
}

function PlateauSignal({ plateaus, onNavigate }) {
  const visible = plateaus.slice(0, 3)
  const extra = plateaus.length - visible.length

  return (
    <button
      onClick={() => onNavigate('rpe')}
      className="surface text-left rounded-xl p-plate-3 hover:brightness-110 transition-all border-l-2 border-[var(--color-status-low)]"
    >
      <div className="flex items-center justify-between mb-plate-2">
        <p className="text-xs text-[var(--color-status-low)] font-[var(--font-mono)] tracking-wide uppercase">
          {plateaus.length === 1 ? '1 oefening stagneert' : `${plateaus.length} oefeningen stagneren`}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        {visible.map((p) => (
          <div key={p.exercise_title} className="flex items-center justify-between">
            <span className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)]">{p.exercise_title}</span>
            <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] tabular-data">
              gewicht {p.weightTrend} · RPE {p.rpeTrend}
            </span>
          </div>
        ))}
        {extra > 0 && (
          <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-tertiary)] mt-1">+{extra} meer</span>
        )}
      </div>
    </button>
  )
}

function NextSessionCard({ nextPlanned, todayInfo, todayIsRestDay, onNavigate }) {
  if (nextPlanned === undefined) {
    return (
      <div className="surface-hero rounded-2xl p-plate-4">
        <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
      </div>
    )
  }

  if (todayInfo?.type === 'done') {
    return (
      <div className="surface-hero rounded-2xl p-plate-4">
        <div className="loaded-bar -mx-plate-4 -mt-plate-4 mb-plate-4 rounded-t-2xl" style={{ '--load-pct': '100%' }} />
        <p className="text-xs text-[var(--color-status-ok)] font-[var(--font-mono)] tracking-wide uppercase mb-2">
          Vandaag voltooid
        </p>
        <h2 className="font-[var(--font-display)] font-semibold text-4xl text-[var(--color-text-primary)] tracking-tight">
          {todayInfo.title}
        </h2>
      </div>
    )
  }

  if (todayIsRestDay && !nextPlanned) {
    return (
      <div className="surface-hero rounded-2xl p-plate-5 text-center">
        <p className="text-xs text-[var(--color-text-tertiary)] font-[var(--font-mono)] tracking-wide uppercase mb-2">
          Vandaag
        </p>
        <h2 className="font-[var(--font-display)] font-semibold text-4xl text-[var(--color-text-primary)] tracking-tight">
          Rustdag
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] font-[var(--font-body)] mt-2">
          Niets gepland voor vandaag.
        </p>
      </div>
    )
  }

  if (!nextPlanned) {
    return (
      <div className="surface rounded-2xl p-plate-4">
        <p className="text-sm text-[var(--color-text-secondary)] font-[var(--font-body)]">
          Geen geplande sessies. Plan er een in de Agenda.
        </p>
      </div>
    )
  }

  const isToday = nextPlanned.planned_date === getTodayStr()

  return (
    <button
      onClick={() => onNavigate('agenda')}
      className="surface-hero text-left rounded-2xl p-plate-4 hover:brightness-110 transition-all group"
    >
      <div className="loaded-bar -mx-plate-4 -mt-plate-4 mb-plate-4 rounded-t-2xl" style={{ '--load-pct': '60%' }} />
      <p className="text-xs text-[var(--color-data)] font-[var(--font-mono)] tracking-wide uppercase mb-2">
        {isToday ? 'Vandaag gepland' : 'Volgende sessie'}
      </p>
      <h2 className="font-[var(--font-display)] font-semibold text-4xl text-[var(--color-text-primary)] tracking-tight group-hover:text-white transition-colors">
        {nextPlanned.title}
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] font-[var(--font-mono)] mt-2 tabular-data">
        {nextPlanned.planned_date}
      </p>
      {nextPlanned.notes && (
        <p className="text-sm text-[var(--color-text-secondary)] font-[var(--font-body)] mt-3">{nextPlanned.notes}</p>
      )}
    </button>
  )
}

function DayStrip({ days, onNavigate }) {
  return (
    <div className="grid grid-cols-7 gap-plate-1">
      {days.map((d) => {
        const dayNum = Number(d.date.slice(8, 10))
        const weekday = WEEKDAY_SHORT[new Date(d.date + 'T00:00:00').getDay()]

        let bg = 'bg-[var(--color-bg)]'
        let label = 'rust'
        let labelColor = 'text-[var(--color-text-tertiary)]'

        if (d.info?.type === 'done') {
          bg = 'bg-[var(--color-status-ok)]/[0.1]'
          label = d.info.title
          labelColor = 'text-[var(--color-status-ok)]'
        } else if (d.info?.type === 'planned') {
          if (d.info.status === 'missed') {
            bg = 'bg-[var(--color-status-high)]/[0.1]'
            label = 'gemist'
            labelColor = 'text-[var(--color-status-high)]'
          } else if (d.info.status === 'skipped') {
            bg = 'bg-[var(--color-bg)] opacity-60'
            label = 'overgeslagen'
            labelColor = 'text-[var(--color-text-tertiary)]'
          } else {
            bg = 'bg-[var(--color-data)]/[0.1]'
            label = d.info.title
            labelColor = 'text-[var(--color-data)]'
          }
        }

        return (
          <button
            key={d.date}
            onClick={() => onNavigate('agenda')}
            className={`rounded-lg p-plate-1 flex flex-col items-center gap-0.5 border border-[var(--color-border-subtle)] transition-all hover:border-[var(--color-border)] hover:brightness-125 ${bg} ${
              d.isToday ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-card)]' : ''
            }`}
          >
            <span className="text-[9px] font-[var(--font-mono)] text-[var(--color-text-tertiary)]">{weekday}</span>
            <span className={`text-xs font-[var(--font-mono)] ${d.isToday ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-secondary)]'}`}>
              {dayNum}
            </span>
            <span className={`text-[8px] font-[var(--font-body)] truncate w-full text-center ${labelColor}`}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function WeekVolumeCard({ weekVolume, onNavigate }) {
  return (
    <button
      onClick={() => onNavigate('volume')}
      className="surface text-left rounded-xl p-plate-3 hover:brightness-110 transition-all"
    >
      <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm mb-plate-3">
        Volume deze week
      </p>
      {!weekVolume ? (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
      ) : (
        <div className="flex gap-plate-6 items-baseline">
          <div>
            <p className="font-[var(--font-display)] font-semibold text-4xl text-[var(--color-text-primary)] tabular-data tracking-tight">
              {weekVolume.setCount}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] font-[var(--font-body)] uppercase tracking-wide mt-1">sets</p>
          </div>
          <div>
            <p className="font-[var(--font-display)] font-semibold text-4xl text-[var(--color-accent)] tabular-data tracking-tight">
              {weekVolume.volumeKg}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] font-[var(--font-body)] uppercase tracking-wide mt-1">kg totaal</p>
          </div>
        </div>
      )}
    </button>
  )
}

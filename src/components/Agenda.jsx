// src/components/Agenda.jsx
//
// Maandkalender: per dag uitgevoerde workout (met highlights) of geplande
// sessie, vandaag gearceerd, lege dagen als rustdag gestyled. Klik op een
// lege/geplande dag opent een mini-formulier om een sessie te plannen.
//
// Signature-element: uitgevoerde dagen krijgen een "loaded bar" -- een
// dunne kopbalk waarvan de breedte het volume van die sessie representeert
// t.o.v. de zwaarste sessie in de zichtbare maand.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMonthData, getTodayStr } from '../lib/calendarData'

const ROUTINE_TITLES = ['Push', 'Pull', 'Legs', 'Upper']
const WEEKDAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const MONTH_LABELS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

function buildCalendarGrid(year, month) {
  const firstOfMonth = new Date(year, month - 1, 1)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7 // 0 = maandag
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push(dateStr)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export default function Agenda({ onViewSession }) {
  const today = getTodayStr()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)))
  const [dayMap, setDayMap] = useState(null)
  const [error, setError] = useState(null)
  const [planDialogDate, setPlanDialogDate] = useState(null)
  const [analysisPreview, setAnalysisPreview] = useState(null) // { title, start_date, summary, workoutId } | null

  const weeks = useMemo(() => buildCalendarGrid(year, month), [year, month])

  // Hoogste volume in de zichtbare maand -- basis voor de loaded-bar-schaal.
  const maxVolume = useMemo(() => {
    if (!dayMap) return 0
    let max = 0
    for (const info of dayMap.values()) {
      if (info.type === 'done' && info.volumeKg > max) max = info.volumeKg
    }
    return max
  }, [dayMap])

  async function load() {
    try {
      const data = await fetchMonthData(year, month)
      setDayMap(data)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  function goToPrevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12) } else { setMonth(month - 1) }
  }
  function goToNextMonth() {
    if (month === 12) { setYear(year + 1); setMonth(1) } else { setMonth(month + 1) }
  }

  async function handlePlanSubmit(title, notes) {
    const { error } = await supabase.from('planned_workouts').insert({
      planned_date: planDialogDate,
      title,
      notes: notes || null,
      status: 'planned',
    })
    if (error) {
      setError(error.message)
      return
    }
    setPlanDialogDate(null)
    load()
  }

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout: {error}</p>
  }

  return (
    <div className="max-w-4xl mx-auto p-plate-4 flex flex-col gap-plate-4">
      <div className="flex items-center justify-between">
        <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight capitalize">
          {MONTH_LABELS[month - 1]} {year}
        </h2>
        <div className="flex gap-plate-1">
          <button
            onClick={goToPrevMonth}
            className="px-plate-3 py-plate-1 rounded-lg text-sm bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            ←
          </button>
          <button
            onClick={goToNextMonth}
            className="px-plate-3 py-plate-1 rounded-lg text-sm bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-plate-1">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs text-[var(--color-text-secondary)] font-[var(--font-mono)] pb-plate-1">
            {d}
          </div>
        ))}

        {!dayMap
          ? <div className="col-span-7 text-center text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm py-plate-5">Laden...</div>
          : weeks.flatMap((week, wi) =>
              week.map((dateStr, di) => (
                <DayCell
                  key={`${wi}-${di}`}
                  dateStr={dateStr}
                  isToday={dateStr === today}
                  info={dateStr ? dayMap.get(dateStr) : null}
                  maxVolume={maxVolume}
                  onPlanClick={() => setPlanDialogDate(dateStr)}
                  onDoneClick={(info) => setAnalysisPreview({ ...info, date: dateStr })}
                />
              ))
            )}
      </div>

      <Legend />

      {analysisPreview && (
        <AnalysisPreview
          info={analysisPreview}
          onClose={() => setAnalysisPreview(null)}
          onViewFull={() => {
            setAnalysisPreview(null)
            onViewSession?.(analysisPreview.workoutId)
          }}
        />
      )}

      {planDialogDate && (
        <PlanDialog
          date={planDialogDate}
          onClose={() => setPlanDialogDate(null)}
          onSubmit={handlePlanSubmit}
        />
      )}
    </div>
  )
}

function DayCell({ dateStr, isToday, info, maxVolume, onPlanClick, onDoneClick }) {
  if (!dateStr) {
    return <div className="aspect-square" />
  }

  const dayNum = Number(dateStr.slice(8, 10))
  const isRestDay = !info
  const isDone = info?.type === 'done'
  const isClickable = isRestDay || isDone || (info?.type === 'planned' && info.status === 'planned')

  let bgClasses = 'bg-[var(--color-card)]'
  if (info?.type === 'done') bgClasses = 'bg-[var(--color-status-ok)]/[0.08]'
  else if (info?.type === 'planned' && info.status === 'planned') bgClasses = 'bg-[var(--color-data)]/[0.08]'
  else if (info?.type === 'planned' && info.status === 'missed') bgClasses = 'bg-[var(--color-status-high)]/[0.08]'
  else if (info?.type === 'planned' && info.status === 'skipped') bgClasses = 'bg-[var(--color-card)] opacity-50'

  const loadPct = info?.type === 'done' && maxVolume > 0
    ? Math.max(8, Math.round((info.volumeKg / maxVolume) * 100))
    : 0

  function handleClick() {
    if (isDone) onDoneClick(info)
    else if (isClickable) onPlanClick()
  }

  return (
    <button
      type="button"
      onClick={isClickable ? handleClick : undefined}
      className={`aspect-square rounded-lg flex flex-col text-left relative overflow-hidden transition-colors ${bgClasses} ${
        isToday ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg)]' : ''
      } ${isClickable ? 'cursor-pointer hover:brightness-125' : ''}`}
    >
      {info?.type === 'done' && (
        <div className="loaded-bar" style={{ '--load-pct': `${loadPct}%` }} />
      )}

      <div className="p-plate-1 flex-1 flex flex-col">
        <span className={`text-xs font-[var(--font-mono)] ${isToday ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-secondary)]'}`}>
          {dayNum}
        </span>

        {info?.type === 'done' && (
          <div className="flex-1 flex flex-col justify-end gap-0.5">
            <span className="text-[10px] leading-tight font-[var(--font-body)] text-[var(--color-text-primary)] truncate">
              {info.title}
            </span>
            <span className="text-[9px] leading-tight font-[var(--font-mono)] text-[var(--color-status-ok)] tabular-data">
              {info.setCount} sets
            </span>
            <span className="text-[9px] leading-tight font-[var(--font-mono)] text-[var(--color-text-secondary)] tabular-data">
              {info.volumeKg} kg
            </span>
          </div>
        )}

        {info?.type === 'planned' && (
          <div className="flex-1 flex flex-col justify-end gap-0.5">
            <span className={`text-[10px] leading-tight font-[var(--font-body)] truncate ${
              info.status === 'skipped' ? 'text-[var(--color-text-secondary)] line-through'
              : info.status === 'missed' ? 'text-[var(--color-status-high)]'
              : 'text-[var(--color-data)]'
            }`}>
              {info.title}
            </span>
            <span className={`text-[9px] leading-tight font-[var(--font-mono)] ${
              info.status === 'missed' ? 'text-[var(--color-status-high)]' : 'text-[var(--color-text-secondary)]'
            }`}>
              {info.status === 'skipped' ? 'overgeslagen' : info.status === 'missed' ? 'gemist' : 'gepland'}
            </span>
          </div>
        )}

        {isRestDay && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[9px] font-[var(--font-mono)] text-[var(--color-text-secondary)] opacity-40">
              rust
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

function Legend() {
  const items = [
    { color: 'bg-[var(--color-status-ok)]/30', label: 'Uitgevoerd' },
    { color: 'bg-[var(--color-data)]/30', label: 'Gepland' },
    { color: 'bg-[var(--color-status-high)]/30', label: 'Gemist' },
    { color: 'bg-[var(--color-card)] opacity-50', label: 'Overgeslagen' },
    { color: 'bg-[var(--color-card)]', label: 'Rustdag' },
  ]
  return (
    <div className="flex flex-wrap gap-plate-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-plate-1">
          <span className={`w-3 h-3 rounded ${it.color}`} />
          <span className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

function AnalysisPreview({ info, onClose, onViewFull }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface rounded-2xl p-plate-4 flex flex-col gap-plate-3 w-full max-w-sm"
      >
        <div className="loaded-bar -mx-plate-4 -mt-plate-4 mb-plate-1 rounded-t-2xl" style={{ '--load-pct': '100%' }} />

        <div>
          <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)]">
            {info.title}
          </h3>
          <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] tabular-data">
            {info.date} · {info.setCount} sets · {info.volumeKg} kg
          </p>
        </div>

        {info.summary ? (
          <p className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] leading-relaxed line-clamp-4">
            {info.summary}
          </p>
        ) : (
          <p className="font-[var(--font-body)] text-sm text-[var(--color-text-secondary)] italic">
            Geen AI-analyse beschikbaar voor deze sessie.
          </p>
        )}

        <div className="flex gap-plate-2 justify-end pt-plate-1">
          <button
            type="button"
            onClick={onClose}
            className="px-plate-3 py-plate-2 rounded-lg text-sm text-[var(--color-text-secondary)] font-[var(--font-body)]"
          >
            Sluiten
          </button>
          {info.summary && (
            <button
              type="button"
              onClick={onViewFull}
              className="px-plate-3 py-plate-2 rounded-lg text-sm bg-[var(--color-accent)] text-[var(--color-text-primary)] font-[var(--font-body)] font-medium"
            >
              Volledige analyse →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PlanDialog({ date, onClose, onSubmit }) {
  const [title, setTitle] = useState(ROUTINE_TITLES[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    await onSubmit(title, notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="surface rounded-2xl p-plate-4 flex flex-col gap-plate-3 w-full max-w-sm"
      >
        <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)]">
          Plan sessie — <span className="font-[var(--font-mono)] text-base">{date}</span>
        </h3>

        <select
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-[var(--color-bg)] text-[var(--color-text-primary)] rounded-lg px-plate-3 py-plate-2 outline-none border border-transparent focus:border-[var(--color-accent)] font-[var(--font-body)]"
        >
          {ROUTINE_TITLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notities (optioneel)"
          className="bg-[var(--color-bg)] text-[var(--color-text-primary)] rounded-lg px-plate-3 py-plate-2 outline-none border border-transparent focus:border-[var(--color-accent)] font-[var(--font-body)]"
        />

        <div className="flex gap-plate-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-plate-3 py-plate-2 rounded-lg text-sm text-[var(--color-text-secondary)] font-[var(--font-body)]"
          >
            Annuleren
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-plate-3 py-plate-2 rounded-lg text-sm bg-[var(--color-accent)] text-[var(--color-text-primary)] font-[var(--font-body)] font-medium disabled:opacity-40"
          >
            {saving ? 'Bezig...' : 'Plannen'}
          </button>
        </div>
      </form>
    </div>
  )
}

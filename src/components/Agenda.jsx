// src/components/Agenda.jsx
//
// Maandkalender: per dag uitgevoerde workout (met highlights) of geplande
// sessie, vandaag gearceerd, lege dagen als rustdag gestyled. Klik op een
// lege/geplande dag opent een mini-formulier om een sessie te plannen.
//
// Signature-element: uitgevoerde dagen krijgen een "loaded bar" -- een
// dunne kopbalk waarvan de breedte het volume van die sessie representeert
// t.o.v. de zwaarste sessie in de zichtbare maand.
//
// Deload weken: elke week-rij heeft een maanknopje aan de linkerkant.
// Klik = toggle deload. Deload weken krijgen een amber achtergrond-tint.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMonthData, getTodayStr } from '../lib/calendarData'
import { fetchDeloadWeeks, toggleDeloadWeek } from '../lib/deloadData'
import { getWeekStart } from '../lib/dashboardQueries'

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

function getWeekStartForRow(week) {
  const first = week.find(d => d !== null)
  if (!first) return null
  return getWeekStart(first)
}

export default function Agenda({ onViewSession }) {
  const today = getTodayStr()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)))
  const [dayMap, setDayMap] = useState(null)
  const [error, setError] = useState(null)
  const [planDialogDate, setPlanDialogDate] = useState(null)
  const [analysisPreview, setAnalysisPreview] = useState(null)
  const [plannedPopup, setPlannedPopup] = useState(null)
  const [deloadWeeks, setDeloadWeeks] = useState([])
  const [togglingWeek, setTogglingWeek] = useState(null)

  const weeks = useMemo(() => buildCalendarGrid(year, month), [year, month])
  const deloadSet = useMemo(() => new Set(deloadWeeks), [deloadWeeks])

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
      const [data, dlWeeks] = await Promise.all([
        fetchMonthData(year, month),
        fetchDeloadWeeks(),
      ])
      setDayMap(data)
      setDeloadWeeks(dlWeeks)
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

  async function handleToggleDeload(weekStart) {
    if (togglingWeek) return
    setTogglingWeek(weekStart)
    try {
      await toggleDeloadWeek(weekStart)
      // Optimistische update: toggle lokaal zonder reload
      setDeloadWeeks(prev =>
        prev.includes(weekStart)
          ? prev.filter(ws => ws !== weekStart)
          : [...prev, weekStart].sort()
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setTogglingWeek(null)
    }
  }

  async function handleDeletePlanned(id) {
    const { error } = await supabase.from('planned_workouts').delete().eq('id', id)
    if (error) { setError(error.message); return }
    setPlannedPopup(null)
    load()
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
      {/* Header: maand + navigatie */}
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

      {/* Kalender grid */}
      <div className="flex flex-col gap-1">

        {/* Weekdag-kopregel (met spatiëring voor de toggle-kolom) */}
        <div className="flex items-center gap-1">
          <div style={{ width: 30, flexShrink: 0 }} />
          {WEEKDAY_LABELS.map((d) => (
            <div
              key={d}
              className="flex-1 text-center text-xs text-[var(--color-text-secondary)] font-[var(--font-mono)] pb-1"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Week-rijen */}
        {!dayMap ? (
          <div className="text-center text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm py-plate-5">
            Laden...
          </div>
        ) : weeks.map((week, wi) => {
          const weekStart = getWeekStartForRow(week)
          const isDeload = weekStart ? deloadSet.has(weekStart) : false

          return (
            <div key={wi} className="flex items-stretch gap-1">
              {/* Deload toggle knop */}
              <WeekToggle
                weekStart={weekStart}
                isDeload={isDeload}
                isLoading={togglingWeek === weekStart}
                onToggle={() => weekStart && handleToggleDeload(weekStart)}
              />

              {/* 7 dagcellen */}
              {week.map((dateStr, di) => (
                <div key={di} className="flex-1 min-w-0">
                  <DayCell
                    dateStr={dateStr}
                    isToday={dateStr === today}
                    info={dateStr ? dayMap.get(dateStr) : null}
                    maxVolume={maxVolume}
                    isDeload={isDeload}
                    onPlanClick={() => dateStr && setPlanDialogDate(dateStr)}
                    onDoneClick={(info) => setAnalysisPreview({ ...info, date: dateStr })}
                    onPlannedClick={(info) => setPlannedPopup({ ...info, date: dateStr })}
                  />
                </div>
              ))}
            </div>
          )
        })}
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

      {plannedPopup && (
        <PlannedWorkoutPopup
          info={plannedPopup}
          onClose={() => setPlannedPopup(null)}
          onDelete={handleDeletePlanned}
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

// ─── Deload toggle knop ────────────────────────────────────────────────────────

function WeekToggle({ weekStart, isDeload, isLoading, onToggle }) {
  if (!weekStart) {
    return <div style={{ width: 30, flexShrink: 0 }} />
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isLoading}
      title={isDeload ? 'Deload week — tik om te verwijderen' : 'Markeer als deload week'}
      className="flex items-center justify-center rounded-lg transition-all"
      style={{
        width: 30,
        flexShrink: 0,
        alignSelf: 'stretch',
        minHeight: 44,
        background: isDeload ? 'rgba(217,164,65,0.15)' : 'var(--color-card)',
        border: `1px solid ${isDeload ? 'rgba(217,164,65,0.45)' : 'var(--color-border)'}`,
        color: isDeload ? '#D9A441' : 'var(--color-text-secondary)',
        opacity: isLoading ? 0.5 : isDeload ? 1 : 0.55,
        cursor: isLoading ? 'wait' : 'pointer',
      }}
    >
      <i
        className={`ti ti-${isDeload ? 'moon-stars' : 'moon'}`}
        style={{ fontSize: 12, display: 'block' }}
        aria-hidden="true"
      />
    </button>
  )
}

// ─── Dagcel ───────────────────────────────────────────────────────────────────

function DayCell({ dateStr, isToday, info, maxVolume, isDeload, onPlanClick, onDoneClick, onPlannedClick }) {
  if (!dateStr) {
    return <div className="aspect-square" />
  }

  const dayNum = Number(dateStr.slice(8, 10))
  const isRestDay = !info
  const isDone = info?.type === 'done'
  const isClickable = isRestDay || isDone || (info?.type === 'planned' && info.status === 'planned')

  // Achtergrond: deload geeft amber-tint bovenop de normale kleur
  let bgStyle = {}
  if (isDeload) {
    if (info?.type === 'done') bgStyle = { background: 'rgba(217,164,65,0.13)' }
    else if (info?.type === 'planned' && info.status === 'planned') bgStyle = { background: 'rgba(249,115,22,0.09)' }
    else if (info?.type === 'planned' && info.status === 'missed') bgStyle = { background: 'rgba(217,164,65,0.09)' }
    else bgStyle = { background: 'rgba(217,164,65,0.07)' }
  } else {
    if (info?.type === 'done') bgStyle = { background: 'rgba(34,197,94,0.08)' }
    else if (info?.type === 'planned' && info.status === 'planned') bgStyle = { background: 'rgba(249,115,22,0.10)' }
    else if (info?.type === 'planned' && info.status === 'missed') bgStyle = { background: 'rgba(255,75,62,0.08)' }
    else if (info?.type === 'planned' && info.status === 'skipped') bgStyle = { background: 'var(--color-card)', opacity: 0.5 }
    else bgStyle = { background: 'var(--color-card)' }
  }

  const loadPct = isDone && maxVolume > 0
    ? Math.max(8, Math.round((info.volumeKg / maxVolume) * 100))
    : 0

  function handleClick() {
    if (isDone) onDoneClick(info)
    else if (info?.type === 'planned' && info.status === 'planned') onPlannedClick(info)
    else if (isRestDay) onPlanClick()
  }

  return (
    <button
      type="button"
      onClick={isClickable ? handleClick : undefined}
      className={`aspect-square rounded-lg flex flex-col text-left relative overflow-hidden transition-colors w-full ${
        isToday ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg)]' : ''
      } ${isClickable ? 'cursor-pointer hover:brightness-125' : ''}`}
      style={bgStyle}
    >
      {/* Loaded bar bovenaan bij uitgevoerde sessie */}
      {isDone && (
        <div
          className="loaded-bar"
          style={{
            '--load-pct': `${loadPct}%`,
            background: isDeload ? 'rgba(217,164,65,0.6)' : undefined,
          }}
        />
      )}

      <div className="p-plate-1 flex-1 flex flex-col">
        <span className={`text-xs font-[var(--font-mono)] ${isToday ? 'text-[var(--color-accent)] font-bold' : isDeload ? '' : 'text-[var(--color-text-secondary)]'}`}
          style={isDeload && !isToday ? { color: '#D9A441aa' } : {}}>
          {dayNum}
        </span>

        {isDone && (
          <div className="flex-1 flex flex-col justify-end gap-0.5">
            <span className="text-[10px] leading-tight font-[var(--font-body)] text-[var(--color-text-primary)] truncate">
              {info.title}
            </span>
            <span className="text-[9px] leading-tight font-[var(--font-mono)] text-[var(--color-text-secondary)] tabular-data">
              {info.volumeKg} kg
            </span>
            {info.avgRpe != null && (
              <span
                className="text-[9px] leading-tight font-[var(--font-mono)] tabular-data"
                style={{
                  color: info.avgRpe >= 9 ? 'var(--color-status-high)'
                    : info.avgRpe >= 8 ? 'var(--color-status-low)'
                    : '#3E7CB1',
                }}
              >
                RPE {info.avgRpe}
              </span>
            )}
          </div>
        )}

        {info?.type === 'planned' && (
          <div className="flex-1 flex flex-col justify-end gap-0.5">
            <span className={`text-[10px] leading-tight font-[var(--font-body)] truncate ${
              info.status === 'skipped' ? 'text-[var(--color-text-secondary)] line-through'
              : info.status === 'missed' ? 'text-[var(--color-status-high)]'
              : isDeload ? '' : ''
            }`}
            style={
              isDeload && info.status !== 'skipped' && info.status !== 'missed' ? { color: '#D9A441' }
              : info.status !== 'skipped' && info.status !== 'missed' ? { color: '#F97316' }
              : {}
            }>
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
            {isDeload ? (
              <i className="ti ti-moon" style={{ fontSize: 10, color: 'rgba(217,164,65,0.35)' }} aria-hidden="true" />
            ) : (
              <span className="text-[9px] font-[var(--font-mono)] text-[var(--color-text-secondary)] opacity-40">
                rust
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Legenda ──────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { color: 'bg-[var(--color-status-ok)]/30', label: 'Uitgevoerd' },
    { color: '', label: 'Gepland', bgHex: 'rgba(249,115,22,0.30)' },
    { color: 'bg-[var(--color-status-high)]/30', label: 'Gemist' },
    { color: 'bg-[var(--color-card)] opacity-50', label: 'Overgeslagen' },
    { color: 'bg-[var(--color-card)]', label: 'Rustdag' },
    { isDeload: true, label: 'Deload week' },
  ]
  return (
    <div className="flex flex-wrap gap-plate-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-plate-1">
          {it.isDeload ? (
            <span className="w-3 h-3 rounded flex items-center justify-center"
              style={{ background: 'rgba(217,164,65,0.2)', border: '1px solid rgba(217,164,65,0.4)' }}>
              <i className="ti ti-moon-stars" style={{ fontSize: 7, color: '#D9A441' }} />
            </span>
          ) : it.bgHex ? (
            <span className="w-3 h-3 rounded" style={{ background: it.bgHex }} />
          ) : (
            <span className={`w-3 h-3 rounded ${it.color}`} />
          )}
          <span className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Analyse preview popup ────────────────────────────────────────────────────

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
            {info.date} · {info.setCount} sets · {info.volumeKg} kg{info.avgRpe != null ? ` · RPE ${info.avgRpe}` : ''}
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

// ─── Geplande workout popup ───────────────────────────────────────────────────

function PlannedWorkoutPopup({ info, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await onDelete(info.id)
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface rounded-2xl p-plate-4 flex flex-col gap-plate-3 w-full max-w-sm"
      >
        <div style={{ borderLeft: '3px solid #F97316', paddingLeft: 10 }}>
          <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)]">
            {info.title}
          </h3>
          <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
            {info.date} · gepland
          </p>
        </div>

        {info.notes && (
          <p className="font-[var(--font-body)] text-sm text-[var(--color-text-secondary)]">
            {info.notes}
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
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="px-plate-3 py-plate-2 rounded-lg text-sm font-[var(--font-body)] font-medium disabled:opacity-40"
            style={{ background: 'var(--color-status-high)', color: '#fff' }}
          >
            {deleting ? 'Bezig...' : 'Verwijderen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Plan sessie dialog ───────────────────────────────────────────────────────

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

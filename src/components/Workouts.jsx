// src/components/Workouts.jsx
// Gecombineerde Agenda + Sessies tab. Links: compacte maandkalender met
// volume-bars en planning. Rechts: workout cards gesorteerd op datum,
// gegroepeerd op Push/Pull/Legs/Upper split met kleurcodes.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMonthWorkoutsData, fetchMoreWorkouts, fetchPreviousSessionComparison } from '../lib/workoutsData'
import { getTodayStr } from '../lib/calendarData'
import { fetchDeloadWeeks, toggleDeloadWeek } from '../lib/deloadData'
import { getWeekStart } from '../lib/dashboardQueries'

// ─── Split kleurensysteem ─────────────────────────────────────────────────────

const SPLIT_STYLES = {
  Push:  { color: '#F97316', bg: 'rgba(249,115,22,0.12)'  },
  Pull:  { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  },
  Legs:  { color: '#10B981', bg: 'rgba(16,185,129,0.12)'  },
  Upper: { color: '#A855F7', bg: 'rgba(168,85,247,0.12)'  },
}

function getSplitStyle(title) {
  const t = (title ?? '').toLowerCase()
  if (t.includes('push'))  return SPLIT_STYLES.Push
  if (t.includes('pull'))  return SPLIT_STYLES.Pull
  if (t.includes('leg'))   return SPLIT_STYLES.Legs
  if (t.includes('upper')) return SPLIT_STYLES.Upper
  return null
}

function getSplitLabel(title) {
  const t = (title ?? '').toLowerCase()
  if (t.includes('push'))  return 'Push'
  if (t.includes('pull'))  return 'Pull'
  if (t.includes('leg'))   return 'Legs'
  if (t.includes('upper')) return 'Upper'
  return null
}

// ─── Kalender helpers ─────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const MONTH_LABELS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]
const ROUTINE_TITLES = ['Push', 'Pull', 'Legs', 'Upper']

function getWeekStartForRow(week) {
  const first = week.find(d => d !== null)
  if (!first) return null
  return getWeekStart(first)
}

function buildCalendarGrid(year, month) {
  const firstOfMonth = new Date(year, month - 1, 1)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatDuration(minutes) {
  if (minutes == null || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}u ${m}m`
  if (h > 0) return `${h}u`
  return `${m}m`
}

function formatVolume(kg) {
  if (kg == null) return '—'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace('.', ',')}k kg`
  return `${kg} kg`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────

export default function Workouts() {
  const today = getTodayStr()
  const [year, setYear]   = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)))
  const [data, setData]   = useState(null)
  const [allWorkouts, setAllWorkouts] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [planDialogDate, setPlanDialogDate] = useState(null)
  const [highlightedId, setHighlightedId]   = useState(null)
  const [deloadWeeks, setDeloadWeeks]       = useState([])
  const [togglingWeek, setTogglingWeek]     = useState(null)
  const cardRefs = useRef({})

  const deloadSet = useMemo(() => new Set(deloadWeeks), [deloadWeeks])
  const weeks = useMemo(() => buildCalendarGrid(year, month), [year, month])

  const maxByType = useMemo(() => {
    const map = new Map()
    for (const w of allWorkouts) {
      const label = getSplitLabel(w.title)
      if (!label) continue
      map.set(label, Math.max(map.get(label) ?? 0, w.totalVolume))
    }
    return map
  }, [allWorkouts])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [result, dlWeeks] = await Promise.all([
        fetchMonthWorkoutsData(year, month),
        fetchDeloadWeeks(),
      ])
      setData(result)
      setAllWorkouts(result.workouts)
      setHasMore(result.hasMore)
      setDeloadWeeks(dlWeeks)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLoadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const more = await fetchMoreWorkouts(year, month, allWorkouts.length)
      setAllWorkouts((prev) => [...prev, ...more.workouts])
      setHasMore(more.hasMore)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleToggleDeload(weekStart) {
    if (!weekStart || togglingWeek) return
    setTogglingWeek(weekStart)
    try {
      const nowDeload = await toggleDeloadWeek(weekStart)
      setDeloadWeeks(prev =>
        nowDeload
          ? [...prev, weekStart].sort()
          : prev.filter(w => w !== weekStart)
      )
    } finally {
      setTogglingWeek(null)
    }
  }

  async function handleSkip(plannedId) {
    if (!plannedId) return
    const { error: updateError } = await supabase
      .from('planned_workouts')
      .update({ status: 'skipped' })
      .eq('id', plannedId)
    if (updateError) { setError(updateError.message); return }
    load()
  }

  useEffect(() => { load() }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  function goToPrev() {
    if (month === 1) { setYear(year - 1); setMonth(12) } else setMonth(month - 1)
  }
  function goToNext() {
    if (month === 12) { setYear(year + 1); setMonth(1) } else setMonth(month + 1)
  }

  function handleCalendarDoneClick(workoutId) {
    setHighlightedId(workoutId)
    setTimeout(() => {
      cardRefs.current[workoutId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    setTimeout(() => setHighlightedId(null), 2000)
  }

  async function handlePlanSubmit(title, notes) {
    const { error: upsertError } = await supabase
      .from('planned_workouts')
      .upsert(
        { planned_date: planDialogDate, title, notes: notes || null, status: 'planned' },
        { onConflict: 'planned_date,title' }
      )
    if (upsertError) { setError(upsertError.message); return }

    // Navigate to the month of the planned date if different from current view
    const plannedDate = new Date(planDialogDate + 'T12:00:00')
    const plannedYear = plannedDate.getFullYear()
    const plannedMonth = plannedDate.getMonth() + 1
    setPlanDialogDate(null)
    if (plannedYear !== year || plannedMonth !== month) {
      setYear(plannedYear)
      setMonth(plannedMonth)
    } else {
      load()
    }
  }

  if (error) {
    return (
      <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">
        Fout: {error}
      </p>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-plate-3 py-plate-3 sm:px-plate-4 sm:py-plate-4 flex flex-col md:flex-row gap-plate-4 sm:gap-plate-6 items-start">

      {/* ── Linkerkolom: kalender ─────────────────────────── */}
      <div className="w-full md:w-72 flex-shrink-0 flex flex-col gap-plate-3">

        {/* Maand navigatie */}
        <div className="flex items-center justify-between">
          <h2 className="font-[var(--font-display)] font-semibold text-base text-[var(--color-text-primary)] tracking-tight capitalize">
            {MONTH_LABELS[month - 1]} {year}
          </h2>
          <div className="flex gap-plate-1">
            <button
              onClick={goToPrev}
              className="px-plate-2 py-plate-1 rounded-lg text-sm bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >←</button>
            <button
              onClick={goToNext}
              className="px-plate-2 py-plate-1 rounded-lg text-sm bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >→</button>
          </div>
        </div>

        {/* Kalender grid */}
        <div className="flex flex-col gap-0.5">
          <div className="grid gap-0.5" style={{ gridTemplateColumns: '22px repeat(7, 1fr)' }}>
            <div />
            {WEEKDAY_LABELS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] text-[var(--color-text-secondary)] font-[var(--font-mono)] pb-0.5"
              >
                {d}
              </div>
            ))}
          </div>

          {loading
            ? (
              <div className="text-center text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm py-plate-5">
                Laden...
              </div>
            )
            : weeks.map((week, wi) => {
                const weekStart = getWeekStartForRow(week)
                const isDeload  = weekStart ? deloadSet.has(weekStart) : false
                return (
                  <div key={wi} className="grid gap-0.5" style={{ gridTemplateColumns: '22px repeat(7, 1fr)' }}>
                    <WeekToggleBtn
                      weekStart={weekStart}
                      isDeload={isDeload}
                      toggling={togglingWeek === weekStart}
                      onToggle={handleToggleDeload}
                    />
                    {week.map((dateStr, di) => (
                      <CompactDayCell
                        key={di}
                        dateStr={dateStr}
                        isToday={dateStr === today}
                        info={dateStr ? data?.dayMap?.get(dateStr) : null}
                        maxVolume={data?.maxVolume ?? 0}
                        isDeload={isDeload}
                        onPlanClick={() => setPlanDialogDate(dateStr)}
                        onDoneClick={handleCalendarDoneClick}
                        onSkip={handleSkip}
                      />
                    ))}
                  </div>
                )
              })
          }
        </div>

        {/* Split-legenda */}
        <div className="flex flex-col gap-plate-2">
          <div className="flex flex-wrap gap-x-plate-3 gap-y-1">
            {Object.entries(SPLIT_STYLES).map(([label, style]) => (
              <div key={label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: style.color }} />
                <span className="text-[10px] text-[var(--color-text-secondary)] font-[var(--font-body)]">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-plate-3 gap-y-1">
            {[
              { color: 'bg-[var(--color-data)]/30',                  label: 'Gepland'      },
              { color: 'bg-[var(--color-status-high)]/30',            label: 'Gemist'       },
              { color: 'bg-[var(--color-text-secondary)]/20',         label: 'Overgeslagen' },
            ].map((it) => (
              <div key={it.label} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-sm ${it.color}`} />
                <span className="text-[10px] text-[var(--color-text-secondary)] font-[var(--font-body)]">{it.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <span className="text-[10px]">🌙</span>
              <span className="text-[10px] text-[var(--color-text-secondary)] font-[var(--font-body)]">Deload</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Rechterkolom: workout feed ────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-plate-3">
        <div className="flex items-baseline gap-plate-2">
          <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
            Workouts
          </h2>
          <span className="text-sm font-[var(--font-mono)] text-[var(--color-text-secondary)] capitalize">
            {MONTH_LABELS[month - 1]} {year}
          </span>
        </div>

        {loading && (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
        )}

        {!loading && !allWorkouts.length && (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
            Geen workouts gevonden voor {MONTH_LABELS[month - 1]} {year}.
          </p>
        )}

        {!loading && allWorkouts.map((workout) => (
          <div key={workout.id} ref={(el) => { cardRefs.current[workout.id] = el }}>
            <WorkoutCard
              workout={workout}
              highlighted={highlightedId === workout.id}
              maxByType={maxByType}
            />
          </div>
        ))}

        {hasMore && !loading && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="self-center px-plate-4 py-plate-2 rounded-lg text-sm font-[var(--font-body)] bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40"
          >
            {loadingMore ? 'Laden...' : 'Meer laden'}
          </button>
        )}
      </div>

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

// ─── WeekToggleBtn ────────────────────────────────────────────────────────────

function WeekToggleBtn({ weekStart, isDeload, toggling, onToggle }) {
  if (!weekStart) return <div />
  return (
    <button
      type="button"
      title={isDeload ? 'Deload week — klik om te verwijderen' : 'Markeer als deload week'}
      onClick={() => onToggle(weekStart)}
      disabled={toggling}
      style={{ minHeight: 44 }}
      className={`flex items-center justify-center rounded-md text-sm transition-all disabled:opacity-40 ${
        isDeload
          ? 'bg-[rgba(217,164,65,0.25)] text-[#D9A441]'
          : 'bg-[var(--color-card)] text-[var(--color-text-secondary)] opacity-40 hover:opacity-100 hover:bg-[rgba(217,164,65,0.15)] hover:text-[#D9A441]'
      }`}
    >
      🌙
    </button>
  )
}

// ─── CompactDayCell ───────────────────────────────────────────────────────────

function CompactDayCell({ dateStr, isToday, info, maxVolume, isDeload, onPlanClick, onDoneClick, onSkip }) {
  const [showSkipMenu, setShowSkipMenu] = useState(false)

  if (!dateStr) return <div className="aspect-square" />

  const dayNum = Number(dateStr.slice(8, 10))
  const isDone = info?.type === 'done'
  const isPlanned = info?.type === 'planned'
  const isMissed = isPlanned && info.status === 'missed'
  const isSkipped = isPlanned && info.status === 'skipped'
  const isClickable = !info || isDone || (isPlanned && info.status === 'planned') || isMissed

  let bgClass = isDeload ? 'bg-[rgba(217,164,65,0.08)]' : 'bg-[var(--color-card)]'
  if (isDone)                                bgClass = isDeload ? 'bg-[rgba(217,164,65,0.15)]' : 'bg-[var(--color-status-ok)]/[0.08]'
  else if (isPlanned && info.status === 'planned') bgClass = 'bg-[var(--color-data)]/[0.08]'
  else if (isMissed)                         bgClass = 'bg-[var(--color-status-high)]/[0.08]'
  else if (isSkipped)                        bgClass = 'bg-[var(--color-text-secondary)]/[0.08] opacity-50'

  const splitStyle = isDone ? getSplitStyle(info.title) : null
  const splitLabel = isDone ? getSplitLabel(info.title) : null
  const loadPct = isDone && maxVolume > 0
    ? Math.max(8, Math.round((info.volumeKg / maxVolume) * 100))
    : 0

  function handleClick() {
    if (isDone) { onDoneClick(info.workoutId); return }
    if (isMissed) { setShowSkipMenu((v) => !v); return }
    if (isClickable) onPlanClick()
  }

  return (
    <button
      type="button"
      onClick={isClickable ? handleClick : undefined}
      className={`aspect-square rounded-md flex flex-col text-left relative overflow-hidden transition-all ${bgClass} ${
        isToday ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg)]' : ''
      } ${isClickable ? 'cursor-pointer hover:brightness-125' : ''}`}
    >
      {/* Volume-bar bovenaan */}
      {isDone && (
        <div
          className="absolute top-0 left-0 h-0.5"
          style={{
            width: `${loadPct}%`,
            background: isDeload ? '#D9A441' : (splitStyle?.color ?? 'var(--color-status-ok)'),
          }}
        />
      )}

      <div className="p-0.5 flex-1 flex flex-col pt-1">
        <span className={`text-[9px] font-[var(--font-mono)] leading-none ${
          isToday ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-secondary)]'
        }`}>
          {dayNum}
        </span>

        {isDone && (
          <div className="flex-1 flex flex-col justify-end pb-0.5">
            {splitLabel ? (
              <span
                className="text-[8px] font-[var(--font-body)] font-semibold leading-tight"
                style={{ color: splitStyle.color }}
              >
                {splitLabel}
              </span>
            ) : (
              <span className="text-[8px] font-[var(--font-body)] text-[var(--color-text-secondary)] leading-tight truncate">
                {info.title?.slice(0, 5)}
              </span>
            )}
            <span className="text-[7px] font-[var(--font-mono)] text-[var(--color-text-secondary)] tabular-data leading-tight">
              {info.setCount}s
            </span>
          </div>
        )}

        {isPlanned && (
          <div className="flex-1 flex items-end pb-0.5">
            <span className={`text-[8px] font-[var(--font-body)] leading-tight ${
              isMissed ? 'text-[var(--color-status-high)]'
              : isSkipped ? 'text-[var(--color-text-secondary)]'
              : 'text-[var(--color-data)]'
            }`}>
              {getSplitLabel(info.title) ?? info.title?.slice(0, 4)}
            </span>
          </div>
        )}
      </div>

      {/* Skip menu overlay voor gemiste sessies */}
      {showSkipMenu && isMissed && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-md"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="text-[7px] font-[var(--font-body)] text-[var(--color-text-secondary)] bg-[var(--color-card)] rounded px-1 py-0.5 leading-tight hover:text-[var(--color-text-primary)] transition-colors"
            onClick={(e) => { e.stopPropagation(); onSkip(info.plannedId); setShowSkipMenu(false) }}
          >
            Overgeslagen
          </button>
        </div>
      )}
    </button>
  )
}

// ─── WorkoutCard ──────────────────────────────────────────────────────────────

function WorkoutCard({ workout, highlighted, maxByType }) {
  const [showExercises, setShowExercises] = useState(false)
  const [showAnalysis, setShowAnalysis]   = useState(false)
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonData, setComparisonData] = useState(undefined)
  const [loadingComparison, setLoadingComparison] = useState(false)

  const splitStyle = getSplitStyle(workout.title)
  const splitLabel = getSplitLabel(workout.title)
  const dur = formatDuration(workout.durationMin)

  const maxForType = splitLabel ? (maxByType?.get(splitLabel) ?? 0) : 0
  const volumePct = maxForType > 0
    ? Math.min(100, Math.round((workout.totalVolume / maxForType) * 100))
    : 0

  const rpeColor = workout.avgRpe == null
    ? 'var(--color-text-secondary)'
    : workout.avgRpe >= 8.5 ? '#FF4B3E'
    : workout.avgRpe >= 7.5 ? '#D9A441'
    : '#22C55E'

  async function handleComparisonToggle() {
    if (comparisonData !== undefined) {
      setShowComparison((v) => !v)
      return
    }
    setShowComparison(true)
    setLoadingComparison(true)
    try {
      const result = await fetchPreviousSessionComparison(workout.id, workout.title)
      setComparisonData(result ?? null)
    } catch {
      setComparisonData(null)
    } finally {
      setLoadingComparison(false)
    }
  }

  return (
    <div
      className={`surface rounded-xl overflow-hidden transition-all duration-500 ${
        highlighted ? 'ring-2 ring-[var(--color-accent)] shadow-[0_0_24px_-4px_rgba(255,75,62,0.4)]' : ''
      }`}
      style={splitStyle ? { borderLeft: `4px solid ${splitStyle.color}` } : {}}
    >
      {/* Volume balk per split-type */}
      {maxForType > 0 && (
        <div style={{
          height: 3,
          width: `${volumePct}%`,
          background: splitStyle?.color ?? 'var(--color-text-secondary)',
          borderRadius: '2px 2px 0 0',
          transition: 'width 0.4s ease-out',
        }} />
      )}

      <div className="p-plate-3 flex flex-col gap-plate-2">
        {/* Titel + badge + datum */}
        <div className="flex items-start gap-plate-2 flex-wrap">
          <div className="flex items-center gap-plate-2 flex-1 min-w-0">
            {splitStyle && (
              <span
                className="text-xs font-[var(--font-body)] font-semibold px-plate-2 py-0.5 rounded-full flex-shrink-0"
                style={{ color: splitStyle.color, background: splitStyle.bg }}
              >
                {splitLabel}
              </span>
            )}
            <span className="font-[var(--font-display)] font-semibold text-[var(--color-text-primary)] truncate">
              {workout.title}
            </span>
          </div>
          <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] tabular-data flex-shrink-0">
            {formatDate(workout.start_date)}{dur ? ` · ${dur}` : ''}
          </span>
        </div>

        {/* Metrics rij */}
        <div className="flex gap-plate-4 flex-wrap">
          <MetricPill label="Volume"   value={formatVolume(workout.totalVolume)} />
          <MetricPill label="Sets"     value={`${workout.totalSets}`} />
          <MetricPill label="Oef."     value={`${workout.exercises.length}`} />
          {workout.avgRpe != null && (
            <MetricPill
              label="Gem. RPE"
              value={`${workout.avgRpe}`}
              valueColor={rpeColor}
            />
          )}
        </div>

        {/* Toggle knoppen */}
        <div className="flex gap-plate-2 pt-plate-1 flex-wrap">
          <ToggleButton active={showExercises} onClick={() => setShowExercises((v) => !v)}>
            {showExercises ? '▲' : '▼'} Oefeningen
          </ToggleButton>
          {workout.hasAnalysis && (
            <ToggleButton active={showAnalysis} onClick={() => setShowAnalysis((v) => !v)}>
              {showAnalysis ? '▲' : '▼'} AI Analyse
            </ToggleButton>
          )}
          <ToggleButton active={showComparison} onClick={handleComparisonToggle}>
            {showComparison ? '▲' : '▼'} vs vorige {workout.title}
          </ToggleButton>
        </div>
      </div>

      {/* Oefeningen */}
      {showExercises && (
        <div className="border-t border-[var(--color-bg)] px-plate-3 pb-plate-3 pt-plate-2 flex flex-col gap-plate-3">
          {workout.exercises.map((ex) => (
            <ExerciseBlock key={ex.name} exercise={ex} splitStyle={splitStyle} />
          ))}
        </div>
      )}

      {/* AI analyse */}
      {showAnalysis && workout.analysis && (
        <div className="border-t border-[var(--color-bg)] px-plate-3 pb-plate-3 pt-plate-2">
          <AIAnalysisSection
            content={workout.analysis.content}
            model={workout.analysis.model}
            createdAt={workout.analysis.created_at}
          />
        </div>
      )}

      {/* Vergelijking met vorige sessie */}
      {showComparison && (
        <div className="border-t border-[var(--color-bg)] px-plate-3 pb-plate-3 pt-plate-2">
          {loadingComparison ? (
            <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-mono)]">Laden...</p>
          ) : (
            <ComparisonSection prevDate={comparisonData?.prevDate} comparison={comparisonData?.comparison} />
          )}
        </div>
      )}
    </div>
  )
}

function MetricPill({ label, value, valueColor }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-[var(--color-text-secondary)] font-[var(--font-body)] uppercase tracking-wide">
        {label}
      </span>
      <span
        className="text-sm font-[var(--font-mono)] font-semibold tabular-data"
        style={{ color: valueColor ?? 'var(--color-text-primary)' }}
      >
        {value}
      </span>
    </div>
  )
}

function ToggleButton({ active, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-plate-2 py-plate-1 rounded-lg font-[var(--font-body)] transition-colors ${
        active
          ? 'bg-[var(--color-accent)] text-white'
          : disabled
            ? 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] opacity-35 cursor-not-allowed'
            : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

// ─── ComparisonSection ────────────────────────────────────────────────────────

function ComparisonSection({ prevDate, comparison }) {
  if (!comparison) {
    return (
      <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">
        Geen vorige sessie gevonden.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-[var(--font-body)] uppercase tracking-wide text-[var(--color-text-secondary)]">
        vs {formatDate(prevDate)}
      </p>

      <div
        className="grid gap-x-2 border-b border-[var(--color-border-subtle)] pb-1 mb-0.5"
        style={{ gridTemplateColumns: '1fr 56px 72px 80px' }}
      >
        <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Oefening</span>
        <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] text-right">Δ kg</span>
        <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] text-right">Vol.</span>
        <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)] text-right">e1RM</span>
      </div>

      {Array.from(comparison.entries()).map(([name, delta]) => (
        <ExerciseComparisonRow key={name} name={name} delta={delta} />
      ))}
    </div>
  )
}

function ExerciseComparisonRow({ name, delta }) {
  const wPos = delta.deltaWeight != null && delta.deltaWeight > 0
  const wNeg = delta.deltaWeight != null && delta.deltaWeight < 0
  const vPos = delta.deltaVolume > 0
  const vNeg = delta.deltaVolume < 0
  const e1rmDelta = delta.currE1rm != null && delta.prevE1rm != null
    ? Math.round((delta.currE1rm - delta.prevE1rm) * 10) / 10
    : null

  return (
    <div
      className="grid gap-x-2 py-1.5 border-b border-[var(--color-bg)] last:border-0 items-center"
      style={{ gridTemplateColumns: '1fr 56px 72px 80px' }}
    >
      <span className="text-xs font-[var(--font-body)] text-[var(--color-text-primary)] truncate min-w-0">
        {name}
      </span>

      <span className={`text-xs font-[var(--font-mono)] tabular-data text-right ${
        delta.deltaWeight == null ? 'text-[var(--color-text-tertiary)]'
        : wPos ? 'text-[var(--color-status-ok)]'
        : wNeg ? 'text-[var(--color-status-high)]'
        : 'text-[var(--color-text-secondary)]'
      }`}>
        {delta.deltaWeight == null
          ? '—'
          : wPos ? `+${delta.deltaWeight.toFixed(1).replace('.', ',')} ↑`
          : wNeg ? `${delta.deltaWeight.toFixed(1).replace('.', ',')} ↓`
          : `= ${delta.deltaWeight.toFixed(1).replace('.', ',')}`}
      </span>

      <span className={`text-xs font-[var(--font-mono)] tabular-data text-right ${
        vPos ? 'text-[var(--color-status-ok)]'
        : vNeg ? 'text-[var(--color-status-high)]'
        : 'text-[var(--color-text-secondary)]'
      }`}>
        {vPos ? `↑ ${delta.deltaVolume}` : vNeg ? `↓ ${Math.abs(delta.deltaVolume)}` : `= 0`} kg
      </span>

      <span className="text-xs font-[var(--font-mono)] tabular-data text-right">
        {delta.currE1rm == null
          ? <span className="text-[var(--color-text-tertiary)]">—</span>
          : <>
              <span className="text-[var(--color-text-secondary)]">{delta.currE1rm}</span>
              {e1rmDelta != null && e1rmDelta !== 0 && (
                <span className={`text-[10px] ${e1rmDelta > 0 ? 'text-[var(--color-status-ok)]' : 'text-[var(--color-status-high)]'}`}>
                  {' '}{e1rmDelta > 0 ? '+' : ''}{e1rmDelta}
                </span>
              )}
            </>
        }
      </span>
    </div>
  )
}

// ─── ExerciseBlock ────────────────────────────────────────────────────────────

function ExerciseBlock({ exercise, splitStyle }) {
  const weights = exercise.sets.map((s) => s.weight_kg).filter((w) => w != null && w > 0)
  const maxWeight = weights.length > 0 ? Math.max(...weights) : null

  return (
    <div>
      <div className="flex items-center gap-plate-2 mb-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
          style={{ background: splitStyle?.color ?? 'var(--color-text-secondary)' }}
        />
        <span className="text-sm font-[var(--font-body)] font-medium text-[var(--color-text-primary)] flex-1 min-w-0 truncate">
          {exercise.name}
        </span>
        <span className="text-xs font-[var(--font-mono)] text-[var(--color-text-secondary)] tabular-data flex-shrink-0">
          {exercise.sets.length} sets{maxWeight != null ? ` · max ${maxWeight} kg` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 ml-plate-3">
        {exercise.sets.map((s, i) => (
          <SetChip key={i} set={s} />
        ))}
      </div>
    </div>
  )
}

function SetChip({ set }) {
  const label = set.weight_kg != null && set.reps != null
    ? `${set.weight_kg}×${set.reps}`
    : set.reps != null
      ? `${set.reps} reps`
      : '—'

  const rpeColor = set.rpe == null ? null
    : set.rpe >= 9 ? 'var(--color-status-high)'
    : set.rpe >= 8 ? 'var(--color-status-low)'
    : 'var(--color-text-secondary)'

  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-[var(--font-mono)] bg-[var(--color-bg)] text-[var(--color-text-primary)] tabular-data">
      {label}
      {set.rpe != null && (
        <span style={{ color: rpeColor }} className="ml-0.5 text-[9px]">({set.rpe})</span>
      )}
    </span>
  )
}

// ─── AI Analyse sectie ────────────────────────────────────────────────────────

const VERDICT_COLOR = {
  progressie:   'text-[var(--color-status-ok)]',
  stagnatie:    'text-[var(--color-status-low)]',
  achteruitgang:'text-[var(--color-status-high)]',
}

function AIAnalysisSection({ content, model, createdAt }) {
  return (
    <div className="flex flex-col gap-plate-3">

      <div>
        <SectionLabel>Samenvatting</SectionLabel>
        <p className="text-sm font-[var(--font-body)] text-[var(--color-text-primary)] leading-relaxed">
          {content.summary}
        </p>
        <p className="text-[10px] font-[var(--font-mono)] text-[var(--color-text-secondary)] mt-plate-1">
          {model} · {new Date(createdAt).toLocaleString('nl-NL')}
        </p>
      </div>

      {content.scores && Object.keys(content.scores).length > 0 && (
        <div>
          <SectionLabel>Scores</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {Object.entries(content.scores).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between bg-[var(--color-bg)] rounded px-plate-2 py-plate-1"
              >
                <span className="text-xs font-[var(--font-body)] text-[var(--color-text-secondary)] capitalize">
                  {key.replaceAll('_', ' ')}
                </span>
                <span className="text-xs font-[var(--font-mono)] font-semibold text-[var(--color-text-primary)] tabular-data">
                  {value}/10
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(content.exercises ?? []).length > 0 && (
        <div>
          <SectionLabel>Per oefening</SectionLabel>
          <ul className="flex flex-col gap-plate-2">
            {content.exercises.map((ex, i) => (
              <li key={i}>
                <div className="flex items-center gap-plate-2 flex-wrap">
                  <span className="text-sm font-[var(--font-body)] font-medium text-[var(--color-text-primary)]">
                    {ex.exercise_title}
                  </span>
                  <span className={`text-xs font-[var(--font-mono)] ${VERDICT_COLOR[ex.verdict] ?? 'text-[var(--color-text-secondary)]'}`}>
                    {ex.verdict}
                  </span>
                </div>
                <p className="text-xs font-[var(--font-body)] text-[var(--color-text-secondary)]">
                  {ex.explanation}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(content.weekly_overview ?? []).length > 0 && (
        <div>
          <SectionLabel>Weekoverzicht per spiergroep</SectionLabel>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--color-text-secondary)] font-[var(--font-body)]">
                <th className="py-0.5 font-normal">Spiergroep</th>
                <th className="py-0.5 font-normal text-right">Sets/week</th>
                <th className="py-0.5 font-normal">Trend</th>
                <th className="py-0.5 font-normal hidden sm:table-cell">Opmerking</th>
              </tr>
            </thead>
            <tbody className="font-[var(--font-body)]">
              {content.weekly_overview.map((row, i) => (
                <tr key={i} className="border-b border-[var(--color-bg)] last:border-0">
                  <td className="py-0.5 text-[var(--color-text-primary)]">{row.muscle_group}</td>
                  <td className="py-0.5 text-right font-[var(--font-mono)] tabular-data">{row.sets_per_week}</td>
                  <td className="py-0.5 text-[var(--color-text-secondary)]">{row.trend}</td>
                  <td className="py-0.5 text-[var(--color-text-secondary)] hidden sm:table-cell">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(content.recommendations ?? []).length > 0 && (
        <div>
          <SectionLabel>Aanbevelingen</SectionLabel>
          <ol className="list-decimal list-inside flex flex-col gap-0.5">
            {content.recommendations.map((rec, i) => (
              <li key={i} className="text-sm font-[var(--font-body)] text-[var(--color-text-primary)]">{rec}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-[var(--font-body)] uppercase tracking-wide text-[var(--color-text-secondary)] mb-plate-1">
      {children}
    </p>
  )
}

// ─── PlanDialog ───────────────────────────────────────────────────────────────

function PlanDialog({ date, onClose, onSubmit }) {
  const [title, setTitle] = useState(ROUTINE_TITLES[0])
  const [notes, setNotes]   = useState('')
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
          {ROUTINE_TITLES.map((r) => <option key={r} value={r}>{r}</option>)}
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

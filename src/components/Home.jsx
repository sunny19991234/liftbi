// src/components/Home.jsx
//
// Herontworpen startpagina (v2):
//
// BLOKKEN (volgorde):
// 1. Readiness hero   — score + volgende sessie + contextregels (deterministisch)
// 2. Streak + heatmap — consistentie over 10 weken
// 3. Coach-advies     — per oefening: gewicht/reps omhoog/handhaven (deterministisch)
// 4. Week vs beste    — huidige week vs all-time beste week (volume + sets)
// 5. Proactieve signalen — plateau, disbalans, nieuwe PRs samengevoegd
// 6. Dagstrip         — ±3 dagen context
// 7. Upload (klein)   — utility, onderaan, niet prominent

import { useEffect, useRef, useState } from 'react'
import {
  fetchNextPlanned,
  fetchDayStrip,
  fetchWeekVolume,
  fetchPreviousWeekVolume,
  fetchRecentWorkouts,
  fetchUpcomingPlanned,
} from '../lib/homeData'
import { getTodayStr } from '../lib/calendarData'
import { detectPlateaus } from '../lib/plateauData'
import { detectImbalances } from '../lib/imbalanceData'
import { calculateAllPRs } from '../lib/prData'
import {
  fetchCoachAdviceForType,
  calculateReadinessScore,
  calculateStreak,
  fetchBestWeekComparison,
} from '../lib/coachAdvice'
import { parseHevyCsv } from '../lib/hevyParser'
import { getToken, clearToken } from '../lib/auth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// Workout-types in volgorde van de split — voor coach-advies ophalen
const SPLIT_TITLES = ['Push', 'Pull', 'Legs', 'Upper']

function formatKg(value) {
  return value.toLocaleString('nl-NL')
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${day}-${month}-${year}`
}

// ─── Kleur-helpers ────────────────────────────────────────────────────────────

function readinessColor(score) {
  if (score >= 8) return 'var(--color-status-ok)'
  if (score >= 6) return '#3E7CB1'
  if (score >= 4) return 'var(--color-status-low)'
  return 'var(--color-status-high)'
}

function actionColor(action) {
  switch (action) {
    case 'gewicht_omhoog': return 'var(--color-status-ok)'
    case 'reps_omhoog':    return '#3E7CB1'
    case 'handhaven':      return 'var(--color-text-secondary)'
    case 'consolideren':   return 'var(--color-status-low)'
    case 'gewicht_omlaag': return 'var(--color-status-high)'
    default:               return 'var(--color-text-secondary)'
  }
}

function actionLabel(action) {
  switch (action) {
    case 'gewicht_omhoog': return '↑ gewicht'
    case 'reps_omhoog':    return '↑ reps'
    case 'handhaven':      return '= handhaven'
    case 'consolideren':   return '~ consolideer'
    case 'gewicht_omlaag': return '↓ gewicht'
    default:               return '—'
  }
}

// ─── Hoofd-component ──────────────────────────────────────────────────────────

export default function Home({ onNavigate, onTokenExpired }) {
  const [nextPlanned, setNextPlanned]         = useState(undefined)
  const [dayStrip, setDayStrip]               = useState(null)
  const [weekVolume, setWeekVolume]           = useState(null)
  const [prevWeekVolume, setPrevWeekVolume]   = useState(null)
  const [plateaus, setPlateaus]               = useState(null)
  const [imbalances, setImbalances]           = useState(null)
  const [topPRs, setTopPRs]                   = useState(null)
  const [readiness, setReadiness]             = useState(null)
  const [streak, setStreak]                   = useState(null)
  const [coachAdvice, setCoachAdvice]         = useState(null) // { workoutTitle, date, advices }
  const [bestWeek, setBestWeek]               = useState(null) // { bestWeekVolume, pct }
  const [recentWorkouts, setRecentWorkouts]   = useState(null)
  const [upcomingPlanned, setUpcomingPlanned] = useState(null)
  const [error, setError]                     = useState(null)

  const today = getTodayStr()

  function loadAll() {
    async function run() {
      // Eerst nextPlanned ophalen — nodig voor type-specifieke readiness berekening
      const next = await fetchNextPlanned()
      setNextPlanned(next)

      // Daarna alles parallel, readiness nu met het juiste workout-type
      const [strip, vol, prevVol, plateauList, imbalanceList, allPRs, readinessData, streakData, recentWos, upcomingWos] =
        await Promise.all([
          fetchDayStrip(),
          fetchWeekVolume(),
          fetchPreviousWeekVolume(),
          detectPlateaus(),
          detectImbalances(),
          calculateAllPRs(),
          calculateReadinessScore(next?.title),
          calculateStreak(3),
          fetchRecentWorkouts(5),
          fetchUpcomingPlanned(4),
        ])

      setDayStrip(strip)
      setWeekVolume(vol)
      setPrevWeekVolume(prevVol)
      setPlateaus(plateauList)
      setImbalances(imbalanceList)
      setTopPRs(rankTopPRs(allPRs, 5))
      setReadiness(readinessData)
      setStreak(streakData)
      setRecentWorkouts(recentWos)
      setUpcomingPlanned(upcomingWos)

      fetchBestWeekComparison(vol.volumeKg).then(setBestWeek).catch(() => {})
      loadCoachAdvice(next)
    }
    run().catch((err) => setError(err.message))
  }

  async function loadCoachAdvice(nextWorkout) {
    // Prioriteit: volgende geplande workout type
    const priorityTitle = nextWorkout?.title
    if (priorityTitle) {
      try {
        const advice = await fetchCoachAdviceForType(priorityTitle)
        if (advice && advice.advices.length > 0) {
          setCoachAdvice(advice)
          return
        }
      } catch (_) { /* fall through */ }
    }

    // Fallback: meest recente sessie overall
    const results = await Promise.allSettled(
      SPLIT_TITLES.map((t) => fetchCoachAdviceForType(t))
    )
    const valid = results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value)
      .filter((v) => v.advices.length > 0)

    if (valid.length === 0) return
    valid.sort((a, b) => b.date.localeCompare(a.date))
    setCoachAdvice(valid[0])
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const todayInfo    = dayStrip?.find((d) => d.isToday)?.info
  const todayIsRestDay = dayStrip && !todayInfo

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout: {error}</p>
  }

  return (
    <div className="max-w-3xl mx-auto p-plate-4 flex flex-col gap-plate-3">

      {/* 1. Readiness hero */}
      <ReadinessHero
        readiness={readiness}
        nextPlanned={nextPlanned}
        todayInfo={todayInfo}
        todayIsRestDay={todayIsRestDay}
        streak={streak}
        recentWorkouts={recentWorkouts}
        upcomingPlanned={upcomingPlanned}
        onNavigate={onNavigate}
      />

      {/* 2. Coach-advies */}
      {coachAdvice && coachAdvice.advices.length > 0 && (
        <CoachAdviceCard advice={coachAdvice} onNavigate={onNavigate} />
      )}

      {/* 3. Streak + Weekstatistieken — naast elkaar */}
      <div className="grid grid-cols-2 gap-plate-3">
        {streak !== null && <StreakCard streak={streak} />}
        <WeekComparisonCard
          weekVolume={weekVolume}
          prevWeekVolume={prevWeekVolume}
          bestWeek={bestWeek}
          onNavigate={onNavigate}
        />
      </div>

      {/* 4. Proactieve signalen */}
      <ProactiveSignals
        plateaus={plateaus}
        topPRs={topPRs}
        recentWorkouts={recentWorkouts}
        onNavigate={onNavigate}
      />

      {/* 5. Upload — klein, onderaan */}
      <UploadCard onUploaded={loadAll} onTokenExpired={onTokenExpired} />

    </div>
  )
}

// ─── Readiness hero ───────────────────────────────────────────────────────────

function ReadinessHero({ readiness, nextPlanned, todayInfo, todayIsRestDay, streak, recentWorkouts, upcomingPlanned, onNavigate }) {
  const score  = readiness?.score ?? null
  const color  = score !== null ? readinessColor(score) : '#9499A1'
  const radius = 22
  const circ   = 2 * Math.PI * radius
  const filled = score !== null ? (score / 10) * circ : 0
  const todayStr = getTodayStr()

  // Context-redenen — type-specifiek
  const reasons = []
  if (readiness) {
    const d = readiness.daysSinceLast
    const type = nextPlanned?.title ?? null
    if (d === 0) {
      reasons.push({ dot: 'warn', text: 'Vandaag al getraind' })
    } else if (d != null && d <= 4) {
      reasons.push({ dot: 'ok', text: `${d}d rust${type ? ` sinds ${type}` : ''}` })
    } else if (d != null && d <= 8) {
      reasons.push({ dot: 'ok', text: `${d} dagen rust — goed hersteld` })
    } else if (d != null) {
      reasons.push({ dot: 'info', text: `${d} dagen geleden — lang niet getraind` })
    }

    if (readiness.avgRpe <= 7.5) reasons.push({ dot: 'ok',   text: `Vorige ${type ?? 'sessie'} RPE ${readiness.avgRpe} — licht` })
    else if (readiness.avgRpe <= 8.5) reasons.push({ dot: 'info', text: `Vorige ${type ?? 'sessie'} RPE ${readiness.avgRpe}` })
    else reasons.push({ dot: 'warn', text: `Vorige ${type ?? 'sessie'} RPE ${readiness.avgRpe} — zwaar` })
  }

  const isLoading = score === null && nextPlanned === undefined

  // Bepaal titel en label
  let heroTitle = '—'
  let heroLabel = 'Volgende sessie'
  if (todayInfo?.type === 'done') {
    heroTitle = todayInfo.title
    heroLabel = 'Vandaag voltooid'
  } else if (nextPlanned) {
    heroTitle = nextPlanned.title
    heroLabel = nextPlanned.planned_date === todayStr ? 'Vandaag gepland' : 'Volgende sessie'
  } else if (todayIsRestDay) {
    heroTitle = 'Rustdag'
    heroLabel = 'Vandaag'
  }

  // Mesocyclus strip — max 7d terug, 4d vooruit
  const todayDate = new Date(todayStr + 'T00:00:00Z')
  const mesoItems = []
  if (recentWorkouts) {
    for (const w of [...recentWorkouts].reverse()) {
      const d = new Date(w.start_date + 'T00:00:00Z')
      const diff = Math.round((todayDate - d) / 86400000)
      if (diff > 7) continue
      mesoItems.push({ title: w.title, diff, isPast: true, isToday: w.start_date === todayStr })
    }
  }
  // Vandaag gepland maar nog niet gedaan
  if (nextPlanned && nextPlanned.planned_date === todayStr && todayInfo?.type !== 'done') {
    mesoItems.push({ title: nextPlanned.title, diff: 0, isPast: false, isNext: true, isToday: true })
  }
  // Toekomst: max 4 dagen vooruit (alle komende geplande sessies)
  for (const p of (upcomingPlanned ?? [])) {
    if (p.planned_date <= todayStr) continue
    const d = new Date(p.planned_date + 'T00:00:00Z')
    const diff = Math.round((d - todayDate) / 86400000)
    if (diff > 4) break
    mesoItems.push({ title: p.title, diff, isPast: false, isNext: true })
  }
  const mesoWeek = Math.max(1, streak?.weeks ?? 1)

  // Dynamisch icon op basis van readiness score
  const heroIcon = score === null ? 'barbell' : score >= 8 ? 'flame' : score >= 6 ? 'bolt' : 'moon'

  return (
    <button
      onClick={() => onNavigate('agenda')}
      className="surface-hero text-left rounded-xl w-full hover:brightness-110 transition-all"
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <div className="loaded-bar" style={{ '--load-pct': score !== null ? `${score * 10}%` : '0%' }} />

      {/* Icon rechtsboven */}
      <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 10 }}>
        <i className={`ti ti-${heroIcon}`} style={{ fontSize: 18, color, opacity: 0.75 }} aria-hidden="true" />
      </div>

      <div className="flex items-center gap-3 px-plate-3 pt-plate-2 pb-2">
        {/* SVG ring */}
        <div style={{ flexShrink: 0 }}>
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="4" />
            {score !== null && (
              <circle
                cx="28" cy="28" r={radius}
                fill="none" stroke={color} strokeWidth="4"
                strokeDasharray={`${circ}`}
                strokeDashoffset={`${circ - filled}`}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
              />
            )}
            {isLoading ? (
              <text x="28" y="33" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="var(--color-text-secondary)">…</text>
            ) : (
              <>
                <text x="28" y="25" textAnchor="middle" fontFamily="Fraunces,serif" fontSize="14" fontWeight="600" fill={color}>{score}</text>
                <text x="28" y="36" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="7" fill="var(--color-text-secondary)" letterSpacing="0.05em">READY</text>
              </>
            )}
          </svg>
        </div>

        {/* Sessie-info */}
        <div className="flex-1 min-w-0 pr-6">
          <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest mb-0.5"
            style={{ color: todayInfo?.type === 'done' ? 'var(--color-status-ok)' : 'var(--color-data)' }}>
            {heroLabel}
          </p>
          <h2 className="font-[var(--font-display)] font-semibold text-xl tracking-tight leading-tight text-[var(--color-text-primary)] mb-1">
            {heroTitle}
          </h2>
          <div className="flex flex-col gap-0.5">
            {reasons.slice(0, 2).map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span style={{
                  width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                  background: r.dot === 'ok' ? 'var(--color-status-ok)' : r.dot === 'warn' ? 'var(--color-status-low)' : '#3E7CB1',
                }} />
                <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mesocyclus strip — tijdlijn met pijltjes */}
      {mesoItems.length > 0 && (
        <div className="border-t border-[var(--color-border-subtle)] px-plate-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest text-[var(--color-text-secondary)]">
              Mesocyclus — Week {mesoWeek}
            </span>
          </div>
          <div className="flex items-end overflow-x-auto gap-0" style={{ scrollbarWidth: 'none' }}>
            {mesoItems.map((item, i) => {
              const isCurrent = item.isToday || item.diff === 0
              const isNext = item.isNext && !item.isToday
              let timeLabel = ''
              if (item.diff === 0) timeLabel = 'vandaag'
              else if (item.isPast && item.diff === 1) timeLabel = 'gisteren'
              else if (item.isPast) timeLabel = `${item.diff}d`
              else if (item.diff === 1) timeLabel = 'morgen'
              else timeLabel = `+${item.diff}d`
              return (
                <div key={i} className="flex items-center flex-shrink-0">
                  {/* Verbindingslijn tussen items */}
                  {i > 0 && (
                    <div style={{
                      width: 14, height: 1,
                      background: 'var(--color-border)',
                      marginBottom: 14,
                    }} />
                  )}
                  <div className="flex flex-col items-center gap-0.5">
                    <div
                      className="font-[var(--font-mono)] text-[11px] px-2.5 py-1 rounded-lg whitespace-nowrap"
                      style={{
                        background: isCurrent
                          ? color
                          : isNext
                          ? 'var(--color-card)'
                          : 'var(--color-bg)',
                        color: isCurrent
                          ? 'var(--color-bg)'
                          : isNext
                          ? 'var(--color-data)'
                          : 'var(--color-text-secondary)',
                        fontWeight: isCurrent ? 700 : isNext ? 600 : 400,
                        border: isCurrent
                          ? 'none'
                          : isNext
                          ? '1px solid var(--color-data)'
                          : '1px solid var(--color-border)',
                        boxShadow: isCurrent ? `0 0 0 3px ${color}25` : 'none',
                      }}
                    >
                      {item.title}
                    </div>
                    <span
                      className="font-[var(--font-mono)] text-[8px]"
                      style={{ color: isCurrent ? color : 'var(--color-text-secondary)' }}
                    >
                      {timeLabel}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </button>
  )
}

// ─── Streak + heatmap ─────────────────────────────────────────────────────────

function StreakCard({ streak }) {
  const { weeks, heatmap } = streak
  // Laatste 5 weken × 7 dagen (compact voor side-by-side)
  const weeks5 = []
  for (let w = 5; w < 10; w++) {
    weeks5.push(heatmap.slice(w * 7, w * 7 + 7))
  }

  return (
    <div className="surface rounded-xl px-3 py-2 relative" style={{ position: 'relative' }}>
      {weeks >= 4 && (
        <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 14 }} title="Streak">🔥</span>
      )}
      <p className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-1.5">
        Consistentie
      </p>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="font-[var(--font-display)] font-semibold text-2xl text-[var(--color-accent)] leading-none">
          {weeks}
        </span>
        <span className="font-[var(--font-body)] text-[10px] text-[var(--color-text-secondary)]">
          {weeks === 1 ? 'week' : 'weken'} op rij
        </span>
      </div>

      {/* Heatmap: 5 weken × 7 dagen, vult de volle breedte */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
        {weeks5.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map((day, di) => (
              <div
                key={di}
                title={day.date}
                style={{
                  width: '100%', height: 11,
                  borderRadius: 2,
                  background: day.isToday ? 'var(--color-accent)'
                    : day.done ? 'rgba(34,197,94,0.7)'
                    : 'var(--color-border)',
                  boxShadow: day.isToday ? '0 0 0 1px var(--color-bg), 0 0 0 2px var(--color-accent)' : 'none',
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* X-as */}
      <div className="flex justify-between mt-1.5">
        <span className="font-[var(--font-mono)] text-[8px] text-[var(--color-text-secondary)]">4w geleden</span>
        <span className="font-[var(--font-mono)] text-[8px] text-[var(--color-text-secondary)]">vandaag</span>
      </div>
    </div>
  )
}

// ─── Coach-advies ─────────────────────────────────────────────────────────────

function CoachAdviceCard({ advice, onNavigate }) {
  const { workoutTitle, date, advices } = advice
  const actionable = advices.filter((a) => ['gewicht_omhoog', 'reps_omhoog'].includes(a.action))
  const rest       = advices.filter((a) => !['gewicht_omhoog', 'reps_omhoog'].includes(a.action))
  const allAdvices = [...actionable, ...rest]

  return (
    <div className="surface rounded-xl overflow-hidden" style={{ position: 'relative' }}>
      {/* Icon rechtsboven */}
      <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 10 }}>
        <i className="ti ti-brain" style={{ fontSize: 16, color: 'var(--color-status-ok)', opacity: 0.6 }} aria-hidden="true" />
      </div>
      <div className="p-plate-3">
        <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--color-status-ok)] mb-plate-2">
          Coach-advies · {workoutTitle} · {formatDate(date)}
        </p>
        <div className="flex flex-col">
          {allAdvices.map((a) => (
            <AdviceRow key={a.exercise_title} advice={a} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AdviceRow({ advice }) {
  const color = actionColor(advice.action)
  const label = actionLabel(advice.action)
  const { bestSet, repRange, targetWeight, targetReps, action } = advice

  let targetStr = ''
  if (action === 'gewicht_omhoog' && targetWeight) {
    targetStr = `${targetWeight} kg × ${repRange.min}–${repRange.max}`
  } else if (action === 'reps_omhoog') {
    targetStr = `${bestSet.weight_kg} kg × ${targetReps || `${repRange.min}–${repRange.max}`}`
  } else if (action === 'handhaven' || action === 'consolideren') {
    targetStr = `${bestSet.weight_kg} kg × ${repRange.min}–${repRange.max}`
  } else if (action === 'gewicht_omlaag' && targetWeight) {
    targetStr = `${targetWeight} kg × ${repRange.min}–${repRange.max}`
  }

  return (
    <div
      className="py-2.5 border-b border-[var(--color-bg)] last:border-0"
      style={{ paddingLeft: 10, borderLeft: `3px solid ${color}` }}
    >
      {/* Regel 1: badge + naam */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="font-[var(--font-mono)] text-[9px] px-1.5 py-0.5 rounded-sm"
          style={{ background: `${color}22`, color, fontWeight: 700, letterSpacing: '0.04em' }}
        >
          {label}
        </span>
        <span className="font-[var(--font-body)] text-sm font-medium text-[var(--color-text-primary)] truncate">
          {advice.exercise_title}
        </span>
      </div>

      {/* Regel 2: vorige → doel */}
      {targetStr && (
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
            {bestSet.weight_kg} kg × {bestSet.reps}{bestSet.rpe != null ? ` · RPE ${bestSet.rpe}` : ''}
          </span>
          <span className="font-[var(--font-mono)] text-[10px]" style={{ color: 'var(--color-border)' }}>→</span>
          <span className="font-[var(--font-mono)] text-[10px] font-semibold" style={{ color }}>
            {targetStr}
          </span>
        </div>
      )}

      {/* Regel 3: uitleg */}
      <p className="font-[var(--font-mono)] text-[9px]" style={{ color: `${color}99` }}>
        {advice.advice}
      </p>
    </div>
  )
}

// ─── Week vs beste week ───────────────────────────────────────────────────────

function WeekComparisonCard({ weekVolume, prevWeekVolume, bestWeek, onNavigate }) {
  const loaded = weekVolume !== null

  function delta(current, previous) {
    if (!previous || previous === 0) return null
    return Math.round(((current - previous) / previous) * 100)
  }

  const volDelta = loaded && prevWeekVolume ? delta(weekVolume.volumeKg, prevWeekVolume.volumeKg) : null

  return (
    <button
      onClick={() => onNavigate('volume')}
      className="surface text-left rounded-xl px-3 py-2 hover:brightness-110 transition-all w-full h-full"
      style={{ position: 'relative' }}
    >
      {/* Icon rechtsboven */}
      <div style={{ position: 'absolute', top: 8, right: 10 }}>
        <i className="ti ti-chart-bar" style={{ fontSize: 15, color: 'var(--color-accent)', opacity: 0.6 }} aria-hidden="true" />
      </div>

      <p className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-1.5">
        Week
      </p>

      {!weekVolume ? (
        <p className="font-[var(--font-mono)] text-sm text-[var(--color-text-secondary)]">Laden...</p>
      ) : (
        <>
          {/* Huidige week */}
          <div className="mb-0.5">
            <span className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-accent)] leading-none">
              {formatKg(weekVolume.volumeKg)}
            </span>
            <span className="font-[var(--font-body)] text-[9px] text-[var(--color-text-secondary)] ml-1">kg</span>
          </div>
          <div className="flex items-center gap-1 mb-2.5">
            {weekVolume.avgRpe != null && (
              <span className="font-[var(--font-mono)] text-[10px]" style={{ color: '#3E7CB1' }}>
                RPE {weekVolume.avgRpe}
              </span>
            )}
            <span style={{ color: 'var(--color-border)', fontSize: 9 }}>·</span>
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
              {weekVolume.setCount} sets
            </span>
          </div>

          {/* Vorige week */}
          {prevWeekVolume && (
            <div className="mb-2 pl-2" style={{ borderLeft: '2px solid var(--color-border)' }}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-[var(--font-mono)] text-[8px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  vorige
                </span>
                {volDelta !== null && <DeltaPill pct={volDelta} />}
              </div>
              <div className="font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]">
                {formatKg(prevWeekVolume.volumeKg)} kg
              </div>
              <div className="flex items-center gap-1">
                {prevWeekVolume.avgRpe != null && (
                  <span className="font-[var(--font-mono)] text-[9px]" style={{ color: '#3E7CB199' }}>
                    RPE {prevWeekVolume.avgRpe}
                  </span>
                )}
                {prevWeekVolume.setCount > 0 && (
                  <>
                    <span style={{ color: 'var(--color-border)', fontSize: 9 }}>·</span>
                    <span className="font-[var(--font-mono)] text-[9px] text-[var(--color-text-secondary)]">
                      {prevWeekVolume.setCount} sets
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* vs beste week */}
          {bestWeek && (
            <div>
              <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(bestWeek.pct, 100)}%`,
                  background: bestWeek.pct >= 90 ? 'var(--color-status-ok)'
                    : bestWeek.pct >= 70 ? 'var(--color-accent)'
                    : 'var(--color-status-low)',
                  transition: 'width 0.6s ease-out',
                }} />
              </div>
              <span className="font-[var(--font-mono)] text-[8px] text-[var(--color-text-secondary)]">
                {bestWeek.pct}% beste week
              </span>
            </div>
          )}
        </>
      )}
    </button>
  )
}


function DeltaPill({ pct }) {
  const isUp   = pct > 0
  const isFlat = pct === 0
  const colorVar = isFlat ? 'var(--color-text-tertiary)'
    : isUp ? 'var(--color-status-ok)' : 'var(--color-status-high)'
  const bg = isFlat ? 'transparent'
    : isUp ? 'rgba(34,197,94,0.1)' : 'rgba(255,75,62,0.1)'
  const arrow = isFlat ? '→' : isUp ? '↑' : '↓'

  return (
    <span className="font-[var(--font-mono)] text-[10px] font-medium px-1.5 py-0.5 rounded-full"
      style={{ color: colorVar, background: bg, border: `1px solid ${colorVar}20` }}>
      {arrow} {Math.abs(pct)}%
    </span>
  )
}

// ─── Proactieve signalen (samengevoegd) ───────────────────────────────────────

function ProactiveSignals({ plateaus, topPRs, recentWorkouts, onNavigate }) {
  const hasData = (plateaus || topPRs) !== null

  // PRs gefilterd op de laatste 4 workouts
  const last4Dates = new Set((recentWorkouts ?? []).slice(0, 4).map((w) => w.start_date))
  const recentPRs = topPRs
    ? topPRs.filter((pr) => pr.oneRepMax?.date && last4Dates.has(pr.oneRepMax.date))
    : []

  const signalCount = (plateaus?.length ?? 0) + recentPRs.length

  if (!hasData || signalCount === 0) return null

  return (
    <div className="surface rounded-xl p-plate-3" style={{ position: 'relative' }}>
      {/* Header met icon */}
      <div className="flex items-center justify-between mb-plate-2">
        <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--color-text-secondary)]">
          Signalen
        </p>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'rgba(217,164,65,0.12)',
          color: '#D9A441',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="ti ti-bell-ringing" style={{ fontSize: 13 }} aria-hidden="true" />
        </div>
      </div>

      <div className="flex flex-col">

        {/* Plateaus */}
        {plateaus && plateaus.slice(0, 2).map((p) => (
          <button
            key={p.exercise_title}
            onClick={() => onNavigate('rpe')}
            className="flex items-center justify-between py-plate-2 border-b border-[var(--color-bg)] last:border-0 hover:brightness-110 text-left w-full"
          >
            <div className="flex items-center gap-plate-2">
              <SignalIcon type="warn" icon="trending-down" />
              <div>
                <p className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)]">{p.exercise_title}</p>
                <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
                  e1RM {p.sessions.map((s) => `${s.e1rm}kg`).join(' → ')} · RPE {p.rpeTrend}
                </p>
              </div>
            </div>
            <SignalBadge label="Plateau" color="warn" />
          </button>
        ))}

        {/* PRs — feestelijk en prominent */}
        {recentPRs.slice(0, 3).map((pr) => (
          <button
            key={pr.exercise_title}
            onClick={() => onNavigate('prs')}
            className="flex items-center justify-between py-plate-2 border-b border-[var(--color-bg)] last:border-0 hover:brightness-110 text-left w-full"
          >
            <div className="flex items-center gap-plate-2">
              {/* Gouden trophy */}
              <div style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(255,196,0,0.18), rgba(255,140,0,0.12))',
                border: '1px solid rgba(255,184,0,0.28)',
                color: '#FFB800',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className="ti ti-trophy" style={{ fontSize: 16 }} aria-hidden="true" />
              </div>
              <div>
                <p className="font-[var(--font-body)] text-sm font-semibold text-[var(--color-text-primary)]">
                  {pr.exercise_title}
                </p>
                <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
                  e1RM{' '}
                  <span style={{ color: '#FFB800', fontWeight: 700 }}>
                    {formatKg(pr.oneRepMax.value)} kg
                  </span>
                  {' · '}
                  {pr.oneRepMax.weight_kg} kg × {pr.oneRepMax.reps} reps
                </p>
              </div>
            </div>
            <span style={{
              background: 'linear-gradient(135deg, #FFB800, #FF8C00)',
              color: 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              padding: '3px 7px',
              borderRadius: 4,
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}>
              PR ✦
            </span>
          </button>
        ))}

      </div>
    </div>
  )
}

function SignalIcon({ type, icon }) {
  const bg = type === 'ok' ? 'rgba(34,197,94,0.1)'
    : type === 'warn' ? 'rgba(217,164,65,0.1)'
    : 'rgba(255,75,62,0.1)'
  const color = type === 'ok' ? 'var(--color-status-ok)'
    : type === 'warn' ? 'var(--color-status-low)'
    : 'var(--color-status-high)'
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8, background: bg, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <i className={`ti ti-${icon}`} style={{ fontSize: 14 }} aria-hidden="true" />
    </div>
  )
}

function SignalBadge({ label, color }) {
  const c = color === 'ok' ? 'var(--color-status-ok)'
    : color === 'warn' ? 'var(--color-status-low)'
    : 'var(--color-status-high)'
  return (
    <span className="font-[var(--font-mono)] text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ background: `${c}18`, color: c }}>
      {label}
    </span>
  )
}

// ─── Top PRs ──────────────────────────────────────────────────────────────────

function rankTopPRs(allPRs, n) {
  return allPRs
    .filter((pr) => pr.oneRepMax !== null)
    .sort((a, b) => b.oneRepMax.value - a.oneRepMax.value)
    .slice(0, n)
}


// ─── Upload (klein, onderaan) ─────────────────────────────────────────────────

function UploadCard({ onUploaded, onTokenExpired }) {
  const fileInputRef = useRef(null)
  const [status, setStatus]   = useState('idle')
  const [error, setError]     = useState(null)
  const [result, setResult]   = useState(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setResult(null)
    setStatus('parsing')

    let sessions
    try {
      const text = await file.text()
      sessions = parseHevyCsv(text).sessions
    } catch (err) {
      setError(`Parsefout: ${err.message}`)
      setStatus('error')
      return
    }

    setStatus('uploading')
    try {
      const token = getToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessions }),
      })

      if (res.status === 401) { clearToken(); onTokenExpired?.(); return }
      if (!res.ok) throw new Error(`Server ${res.status}: ${await res.text()}`)

      const data = await res.json()
      setResult(data)
      setStatus('done')
      onUploaded?.()
    } catch (err) {
      setError(`Uploadfout: ${err.message}`)
      setStatus('error')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const busy = status === 'parsing' || status === 'uploading'

  return (
    <div className="flex flex-col gap-1">
      {/* Kleine neutrale knop */}
      <div className="flex items-center gap-plate-2">
        <label className={`flex items-center gap-1.5 px-plate-2 py-1 rounded-lg text-xs font-[var(--font-body)] border border-[var(--color-border-subtle)] cursor-pointer transition-colors ${
          busy
            ? 'text-[var(--color-text-secondary)] cursor-wait'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
        }`}>
          <i className="ti ti-upload" style={{ fontSize: 13 }} aria-hidden="true" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={busy}
            className="hidden"
          />
          {busy
            ? status === 'parsing' ? 'Parsen...' : 'Uploaden...'
            : 'Hevy CSV importeren'}
        </label>

        {result && !error && (
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-status-ok)]">
            {result.created} nieuw · {result.updated} bijgewerkt
          </span>
        )}
        {error && (
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-status-high)]">{error}</span>
        )}
      </div>
    </div>
  )
}

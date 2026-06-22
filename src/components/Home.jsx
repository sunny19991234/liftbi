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

const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
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
  const [error, setError]                     = useState(null)

  const today = getTodayStr()

  function loadAll() {
    // Basis-data parallel laden
    Promise.all([
      fetchNextPlanned(),
      fetchDayStrip(),
      fetchWeekVolume(),
      fetchPreviousWeekVolume(),
      detectPlateaus(),
      detectImbalances(),
      calculateAllPRs(),
      calculateReadinessScore(),
      calculateStreak(3),
    ])
      .then(([next, strip, vol, prevVol, plateauList, imbalanceList, allPRs, readinessData, streakData]) => {
        setNextPlanned(next)
        setDayStrip(strip)
        setWeekVolume(vol)
        setPrevWeekVolume(prevVol)
        setPlateaus(plateauList)
        setImbalances(imbalanceList)
        setTopPRs(rankTopPRs(allPRs, 5))
        setReadiness(readinessData)
        setStreak(streakData)

        // Beste-week vergelijking hangt af van weekvolume
        fetchBestWeekComparison(vol.volumeKg)
          .then(setBestWeek)
          .catch(() => {}) // niet-kritiek

        // Coach-advies: laad voor de meest recente sessie ongeacht type
        loadCoachAdvice()
      })
      .catch((err) => setError(err.message))
  }

  async function loadCoachAdvice() {
    // Probeer elk split-type totdat we één vinden met data
    for (const title of SPLIT_TITLES) {
      try {
        const advice = await fetchCoachAdviceForType(title)
        if (advice && advice.advices.length > 0) {
          // Maar we willen de MEEST RECENTE sessie overall, niet per type.
          // Dus we halen alle types op en pakken degene met de recentste datum.
          break
        }
      } catch (_) { /* continue */ }
    }

    // Haal voor alle split-types op en geef de meest recente
    const results = await Promise.allSettled(
      SPLIT_TITLES.map((t) => fetchCoachAdviceForType(t))
    )
    const valid = results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value)
      .filter((v) => v.advices.length > 0)

    if (valid.length === 0) return

    // Meest recente op basis van datum
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
        imbalances={imbalances}
        onNavigate={onNavigate}
      />

      {/* 2. Streak + heatmap */}
      {streak !== null && (
        <StreakCard streak={streak} />
      )}

      {/* 3. Coach-advies */}
      {coachAdvice && coachAdvice.advices.length > 0 && (
        <CoachAdviceCard advice={coachAdvice} onNavigate={onNavigate} />
      )}

      {/* 4. Week vs beste week */}
      <WeekComparisonCard
        weekVolume={weekVolume}
        prevWeekVolume={prevWeekVolume}
        bestWeek={bestWeek}
        onNavigate={onNavigate}
      />

      {/* 5. Proactieve signalen */}
      <ProactiveSignals
        plateaus={plateaus}
        imbalances={imbalances}
        topPRs={topPRs}
        onNavigate={onNavigate}
      />

      {/* 6. Dagstrip */}
      <div className="surface rounded-xl p-plate-3">
        <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm mb-plate-2">
          Recent &amp; aankomend
        </p>
        {!dayStrip ? (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
        ) : (
          <DayStrip days={dayStrip} onNavigate={onNavigate} />
        )}
      </div>

      {/* 7. Upload — klein, onderaan */}
      <UploadCard onUploaded={loadAll} onTokenExpired={onTokenExpired} />

    </div>
  )
}

// ─── Readiness hero ───────────────────────────────────────────────────────────

function ReadinessHero({ readiness, nextPlanned, todayInfo, todayIsRestDay, imbalances, onNavigate }) {
  const score  = readiness?.score ?? null
  const color  = score !== null ? readinessColor(score) : '#9499A1'
  const radius = 26
  const circ   = 2 * Math.PI * radius
  const filled = score !== null ? (score / 10) * circ : 0

  // Context-redenen voor de volgende sessie
  const reasons = []
  if (readiness) {
    if (readiness.daysSinceLast === 1) reasons.push({ dot: 'ok',   text: 'Gisteren getraind — 1 dag rust' })
    else if (readiness.daysSinceLast === 2) reasons.push({ dot: 'ok', text: '2 dagen rust — goed hersteld' })
    else if (readiness.daysSinceLast >= 3) reasons.push({ dot: 'info', text: `${readiness.daysSinceLast} dagen rust — klaar` })
    else if (readiness.daysSinceLast === 0) reasons.push({ dot: 'warn', text: 'Vandaag al getraind' })

    if (readiness.avgRpe <= 7.5) reasons.push({ dot: 'ok',   text: `Gem. RPE vorige sessie ${readiness.avgRpe} — licht` })
    else if (readiness.avgRpe <= 8.5) reasons.push({ dot: 'info', text: `Gem. RPE vorige sessie ${readiness.avgRpe}` })
    else reasons.push({ dot: 'warn', text: `Gem. RPE vorige sessie ${readiness.avgRpe} — zwaar` })
  }

  // Imbalance als context voor volgende sessie
  if (imbalances && imbalances.length > 0) {
    const topIm = imbalances[0]
    if (topIm.status === 'low') {
      reasons.push({ dot: 'warn', text: `${topIm.muscle_group} onder target (${topIm.setCount}/${topIm.min} sets)` })
    }
  }

  const isLoading = score === null && nextPlanned === undefined

  // Bepaal wat te tonen als title
  let heroTitle = '—'
  let heroLabel = 'Volgende sessie'
  if (todayInfo?.type === 'done') {
    heroTitle = todayInfo.title
    heroLabel = 'Vandaag voltooid'
  } else if (nextPlanned) {
    heroTitle = nextPlanned.title
    heroLabel = nextPlanned.planned_date === getTodayStr() ? 'Vandaag gepland' : 'Volgende sessie'
  } else if (todayIsRestDay) {
    heroTitle = 'Rustdag'
    heroLabel = 'Vandaag'
  }

  return (
    <button
      onClick={() => onNavigate('agenda')}
      className="surface-hero text-left rounded-xl w-full hover:brightness-110 transition-all"
      style={{ overflow: 'hidden' }}
    >
      <div className="loaded-bar" style={{ '--load-pct': score !== null ? `${score * 10}%` : '0%' }} />
      <div className="flex items-center gap-plate-3 p-plate-3">
        {/* SVG ring */}
        <div style={{ flexShrink: 0 }}>
          <svg width="68" height="68" viewBox="0 0 68 68">
            <circle cx="34" cy="34" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="5" />
            {score !== null && (
              <circle
                cx="34" cy="34" r={radius}
                fill="none"
                stroke={color}
                strokeWidth="5"
                strokeDasharray={`${circ}`}
                strokeDashoffset={`${circ - filled}`}
                strokeLinecap="round"
                transform="rotate(-90 34 34)"
                style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
              />
            )}
            {isLoading ? (
              <text x="34" y="39" textAnchor="middle"
                fontFamily="JetBrains Mono" fontSize="11" fill="var(--color-text-secondary)">
                …
              </text>
            ) : (
              <>
                <text x="34" y="31" textAnchor="middle"
                  fontFamily="Fraunces,serif" fontSize="16" fontWeight="600" fill={color}>
                  {score}
                </text>
                <text x="34" y="44" textAnchor="middle"
                  fontFamily="JetBrains Mono" fontSize="8"
                  fill="var(--color-text-secondary)" letterSpacing="0.05em">
                  READY
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Sessie-info */}
        <div className="flex-1 min-w-0">
          <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest mb-0.5"
            style={{ color: todayInfo?.type === 'done' ? 'var(--color-status-ok)' : 'var(--color-data)' }}>
            {heroLabel}
          </p>
          <h2 className="font-[var(--font-display)] font-semibold text-xl tracking-tight leading-tight text-[var(--color-text-primary)] mb-plate-1">
            {heroTitle}
          </h2>
          <div className="flex flex-col gap-0.5">
            {reasons.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: r.dot === 'ok' ? 'var(--color-status-ok)'
                    : r.dot === 'warn' ? 'var(--color-status-low)'
                    : '#3E7CB1',
                }} />
                <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
                  {r.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Datum */}
        {nextPlanned && nextPlanned.planned_date !== getTodayStr() && (
          <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] tabular-data flex-shrink-0 self-start">
            {formatDate(nextPlanned.planned_date)}
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Streak + heatmap ─────────────────────────────────────────────────────────

function StreakCard({ streak }) {
  const { weeks, heatmap } = streak
  // 10 weken × 7 dagen
  const weeks10 = []
  for (let w = 0; w < 10; w++) {
    weeks10.push(heatmap.slice(w * 7, w * 7 + 7))
  }

  return (
    <div className="surface rounded-xl p-plate-3">
      <div className="flex items-center justify-between mb-plate-2">
        <div>
          <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-0.5">
            Consistentie
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="font-[var(--font-display)] font-semibold text-2xl text-[var(--color-accent)] leading-none">
              {weeks}
            </span>
            <span className="font-[var(--font-body)] text-xs text-[var(--color-text-secondary)]">
              {weeks === 1 ? 'week op rij' : 'weken op rij'} ≥3×/week
            </span>
          </div>
        </div>
        {weeks >= 4 && (
          <span className="text-xl" title="Streak">🔥</span>
        )}
      </div>

      {/* Heatmap grid: 10 kolommen (weken) × 7 rijen (dagen) */}
      <div className="flex gap-[3px]">
        {weeks10.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                title={day.date}
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 3,
                  background: day.isToday
                    ? 'var(--color-accent)'
                    : day.done
                    ? 'rgba(34,197,94,0.7)'
                    : 'var(--color-card)',
                  boxShadow: day.isToday ? '0 0 0 2px var(--color-bg), 0 0 0 3px var(--color-accent)' : 'none',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-plate-1">
        <span className="font-[var(--font-mono)] text-[9px] text-[var(--color-text-secondary)]">10 weken geleden</span>
        <span className="font-[var(--font-mono)] text-[9px] text-[var(--color-text-secondary)]">vandaag</span>
      </div>
    </div>
  )
}

// ─── Coach-advies ─────────────────────────────────────────────────────────────

function CoachAdviceCard({ advice, onNavigate }) {
  const { workoutTitle, date, advices } = advice

  // Splits in actionable (omhoog) vs overig
  const actionable = advices.filter((a) => ['gewicht_omhoog', 'reps_omhoog'].includes(a.action))
  const rest       = advices.filter((a) => !['gewicht_omhoog', 'reps_omhoog'].includes(a.action))

  return (
    <div className="surface rounded-xl overflow-hidden">
      <div className="loaded-bar" style={{ '--load-pct': '100%' }} />
      <div className="p-plate-3">
        <div className="flex items-center justify-between mb-plate-2">
          <div>
            <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--color-status-ok)] mb-0.5">
              Coach-advies — volgende {workoutTitle}
            </p>
            <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
              Op basis van {workoutTitle} van {formatDate(date)}
            </p>
          </div>
          <button
            onClick={() => onNavigate('rpe')}
            className="text-xs text-[var(--color-text-secondary)] font-[var(--font-mono)] hover:text-[var(--color-text-primary)]"
          >
            RPE-trend →
          </button>
        </div>

        {/* Actionable eerst */}
        {actionable.length > 0 && (
          <div className="mb-plate-2">
            <p className="font-[var(--font-body)] text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide mb-1">
              Klaar voor progressie
            </p>
            <div className="flex flex-col gap-1.5">
              {actionable.map((a) => (
                <AdviceRow key={a.exercise_title} advice={a} />
              ))}
            </div>
          </div>
        )}

        {/* Rest inklapbaar als er veel zijn */}
        {rest.length > 0 && (
          <div>
            {actionable.length > 0 && (
              <p className="font-[var(--font-body)] text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide mb-1 mt-plate-2">
                Overige oefeningen
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {rest.map((a) => (
                <AdviceRow key={a.exercise_title} advice={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AdviceRow({ advice }) {
  const color = actionColor(advice.action)
  const label = actionLabel(advice.action)
  const { bestSet, repRange } = advice

  return (
    <div className="flex items-start justify-between gap-plate-2 py-1 border-b border-[var(--color-bg)] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className="font-[var(--font-mono)] text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: `${color}18`, color }}
          >
            {label}
          </span>
          <span className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] truncate">
            {advice.exercise_title}
          </span>
        </div>
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
          {advice.advice}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] tabular-data">
          {bestSet.weight_kg} kg × {bestSet.reps}
        </p>
        {bestSet.rpe && (
          <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
            RPE {bestSet.rpe}
          </p>
        )}
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] opacity-50">
          range {repRange.min}–{repRange.max}
        </p>
      </div>
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
  const setDelta = loaded && prevWeekVolume ? delta(weekVolume.setCount, prevWeekVolume.setCount) : null

  return (
    <button
      onClick={() => onNavigate('volume')}
      className="surface text-left rounded-xl p-plate-3 hover:brightness-110 transition-all w-full"
    >
      <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-plate-2">
        Week-statistieken
      </p>

      <div className="grid grid-cols-3 gap-0 items-center">
        {/* Vorige week */}
        <div style={{ opacity: 0.4 }}>
          <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-tertiary)] mb-1.5 uppercase">Vorige</p>
          {!prevWeekVolume ? (
            <p className="font-[var(--font-mono)] text-sm text-[var(--color-text-secondary)]">—</p>
          ) : (
            <div className="flex flex-col gap-1">
              <MiniMetric val={prevWeekVolume.setCount} unit="sets" />
              <MiniMetric val={formatKg(prevWeekVolume.volumeKg)} unit="kg" />
              <MiniMetric val={prevWeekVolume.avgRpe ?? '—'} unit="rpe" />
            </div>
          )}
        </div>

        {/* Divider + delta */}
        <div className="flex flex-col items-center gap-1 px-2">
          <div style={{ width: 1, background: 'var(--color-border)', height: 24 }} />
          {volDelta !== null && <DeltaPill pct={volDelta} />}
          <div style={{ width: 1, background: 'var(--color-border)', height: 12 }} />
        </div>

        {/* Deze week */}
        <div>
          <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-accent)] mb-1.5 uppercase">Deze week</p>
          {!weekVolume ? (
            <p className="font-[var(--font-mono)] text-sm">Laden...</p>
          ) : (
            <div className="flex flex-col gap-1">
              <BigMetric val={weekVolume.setCount} unit="sets" delta={setDelta} color="var(--color-text-primary)" />
              <BigMetric val={formatKg(weekVolume.volumeKg)} unit="kg" color="var(--color-accent)" />
              <BigMetric val={weekVolume.avgRpe ?? '—'} unit="rpe" color="#3E7CB1" />
            </div>
          )}
        </div>
      </div>

      {/* vs beste week */}
      {bestWeek && weekVolume && (
        <div className="mt-plate-2 pt-plate-2 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
            vs all-time beste week ({formatKg(bestWeek.bestWeekVolume)} kg)
          </span>
          <div className="flex items-center gap-1.5">
            <div style={{
              width: 80,
              height: 4,
              borderRadius: 2,
              background: 'var(--color-border)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(bestWeek.pct, 100)}%`,
                background: bestWeek.pct >= 90 ? 'var(--color-status-ok)'
                  : bestWeek.pct >= 70 ? 'var(--color-accent)'
                  : 'var(--color-status-low)',
                transition: 'width 0.6s ease-out',
              }} />
            </div>
            <span className="font-[var(--font-mono)] text-[10px]"
              style={{ color: bestWeek.pct >= 90 ? 'var(--color-status-ok)' : 'var(--color-status-low)' }}>
              {bestWeek.pct}%
            </span>
          </div>
        </div>
      )}
    </button>
  )
}

function MiniMetric({ val, unit }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-[var(--font-mono)] text-sm leading-none text-[var(--color-text-primary)]">{val}</span>
      <span className="font-[var(--font-body)] text-[9px] uppercase tracking-wide text-[var(--color-text-tertiary)]">{unit}</span>
    </div>
  )
}

function BigMetric({ val, unit, delta, color }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-[var(--font-display)] font-semibold text-xl leading-none tabular-data" style={{ color }}>{val}</span>
      <span className="font-[var(--font-body)] text-[9px] uppercase tracking-wide text-[var(--color-text-tertiary)]">{unit}</span>
      {delta !== null && delta !== undefined && (
        <span className="font-[var(--font-mono)] text-[9px] tabular-data"
          style={{ color: delta > 0 ? 'var(--color-status-ok)' : delta < 0 ? 'var(--color-status-high)' : 'var(--color-text-tertiary)' }}>
          {delta > 0 ? `+${delta}%` : `${delta}%`}
        </span>
      )}
    </div>
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

function ProactiveSignals({ plateaus, imbalances, topPRs, onNavigate }) {
  const hasData = (plateaus || imbalances || topPRs) !== null

  const recentPRs = topPRs
    ? topPRs.filter((pr) => pr.oneRepMax?.isRecent)
    : []

  const signalCount =
    (plateaus?.length ?? 0) +
    (imbalances?.length ?? 0) +
    recentPRs.length

  if (!hasData || signalCount === 0) return null

  return (
    <div className="surface rounded-xl p-plate-3">
      <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-plate-2">
        Signalen
      </p>
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

        {/* Imbalances */}
        {imbalances && imbalances.slice(0, 2).map((im) => (
          <button
            key={im.muscle_group}
            onClick={() => onNavigate('volume')}
            className="flex items-center justify-between py-plate-2 border-b border-[var(--color-bg)] last:border-0 hover:brightness-110 text-left w-full"
          >
            <div className="flex items-center gap-plate-2">
              <SignalIcon type={im.status === 'low' ? 'danger' : 'warn'} icon="activity" />
              <div>
                <p className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] capitalize">{im.muscle_group}</p>
                <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
                  {im.setCount} sets · {im.status === 'low' ? `min ${im.min}` : `max ${im.max}`} sets/week
                </p>
              </div>
            </div>
            <SignalBadge
              label={im.status === 'low' ? `−${Math.round(im.min - im.setCount)} sets` : `+${Math.round(im.setCount - im.max)} sets`}
              color={im.status === 'low' ? 'danger' : 'warn'}
            />
          </button>
        ))}

        {/* Recente PRs */}
        {recentPRs.slice(0, 2).map((pr) => (
          <button
            key={pr.exercise_title}
            onClick={() => onNavigate('prs')}
            className="flex items-center justify-between py-plate-2 border-b border-[var(--color-bg)] last:border-0 hover:brightness-110 text-left w-full"
          >
            <div className="flex items-center gap-plate-2">
              <SignalIcon type="ok" icon="trophy" />
              <div>
                <p className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)]">{pr.exercise_title}</p>
                <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
                  Geschat 1RM {formatKg(pr.oneRepMax.value)} kg
                </p>
              </div>
            </div>
            <SignalBadge label="Nieuw PR" color="ok" />
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

// ─── Dagstrip ─────────────────────────────────────────────────────────────────

function DayStrip({ days, onNavigate }) {
  return (
    <div className="grid grid-cols-7 gap-plate-1">
      {days.map((d) => {
        const dayNum  = Number(d.date.slice(8, 10))
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

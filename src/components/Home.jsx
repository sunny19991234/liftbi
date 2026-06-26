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
import CoachAdviceCard from './CoachAdviceCard'
import {
  fetchNextPlanned,
  fetchDayStrip,
  fetchWeekVolume,
  fetchPreviousWeekVolumeByCount,
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
import { fetchDeloadWeeks, getWeeksSinceDeload } from '../lib/deloadData'

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
  const [deloadWeeks, setDeloadWeeks]         = useState([])
  const [error, setError]                     = useState(null)

  const today = getTodayStr()
  const rawUTCDay = new Date(today + 'T00:00:00Z').getUTCDay() // 0=zo
  const dayOfWeek = rawUTCDay === 0 ? 6 : rawUTCDay - 1 // ma=0 … zo=6

  function loadAll() {
    async function run() {
      // Eerst nextPlanned ophalen — nodig voor type-specifieke readiness berekening
      const next = await fetchNextPlanned()
      setNextPlanned(next)

      // Daarna alles parallel, readiness nu met het juiste workout-type
      const [strip, vol, plateauList, allPRs, readinessData, streakData, recentWos, upcomingWos, dlWeeks] =
        await Promise.all([
          fetchDayStrip(),
          fetchWeekVolume(),
          detectPlateaus(),
          calculateAllPRs(),
          calculateReadinessScore(next?.title),
          calculateStreak(3),
          fetchRecentWorkouts(5),
          fetchUpcomingPlanned(4),
          fetchDeloadWeeks(),
        ])

      // prevVol en imbalances parallel in tweede batch (afhankelijk van vol en upcomingWos)
      const [imbalanceList, prevVol] = await Promise.all([
        detectImbalances(upcomingWos),
        fetchPreviousWeekVolumeByCount(vol.workoutCount),
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
      setDeloadWeeks(dlWeeks)

      fetchBestWeekComparison(vol.volumeKg, dayOfWeek).then(setBestWeek).catch(() => {}) // dayOfWeek voor best-week bar
      loadCoachAdvice(next)
    }
    run().catch((err) => setError(err.message))
  }

  async function loadCoachAdvice(nextWorkout) {
    const priorityTitle = nextWorkout?.title

    if (priorityTitle) {
      // Altijd gebaseerd op de eerst komende geplande workout — nooit terugvallen op ander type
      try {
        const advice = await fetchCoachAdviceForType(priorityTitle)
        if (advice && advice.advices.length > 0) {
          setCoachAdvice(advice)
        }
      } catch (_) { /* geen advies beschikbaar voor dit type */ }
      return
    }

    // Geen geplande workout: meest recente sessie overall als fallback
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

  const todayInfo      = dayStrip?.find((d) => d.isToday)?.info
  const todayIsRestDay = dayStrip && !todayInfo

  // Deload-afleiding
  const deloadSet         = new Set(deloadWeeks)
  const currentWeekStart  = weekVolume?.weekStart ?? null
  const prevWeekStart     = prevWeekVolume?.weekStart ?? null
  const isCurrentDeload   = currentWeekStart ? deloadSet.has(currentWeekStart) : false
  const isPrevDeload      = prevWeekStart ? deloadSet.has(prevWeekStart) : false
  const { weeksSince: weeksSinceDeload } = getWeeksSinceDeload(deloadWeeks)

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout: {error}</p>
  }

  return (
    <div className="max-w-3xl xl:max-w-none mx-auto px-plate-3 py-plate-3 sm:px-plate-4 sm:py-plate-4 flex flex-col gap-plate-3">

      {/* Deload banner — volledige breedte, boven het grid */}
      {isCurrentDeload && <DeloadBanner />}

      {/* XL: 2 kolommen; sm/md: gestapeld */}
      <div className="flex flex-col gap-plate-3 xl:grid xl:grid-cols-2 xl:gap-plate-4 xl:items-start">

        {/* Kolom 1 (links): Readiness + Coach-advies */}
        <div className="flex flex-col gap-plate-3">
          <ReadinessHero
            readiness={readiness}
            nextPlanned={nextPlanned}
            todayInfo={todayInfo}
            todayIsRestDay={todayIsRestDay}
            streak={streak}
            recentWorkouts={recentWorkouts}
            upcomingPlanned={upcomingPlanned}
            isCurrentDeload={isCurrentDeload}
            weeksSinceDeload={weeksSinceDeload}
            onNavigate={onNavigate}
          />
          {coachAdvice && coachAdvice.advices.length > 0 && (
            <CoachAdviceCard advice={coachAdvice} onNavigate={onNavigate} />
          )}
        </div>

        {/* Kolom 2 (rechts): Streak + Week, Signalen, Upload */}
        <div className="flex flex-col gap-plate-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-plate-3">
            {streak !== null && <StreakCard streak={streak} />}
            <WeekComparisonCard
              weekVolume={weekVolume}
              prevWeekVolume={prevWeekVolume}
              bestWeek={bestWeek}
              isCurrentDeload={isCurrentDeload}
              isPrevDeload={isPrevDeload}
              onNavigate={onNavigate}
              dayOfWeek={dayOfWeek}
            />
          </div>
          <ProactiveSignals
            topPRs={topPRs}
            recentWorkouts={recentWorkouts}
            onNavigate={onNavigate}
          />
          <UploadCard onUploaded={loadAll} onTokenExpired={onTokenExpired} />
        </div>

      </div>
    </div>
  )
}

// ─── Deload banner ────────────────────────────────────────────────────────────

function DeloadBanner() {
  return (
    <div
      className="rounded-xl flex items-center gap-3 px-plate-3 py-plate-3 border border-l-4"
      style={{
        background: 'rgba(217,164,65,0.18)',
        borderColor: 'rgba(217,164,65,0.50)',
        borderLeftColor: '#D9A441',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: 'rgba(217,164,65,0.18)',
        border: '1px solid rgba(217,164,65,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#D9A441',
      }}>
        <i className="ti ti-moon-stars" style={{ fontSize: 19 }} aria-hidden="true" />
      </div>
      <div>
        <p className="font-[var(--font-display)] font-semibold text-base leading-tight"
          style={{ color: '#D9A441' }}>
          Deload week
        </p>
        <p className="font-[var(--font-mono)] text-[10px] mt-0.5"
          style={{ color: 'rgba(217,164,65,0.7)' }}>
          Actief herstel · disbalans & plateau meldingen gedempt
        </p>
      </div>
    </div>
  )
}

// ─── Readiness hero ───────────────────────────────────────────────────────────

function ReadinessHero({ readiness, nextPlanned, todayInfo, todayIsRestDay, streak, recentWorkouts, upcomingPlanned, isCurrentDeload, weeksSinceDeload, onNavigate }) {
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
  // Week-teller: na deload opnieuw beginnen, of deload tonen
  const mesoWeek = isCurrentDeload
    ? null
    : weeksSinceDeload !== null
      ? weeksSinceDeload
      : Math.max(1, streak?.weeks ?? 1)

  // Dynamisch icon op basis van readiness score
  const heroIcon = score === null ? 'barbell' : score >= 8 ? 'flame' : score >= 6 ? 'bolt' : 'moon'

  return (
    <button
      onClick={() => onNavigate('workouts')}
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

      {/* Vaste onderste balk: mesostrip-label links, Bekijk agenda rechts */}
      <div className="border-t border-[var(--color-border-subtle)] px-plate-3 py-2.5">
        <div className="flex items-center justify-between mb-2">
          {isCurrentDeload ? (
            <span
              className="font-[var(--font-mono)] text-[8px] uppercase tracking-[0.12em] flex items-center gap-1"
              style={{
                color: '#D9A441',
                background: 'rgba(217,164,65,0.12)',
                border: '1px solid rgba(217,164,65,0.30)',
                borderRadius: 3,
                padding: '2px 6px',
              }}
            >
              <i className="ti ti-moon-stars" style={{ fontSize: 9 }} />
              Deload
            </span>
          ) : (
            <span
              className="font-[var(--font-mono)] text-[8px] uppercase tracking-[0.12em]"
              style={{
                color: 'var(--color-accent)',
                background: 'var(--color-accent)14',
                border: '1px solid var(--color-accent)28',
                borderRadius: 3,
                padding: '2px 6px',
              }}
            >
              Week {mesoWeek}
            </span>
          )}
          <span className="font-[var(--font-mono)] text-[9px] text-[var(--color-text-secondary)]">
            Bekijk agenda →
          </span>
        </div>
        {mesoItems.length > 0 && (
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
        )}
      </div>
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

  // Kwartiel-intensiteit op basis van volumeKg
  const nonZeroVols = weeks5.flat().filter((d) => d.volumeKg > 0).map((d) => d.volumeKg).sort((a, b) => a - b)
  const q1 = nonZeroVols[Math.floor(nonZeroVols.length * 0.25)] ?? 0
  const q2 = nonZeroVols[Math.floor(nonZeroVols.length * 0.5)] ?? 0
  const INTENSITY_COLORS = ['transparent', '#22C55E30', '#22C55E70', '#22C55E']
  function intensityLevel(vol) {
    if (!vol || vol === 0) return 0
    if (vol <= q1) return 1
    if (vol <= q2) return 2
    return 3
  }

  return (
    <div className="surface rounded-xl px-3 py-2 relative" style={{ position: 'relative' }}>
      {weeks >= 4 && (
        <i className="ti ti-flame" style={{ position: 'absolute', top: 8, right: 10, fontSize: 14, color: 'var(--color-status-low)' }} aria-hidden="true" />
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

      {/* Heatmap: 5 weken × 7 dagen met intensiteitsniveaus */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
        {weeks5.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map((day, di) => {
              const level = day.done ? Math.max(1, intensityLevel(day.volumeKg)) : 0
              return (
                <div
                  key={di}
                  title={day.date}
                  style={{
                    width: '100%', height: 11,
                    borderRadius: 2,
                    background: day.isToday ? 'var(--color-accent)'
                      : level === 0 ? 'var(--color-border)'
                      : INTENSITY_COLORS[level],
                    boxShadow: day.isToday ? '0 0 0 1px var(--color-bg), 0 0 0 2px var(--color-accent)' : 'none',
                  }}
                />
              )
            })}
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

// ─── Week vs beste week ───────────────────────────────────────────────────────

const DAY_NAMES_NL = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']

function WeekComparisonCard({ weekVolume, prevWeekVolume, bestWeek, isCurrentDeload, isPrevDeload, onNavigate, dayOfWeek }) {
  const dagnaam = DAY_NAMES_NL[dayOfWeek ?? 6]
  const loaded = weekVolume !== null
  const isEmptyWeek = weekVolume && weekVolume.volumeKg === 0 && weekVolume.setCount === 0

  function delta(current, previous) {
    if (!previous || previous === 0) return null
    return Math.round(((current - previous) / previous) * 100)
  }

  // Geen delta vergelijking als huidige of vorige week een deload is
  const volDelta = loaded && !isEmptyWeek && prevWeekVolume && !isCurrentDeload && !isPrevDeload
    ? delta(weekVolume.volumeKg, prevWeekVolume.volumeKg)
    : null

  return (
    <button
      onClick={() => onNavigate('volume')}
      className="surface text-left rounded-xl px-3 py-2 hover:brightness-110 transition-all w-full h-full"
      style={{
        position: 'relative',
        border: isCurrentDeload ? '1px solid rgba(217,164,65,0.25)' : undefined,
      }}
    >
      {/* Icon rechtsboven */}
      <div style={{ position: 'absolute', top: 8, right: 10 }}>
        <i className="ti ti-chart-bar" style={{ fontSize: 15, color: isCurrentDeload ? '#D9A441' : 'var(--color-accent)', opacity: 0.6 }} aria-hidden="true" />
      </div>

      {/* Pijl rechtsonder — visuele hint dat de kaart klikbaar is */}
      <div style={{ position: 'absolute', bottom: 8, right: 10 }}>
        <i className="ti ti-arrow-right" style={{ fontSize: 12, color: 'var(--color-text-secondary)', opacity: 0.4 }} aria-hidden="true" />
      </div>

      {/* Header met optionele deload badge */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <p className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest text-[var(--color-text-secondary)]">
          Week
        </p>
        {isCurrentDeload && (
          <span className="font-[var(--font-mono)] text-[8px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
            style={{ background: 'rgba(217,164,65,0.15)', color: '#D9A441', border: '1px solid rgba(217,164,65,0.3)' }}>
            <i className="ti ti-moon-stars" style={{ fontSize: 8 }} />
            deload
          </span>
        )}
      </div>

      {!weekVolume ? (
        <p className="font-[var(--font-mono)] text-sm text-[var(--color-text-secondary)]">Laden...</p>
      ) : isEmptyWeek ? (
        <div>
          <p className="font-[var(--font-body)] text-sm text-[var(--color-text-secondary)] leading-snug">
            Week gestart
          </p>
          <p className="font-[var(--font-mono)] text-[9px] text-[var(--color-text-secondary)] mt-0.5 opacity-60">
            nog geen workout
          </p>
        </div>
      ) : (
        <div style={{ opacity: isCurrentDeload ? 0.7 : 1 }}>
          {/* Huidige week */}
          <div className="mb-0.5">
            <span className="font-[var(--font-display)] font-semibold text-xl leading-none"
              style={{ color: isCurrentDeload ? '#D9A441' : 'var(--color-accent)' }}>
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
              {weekVolume.workoutCount != null ? `${weekVolume.workoutCount}× · ` : ''}{weekVolume.setCount} sets
            </span>
          </div>

          {/* Vorige week */}
          {prevWeekVolume && (
            <div className="mb-2 pl-2" style={{ borderLeft: '2px solid var(--color-border)' }}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-[var(--font-mono)] text-[8px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                  vorige
                </span>
                {isPrevDeload ? (
                  <span className="font-[var(--font-mono)] text-[8px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(217,164,65,0.12)', color: '#D9A441bb', border: '1px solid rgba(217,164,65,0.2)' }}>
                    deload
                  </span>
                ) : volDelta !== null ? (
                  <DeltaPill pct={volDelta} />
                ) : null}
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
                      {prevWeekVolume.workoutCount != null ? `${prevWeekVolume.workoutCount}× · ` : ''}{prevWeekVolume.setCount} sets
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* vs beste week — verborgen bij deload of 0% */}
          {!isCurrentDeload && bestWeek && bestWeek.pct > 0 && (
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
                {bestWeek.pct}% van beste week
              </span>
              <span className="font-[var(--font-mono)] text-[8px] text-[var(--color-text-secondary)] opacity-60 ml-1">
                t/m {dagnaam}
              </span>
            </div>
          )}
        </div>
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

// ─── Proactieve signalen ──────────────────────────────────────────────────────

function ProactiveSignals({ topPRs, recentWorkouts, onNavigate }) {
  const last4Dates = new Set((recentWorkouts ?? []).slice(0, 4).map((w) => w.start_date))
  const recentPRs = topPRs
    ? topPRs.filter((pr) => pr.oneRepMax?.date && last4Dates.has(pr.oneRepMax.date))
    : []

  if (!topPRs || recentPRs.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest px-0.5"
        style={{ color: 'var(--color-text-secondary)' }}>
        PR's · {recentPRs.length}
      </p>

      {recentPRs.slice(0, 3).map((pr) => (
        <SignalCard
          key={pr.exercise_title}
          icon="trophy"
          iconStyle={{
            background: 'linear-gradient(135deg, rgba(255,196,0,0.2), rgba(255,140,0,0.15))',
            border: '1px solid rgba(255,184,0,0.3)',
            color: '#FFB800',
          }}
          category="Nieuw PR"
          categoryColor="#FFB800"
          title={pr.exercise_title}
          sub={`e1RM ${formatKg(pr.oneRepMax.value)} kg · ${pr.oneRepMax.weight_kg} kg × ${pr.oneRepMax.reps} reps`}
          cardStyle={{ background: 'linear-gradient(135deg, rgba(255,196,0,0.04), rgba(255,140,0,0.02))', border: '1px solid rgba(255,184,0,0.15)' }}
          onClick={() => onNavigate('oefeningen', { exercise: pr.exercise_title })}
        />
      ))}
    </div>
  )
}

function SignalCard({ icon, iconStyle, category, categoryColor, title, sub, cardStyle, onClick }) {
  const content = (
    <div
      className="rounded-xl flex items-center gap-3 p-3"
      style={cardStyle}
    >
      {/* Icon */}
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...iconStyle,
      }}>
        <i className={`ti ti-${icon}`} style={{ fontSize: 19 }} aria-hidden="true" />
      </div>

      {/* Tekst */}
      <div className="flex-1 min-w-0">
        <span
          className="font-[var(--font-mono)] text-[8px] uppercase tracking-widest font-bold block mb-0.5"
          style={{ color: categoryColor }}
        >
          {category}
        </span>
        <p className="font-[var(--font-display)] font-semibold text-[13px] leading-tight text-[var(--color-text-primary)] truncate">
          {title}
        </p>
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] leading-tight truncate">
          {sub}
        </p>
      </div>

      {/* Chevron alleen bij klikbare items */}
      {onClick && (
        <i className="ti ti-chevron-right" style={{ fontSize: 13, color: 'var(--color-text-secondary)', flexShrink: 0, opacity: 0.4 }} aria-hidden="true" />
      )}
    </div>
  )

  if (onClick) {
    return (
      <button onClick={onClick} className="w-full text-left hover:brightness-110 transition-all rounded-xl">
        {content}
      </button>
    )
  }
  return content
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

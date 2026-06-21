// src/components/Home.jsx
//
// Startpagina: compacte hero met eerstvolgende geplande sessie naast het
// weekvolume-blok (sets/kg/gem.RPE, volledige kalenderweek), een
// vorige-weekkaartje ter vergelijking, een proactief plateau-signaal
// (PRD 4.12, op basis van e1RM zodat reps-progressie niet als stagnatie
// wordt gezien), een disbalans-signaal (PRD 4.7, alleen afwijkingen,
// exact dezelfde week-aggregatie als de Volume-tab), de top 5 grootste
// PR's, een dagstrip, en een compacte upload-kaart.
//
// Visueel signature-moment van de app: de hero-kaart krijgt de gestaalde
// .surface-hero behandeling (subtiele lichtstreep) -- bewust compact
// gehouden zodat de rest van het scherm meer ruimte krijgt.

import { useEffect, useRef, useState } from 'react'
import { fetchNextPlanned, fetchDayStrip, fetchWeekVolume, fetchPreviousWeekVolume } from '../lib/homeData'
import { getTodayStr } from '../lib/calendarData'
import { detectPlateaus } from '../lib/plateauData'
import { detectImbalances } from '../lib/imbalanceData'
import { calculateAllPRs } from '../lib/prData'
import { parseHevyCsv } from '../lib/hevyParser'
import { getToken, clearToken } from '../lib/auth'

const WEEKDAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

function formatKg(value) {
  return value.toLocaleString('nl-NL')
}

export default function Home({ onNavigate, onTokenExpired }) {
  const [nextPlanned, setNextPlanned] = useState(undefined) // undefined = loading, null = none
  const [dayStrip, setDayStrip] = useState(null)
  const [weekVolume, setWeekVolume] = useState(null)
  const [prevWeekVolume, setPrevWeekVolume] = useState(null)
  const [plateaus, setPlateaus] = useState(null) // null = loading, [] = geen plateaus
  const [imbalances, setImbalances] = useState(null)
  const [topPRs, setTopPRs] = useState(null)
  const [error, setError] = useState(null)

  const today = getTodayStr()

  function loadAll() {
    Promise.all([
      fetchNextPlanned(),
      fetchDayStrip(),
      fetchWeekVolume(),
      fetchPreviousWeekVolume(),
      detectPlateaus(),
      detectImbalances(),
      calculateAllPRs(),
    ])
      .then(([next, strip, vol, prevVol, plateauList, imbalanceList, allPRs]) => {
        setNextPlanned(next)
        setDayStrip(strip)
        setWeekVolume(vol)
        setPrevWeekVolume(prevVol)
        setPlateaus(plateauList)
        setImbalances(imbalanceList)
        setTopPRs(rankTopPRs(allPRs, 5))
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      <div className="grid grid-cols-2 gap-plate-3">
        <WeekVolumeCard label="Deze week" weekVolume={weekVolume} onNavigate={onNavigate} highlight />
        <WeekVolumeCard label="Vorige week" weekVolume={prevWeekVolume} onNavigate={onNavigate} />
      </div>

      <UploadCard onUploaded={loadAll} onTokenExpired={onTokenExpired} />

      {plateaus && plateaus.length > 0 && (
        <PlateauSignal plateaus={plateaus} onNavigate={onNavigate} />
      )}

      {imbalances && imbalances.length > 0 && (
        <ImbalanceSignal imbalances={imbalances} onNavigate={onNavigate} />
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

      <TopPRsCard topPRs={topPRs} onNavigate={onNavigate} />
    </div>
  )
}

// Top N PR's op basis van geschat 1RM (meest universeel vergelijkbaar tussen
// oefeningen). Oefeningen zonder 1RM (bv. hoge-rep-only) vallen hierbuiten --
// dat is acceptabel, dit is een "zwaarste lifts"-overzicht, geen volledige lijst.
function rankTopPRs(allPRs, n) {
  return allPRs
    .filter((pr) => pr.oneRepMax !== null)
    .sort((a, b) => b.oneRepMax.value - a.oneRepMax.value)
    .slice(0, n)
}

function UploadCard({ onUploaded, onTokenExpired }) {
  const fileInputRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | parsing | uploading | done | error
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setResult(null)
    setStatus('parsing')

    let sessions
    try {
      const text = await file.text()
      const parsed = parseHevyCsv(text)
      sessions = parsed.sessions
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessions }),
      })

      if (res.status === 401) {
        clearToken()
        onTokenExpired?.()
        return
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Server gaf status ${res.status}: ${text}`)
      }

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
    <div className="surface rounded-xl p-plate-3 flex flex-col gap-plate-2">
      <div className="flex items-center justify-between gap-plate-3">
        <div>
          <p className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] font-medium">
            Workouts importeren
          </p>
          <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] mt-0.5">
            {busy
              ? status === 'parsing' ? 'CSV parsen...' : 'Uploaden...'
              : 'Hevy CSV-export'}
          </p>
        </div>
        <label className={`px-plate-3 py-plate-2 rounded-lg text-sm font-[var(--font-body)] font-medium flex-shrink-0 transition-opacity ${
          busy
            ? 'bg-[var(--color-card-raised)] text-[var(--color-text-secondary)] cursor-wait'
            : 'bg-[var(--color-accent)] text-white cursor-pointer hover:opacity-90'
        }`}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={busy}
            className="hidden"
          />
          {busy ? 'Bezig...' : 'Kies bestand'}
        </label>
      </div>

      {error && (
        <p className="text-[var(--color-status-high)] font-[var(--font-body)] text-xs">{error}</p>
      )}

      {result && (
        <div className="flex flex-col gap-1 pt-plate-1 border-t border-[var(--color-border-subtle)]">
          <p className="text-[var(--color-status-ok)] font-[var(--font-mono)] text-xs tabular-data">
            {result.created} nieuw · {result.updated} bijgewerkt
          </p>
          {result.sessionResults.some((s) => s.status === 'error') && (
            <ul className="font-[var(--font-mono)] text-xs text-[var(--color-status-high)] flex flex-col gap-0.5">
              {result.sessionResults.filter((s) => s.status === 'error').map((s, i) => (
                <li key={i}>{s.title}: {s.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ImbalanceSignal({ imbalances, onNavigate }) {
  const visible = imbalances.slice(0, 3)
  const extra = imbalances.length - visible.length

  return (
    <button
      onClick={() => onNavigate('volume')}
      className="surface text-left rounded-xl p-plate-3 hover:brightness-110 transition-all border-l-2 border-[var(--color-data)]"
    >
      <p className="text-xs text-[var(--color-data)] font-[var(--font-mono)] tracking-wide uppercase mb-plate-2">
        {imbalances.length === 1 ? '1 spiergroep buiten target' : `${imbalances.length} spiergroepen buiten target`}
      </p>
      <div className="flex flex-col gap-1.5">
        {visible.map((im) => (
          <div key={im.muscle_group} className="flex items-center justify-between">
            <span className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] capitalize">
              {im.muscle_group}
            </span>
            <span className={`font-[var(--font-mono)] text-xs tabular-data ${
              im.status === 'low' ? 'text-[var(--color-status-low)]' : 'text-[var(--color-status-high)]'
            }`}>
              {im.setCount} sets ({im.status === 'low' ? `min ${im.min}` : `max ${im.max}`})
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

function TopPRsCard({ topPRs, onNavigate }) {
  return (
    <button
      onClick={() => onNavigate('prs')}
      className="surface text-left rounded-xl p-plate-3 hover:brightness-110 transition-all"
    >
      <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm mb-plate-3">
        Zwaarste lifts (geschat 1RM)
      </p>
      {!topPRs ? (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
      ) : topPRs.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">Nog geen PR's berekend.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {topPRs.map((pr, i) => (
            <li key={pr.exercise_title} className="flex items-center justify-between gap-plate-2">
              <span className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] truncate flex items-center gap-2">
                <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-tertiary)] w-3 flex-shrink-0">{i + 1}</span>
                <span className="truncate">{pr.exercise_title}</span>
              </span>
              <span className="font-[var(--font-mono)] text-xs text-[var(--color-accent)] tabular-data flex-shrink-0">
                {formatKg(pr.oneRepMax.value)} kg
              </span>
            </li>
          ))}
        </ol>
      )}
    </button>
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
      <p className="text-xs text-[var(--color-status-low)] font-[var(--font-mono)] tracking-wide uppercase mb-plate-3">
        {plateaus.length === 1 ? '1 oefening stagneert' : `${plateaus.length} oefeningen stagneren`}
      </p>
      <div className="flex flex-col gap-plate-3">
        {visible.map((p) => (
          <PlateauRow key={p.exercise_title} plateau={p} />
        ))}
        {extra > 0 && (
          <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-tertiary)]">+{extra} meer</span>
        )}
      </div>
    </button>
  )
}

// Toont per oefening een kleine sparkline (e1RM over de laatste sessies --
// dus gewicht ÉN reps samen, niet alleen top-gewicht) + RPE-trend, zodat in
// één oogopslag duidelijk is *waarom* het een plateau is.
function PlateauRow({ plateau }) {
  const e1rms = plateau.sessions.map((s) => s.e1rm)
  const rpes = plateau.sessions.map((s) => s.avgRpe)

  return (
    <div className="flex items-center justify-between gap-plate-3">
      <div className="min-w-0 flex-1">
        <p className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] truncate">
          {plateau.exercise_title}
        </p>
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] tabular-data mt-0.5">
          e1RM {e1rms.map((v) => `${v}kg`).join(' → ')}
          {rpes.every((r) => r !== null) && (
            <span className="ml-2 text-[var(--color-text-tertiary)]">
              RPE {rpes.map((r) => r.toFixed(1)).join(' → ')}
            </span>
          )}
        </p>
      </div>
      <WeightSparkline weights={e1rms} />
    </div>
  )
}

function WeightSparkline({ weights }) {
  const w = 56
  const h = 24
  const pad = 3
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const range = max - min || 1

  const points = weights.map((val, i) => {
    const x = pad + (i / (weights.length - 1 || 1)) * (w - pad * 2)
    const y = h - pad - ((val - min) / range) * (h - pad * 2)
    return [x, y]
  })

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const flat = max === min

  return (
    <svg width={w} height={h} className="flex-shrink-0" viewBox={`0 0 ${w} ${h}`}>
      <path
        d={path}
        fill="none"
        stroke={flat ? '#D9A441' : '#9499A1'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === points.length - 1 ? 2.5 : 1.5}
          fill={i === points.length - 1 ? '#D9A441' : '#9499A1'}
        />
      ))}
    </svg>
  )
}

// Compacte hero: status van vandaag + link naar volgende sessie, geen
// grote koppen meer. Eén regel hoog qua hiërarchie, niet een dominant blok.
function NextSessionCard({ nextPlanned, todayInfo, todayIsRestDay, onNavigate }) {
  if (nextPlanned === undefined) {
    return (
      <div className="surface-hero rounded-xl px-plate-3 py-plate-2 flex items-center">
        <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
      </div>
    )
  }

  if (todayInfo?.type === 'done') {
    return (
      <div className="surface-hero rounded-xl px-plate-3 py-plate-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[var(--color-status-ok)] font-[var(--font-mono)] tracking-wide uppercase">
            Vandaag voltooid
          </p>
          <h2 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] tracking-tight leading-tight">
            {todayInfo.title}
          </h2>
        </div>
      </div>
    )
  }

  if (todayIsRestDay && !nextPlanned) {
    return (
      <div className="surface-hero rounded-xl px-plate-3 py-plate-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[var(--color-text-tertiary)] font-[var(--font-mono)] tracking-wide uppercase">
            Vandaag
          </p>
          <h2 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] tracking-tight leading-tight">
            Rustdag
          </h2>
        </div>
      </div>
    )
  }

  if (!nextPlanned) {
    return (
      <div className="surface rounded-xl px-plate-3 py-plate-2 flex items-center">
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
      className="surface-hero text-left rounded-xl px-plate-3 py-plate-2 w-full hover:brightness-110 transition-all group flex items-center justify-between"
    >
      <div>
        <p className="text-[10px] text-[var(--color-data)] font-[var(--font-mono)] tracking-wide uppercase">
          {isToday ? 'Vandaag gepland' : 'Volgende sessie'}
        </p>
        <h2 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] tracking-tight leading-tight group-hover:text-white transition-colors">
          {nextPlanned.title}
        </h2>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-mono)] tabular-data flex-shrink-0">
        {nextPlanned.planned_date}
      </p>
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

// Eén kaart-component voor zowel "deze week" als "vorige week" -- exact
// dezelfde drie metrics (sets, kg, gem. RPE), zodat ze direct vergelijkbaar
// naast elkaar staan. `highlight` geeft de huidige week een accentrand.
function WeekVolumeCard({ label, weekVolume, onNavigate, highlight = false }) {
  return (
    <button
      onClick={() => onNavigate('volume')}
      className={`surface text-left rounded-xl p-plate-3 hover:brightness-110 transition-all flex flex-col justify-center ${
        highlight ? 'border-l-2 border-[var(--color-accent)]' : ''
      }`}
    >
      <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-xs mb-plate-2">
        {label}
      </p>
      {!weekVolume ? (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
      ) : (
        <div className="flex items-end gap-plate-3">
          <div>
            <p className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tabular-data tracking-tight leading-none">
              {weekVolume.setCount}
            </p>
            <p className="text-[9px] text-[var(--color-text-tertiary)] font-[var(--font-body)] uppercase tracking-wide mt-0.5">sets</p>
          </div>
          <div>
            <p className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-accent)] tabular-data tracking-tight leading-none">
              {formatKg(weekVolume.volumeKg)}
            </p>
            <p className="text-[9px] text-[var(--color-text-tertiary)] font-[var(--font-body)] uppercase tracking-wide mt-0.5">kg</p>
          </div>
          <div>
            <p className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-data)] tabular-data tracking-tight leading-none">
              {weekVolume.avgRpe ?? '—'}
            </p>
            <p className="text-[9px] text-[var(--color-text-tertiary)] font-[var(--font-body)] uppercase tracking-wide mt-0.5">RPE</p>
          </div>
        </div>
      )}
    </button>
  )
}

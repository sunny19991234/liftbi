import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { calculatePRsForExercise } from '../lib/prData'

const MUSCLE_GROUPS = ['Borst', 'Rug', 'Schouders', 'Biceps', 'Triceps', 'Benen', 'Forearms', 'Cardio', 'Overig']

function BodyIcon({ muscle, color, size = 28 }) {
  const BASE   = '#3A3D45'
  const STROKE = '#505560'
  const DIM    = '#252830'

  const b = { fill: BASE,  stroke: STROKE, strokeWidth: 0.8 }
  const h = { fill: color, stroke: color,  strokeWidth: 0.5, opacity: 0.95 }
  const d = { fill: DIM,   stroke: '#3A3D45', strokeWidth: 0.6 }

  const is = (g) => muscle === g

  return (
    <svg
      viewBox="0 0 40 60"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
      aria-label={muscle}
    >
      {/* Hoofd */}
      <ellipse cx="20" cy="5.5" rx="4.2" ry="4.5" {...b} />
      {/* Nek */}
      <rect x="17.5" y="9.5" width="5" height="3" rx="1" {...b} />

      {/* Schouders */}
      <ellipse cx="9"  cy="14" rx="4.2" ry="3.2" {...(is('Schouders') ? h : b)} />
      <ellipse cx="31" cy="14" rx="4.2" ry="3.2" {...(is('Schouders') ? h : b)} />

      {/* Bovenarm links — biceps voorkant */}
      <path d="M7 16 Q4.5 19 5 24 L8 24 Q8.5 19.5 10 17 Z"
        {...(is('Biceps') ? h : is('Triceps') ? d : b)} />
      {/* Bovenarm rechts */}
      <path d="M33 16 Q35.5 19 35 24 L32 24 Q31.5 19.5 30 17 Z"
        {...(is('Biceps') ? h : is('Triceps') ? d : b)} />

      {/* Triceps overlay (achterkant bovenarm) */}
      {is('Triceps') && (
        <>
          <path d="M7.5 16.5 Q5.5 20 6 24 L8 24 Q8 20 10 17.5 Z"
            fill={color} stroke={color} strokeWidth={0.4} opacity={0.9} />
          <path d="M32.5 16.5 Q34.5 20 34 24 L32 24 Q32 20 30 17.5 Z"
            fill={color} stroke={color} strokeWidth={0.4} opacity={0.9} />
        </>
      )}

      {/* Onderarm links — Forearms */}
      <path d="M5 24 Q3.5 29 4.5 33 L7.5 33 Q7.5 29 8 24 Z"
        {...(is('Forearms') ? h : b)} />
      {/* Onderarm rechts */}
      <path d="M35 24 Q36.5 29 35.5 33 L32.5 33 Q32.5 29 32 24 Z"
        {...(is('Forearms') ? h : b)} />

      {/* Borst */}
      <path d="M12 13 Q12 21 16 22.5 L20 23 L24 22.5 Q28 21 28 13 Q24 11.5 20 11.5 Q16 11.5 12 13 Z"
        {...(is('Borst') ? h : b)} />

      {/* Rug / Lat overlay */}
      {is('Rug') && (
        <path d="M11.5 13 Q11 21 13.5 24 L20 25 L26.5 24 Q29 21 28.5 13 Q24 11 20 11 Q16 11 11.5 13 Z"
          fill={color} stroke={color} strokeWidth={0.5} opacity={0.85} />
      )}

      {/* Buik / core */}
      <path d="M15 23 L14 36 L20 37 L26 36 L25 23 L20 24 Z"
        {...(is('Cardio') ? { fill: '#4AE86B22', stroke: STROKE, strokeWidth: 0.8 } : b)} />

      {/* Cardio hartslag-lijn overlay */}
      {is('Cardio') && (
        <polyline
          points="12,29 15,29 17,25 19,34 21,27 23,29 28,29"
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
      )}

      {/* Heup */}
      <path d="M14 36 L13 40 L27 40 L26 36 Z" {...b} />

      {/* Bovenbeen links */}
      <path d="M13 40 Q11 46 12 52 L17 52 Q17 46 16 40 Z"
        {...(is('Benen') ? h : b)} />
      {/* Bovenbeen rechts */}
      <path d="M27 40 Q29 46 28 52 L23 52 Q23 46 24 40 Z"
        {...(is('Benen') ? h : b)} />

      {/* Onderbeen links */}
      <path d="M12 52 Q11.5 56 12.5 59 L16.5 59 Q17 56 17 52 Z"
        {...(is('Benen') ? { ...h, opacity: 0.6 } : b)} />
      {/* Onderbeen rechts */}
      <path d="M28 52 Q28.5 56 27.5 59 L23.5 59 Q23 56 23 52 Z"
        {...(is('Benen') ? { ...h, opacity: 0.6 } : b)} />
    </svg>
  )
}

const MG_COLORS = {
  Borst: '#3E7CB1', Rug: '#22C55E', Schouders: '#D9A441', Biceps: '#FF4B3E',
  Triceps: '#8B5CF6', Benen: '#EC4899', Forearms: '#F97316', Cardio: '#14B8A6',
  Overig: '#9499A1',
}

const AXIS_STYLE = { fill: '#9499A1', fontSize: 11, fontFamily: 'JetBrains Mono' }
const GRID_COLOR = '#24272C'

const PERIODS = [
  { label: '4 wk', value: '4w', days: 28 },
  { label: '8 wk', value: '8w', days: 56 },
  { label: '12 wk', value: '12w', days: 84 },
  { label: 'Alles', value: 'all', days: null },
]

const MONTHS_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return `${day} ${MONTHS_NL[m - 1]} ${y}`
}

function fmtShort(d) {
  if (!d) return ''
  const [, m, day] = d.slice(0, 10).split('-').map(Number)
  return `${day} ${MONTHS_NL[m - 1]}`
}

function e1rm(w, r) {
  return r > 0 && r <= 12 ? Math.round(w * (1 + r / 30) * 10) / 10 : null
}

// ─── PR Trophy Shelf ─────────────────────────────────────────────────────────

function PrCard({ label, value, sub, isRecent, icon, accentColor }) {
  const color = isRecent ? '#FFB800' : (accentColor ?? 'var(--color-text-secondary)')
  return (
    <div
      className="flex-1 rounded-xl p-3 flex flex-col gap-1 min-w-0"
      style={{
        background: isRecent
          ? 'linear-gradient(135deg, rgba(255,196,0,0.08), rgba(255,140,0,0.05))'
          : 'var(--color-card)',
        border: isRecent ? '1px solid rgba(255,184,0,0.28)' : '1px solid var(--color-border-subtle)',
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <i className={`ti ti-${icon}`} style={{ fontSize: 10, color, opacity: 0.8 }} />
          <span
            className="font-[var(--font-mono)] text-[8px] uppercase tracking-widest truncate"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {label}
          </span>
        </div>
        {isRecent && (
          <span
            className="font-[var(--font-mono)] text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: 'rgba(255,184,0,0.18)', color: '#FFB800' }}
          >
            ★ nieuw
          </span>
        )}
      </div>
      <span
        className="font-[var(--font-display)] font-semibold text-lg leading-none"
        style={{ color: isRecent ? '#FFB800' : 'var(--color-text-primary)' }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="font-[var(--font-mono)] text-[9px] leading-snug truncate"
          style={{ color: isRecent ? 'rgba(255,184,0,0.7)' : 'var(--color-text-secondary)' }}
        >
          {sub}
        </span>
      )}
    </div>
  )
}

function PrTrophyShelf({ prs, accentColor }) {
  if (!prs) return null
  const { oneRepMax, repPr, volumePr } = prs
  if (!oneRepMax && !repPr && !volumePr) return null

  return (
    <div className="flex gap-2.5">
      <PrCard
        label="Geschat 1RM"
        value={oneRepMax ? `${oneRepMax.value} kg` : '—'}
        sub={oneRepMax ? `${oneRepMax.weight_kg} kg × ${oneRepMax.reps} · ${fmtShort(oneRepMax.date)}` : null}
        isRecent={oneRepMax?.isRecent ?? false}
        icon="trophy"
        accentColor={accentColor}
      />
      <PrCard
        label="Rep-PR"
        value={repPr ? `${repPr.reps} reps` : '—'}
        sub={repPr ? `@ ${repPr.weight_kg} kg · ${fmtShort(repPr.date)}` : null}
        isRecent={repPr?.isRecent ?? false}
        icon="repeat"
        accentColor={accentColor}
      />
      <PrCard
        label="Volume-PR"
        value={volumePr ? `${volumePr.value.toLocaleString('nl-NL')} kg` : '—'}
        sub={volumePr ? fmtDate(volumePr.date) : null}
        isRecent={volumePr?.isRecent ?? false}
        icon="chart-bar"
        accentColor={accentColor}
      />
    </div>
  )
}

// ─── Chart tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, suffix }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-[var(--color-bg)] border border-[#2A2D31] rounded-lg px-3 py-1.5 shadow-xl">
      <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">{p.label}</p>
      <p className="font-[var(--font-mono)] text-sm text-[var(--color-text-primary)]">{payload[0].value}{suffix}</p>
    </div>
  )
}

function ExerciseChart({ title, data, dataKey, suffix, color }) {
  return (
    <div className="surface rounded-xl p-4">
      <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)] mb-3">{title}</p>
      {data.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)] font-[var(--font-body)]">Geen data voor deze periode.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
            <YAxis
              tick={AXIS_STYLE} axisLine={false} tickLine={false} width={36}
              domain={[dataMin => Math.max(0, dataMin - Math.ceil(dataMin * 0.05)), dataMax => dataMax + Math.ceil(dataMax * 0.03)]}
              tickFormatter={(v) => Math.round(v)}
            />
            <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ stroke: '#2A2D31' }} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2}
              dot={{ r: 3.5, fill: color, stroke: 'none' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Statistics tab ───────────────────────────────────────────────────────────

function StatisticsTab({ sessions, period, onPeriodChange, accentColor }) {
  const cutoff = useMemo(() => {
    const p = PERIODS.find(x => x.value === period)
    if (!p?.days) return null
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - p.days)
    return d.toISOString().slice(0, 10)
  }, [period])

  const filtered = cutoff ? sessions.filter(s => s.date >= cutoff) : sessions
  const color = accentColor ?? '#3E7CB1'

  const weightData = filtered.map(s => ({ label: fmtShort(s.date), value: s.heaviest }))
  const e1rmData = filtered.filter(s => s.best1rm !== null).map(s => ({ label: fmtShort(s.date), value: s.best1rm }))
  const volData = filtered.map(s => ({ label: fmtShort(s.date), value: s.volume }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => onPeriodChange(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-[var(--font-body)] transition-all ${
              period === p.value
                ? 'text-white shadow-[0_2px_8px_-2px_rgba(255,75,62,0.4)]'
                : 'bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
            style={period === p.value ? { background: color } : {}}
          >{p.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ExerciseChart title="Zwaarst gewicht" data={weightData} dataKey="value" suffix=" kg" color={color} />
        <ExerciseChart title="Geschat 1RM (Epley)" data={e1rmData} dataKey="value" suffix=" kg" color="#FF4B3E" />
        <ExerciseChart title="Set volume per sessie" data={volData} dataKey="value" suffix=" kg" color="#22C55E" />
      </div>
    </div>
  )
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ sessions }) {
  if (!sessions.length) {
    return <p className="text-[var(--color-text-secondary)] text-sm font-[var(--font-body)]">Geen sessies gevonden.</p>
  }

  const sessionsWithDelta = sessions.map((s, i) => {
    if (i === 0) return { ...s, volumeDelta: null }
    const prev = sessions[i - 1]
    return { ...s, volumeDelta: s.volume - prev.volume }
  })

  return (
    <div className="flex flex-col gap-3">
      {[...sessionsWithDelta].reverse().map(s => {
        const normalSets = s.sets.filter(x => x.set_type === 'normal' && x.weight_kg != null && x.reps != null)
        const deltaColor = s.volumeDelta == null ? null : s.volumeDelta > 0 ? '#22C55E' : s.volumeDelta < 0 ? '#FF4B3E' : '#9499A1'
        const deltaLabel = s.volumeDelta == null ? null : `${s.volumeDelta > 0 ? '↑' : s.volumeDelta < 0 ? '↓' : '='} ${Math.abs(s.volumeDelta)} kg`
        return (
          <div key={s.date} className="surface rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="font-[var(--font-body)] text-sm font-medium text-[var(--color-text-primary)]">{fmtDate(s.date)}</p>
                {deltaLabel && (
                  <span className="font-[var(--font-mono)] text-xs" style={{ color: deltaColor }}>{deltaLabel}</span>
                )}
              </div>
              <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                {normalSets.length} sets · {s.volume} kg
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {normalSets.map((set, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] w-5 text-right shrink-0">{i + 1}</span>
                  <span className="font-[var(--font-mono)] text-sm text-[var(--color-text-primary)]">
                    {set.weight_kg} kg × {set.reps}
                  </span>
                  {set.rpe != null && (
                    <span className={`font-[var(--font-mono)] text-xs px-2 py-0.5 rounded-md ${
                      set.rpe >= 9 ? 'bg-[#FF4B3E]/15 text-[#FF4B3E]'
                      : set.rpe >= 8 ? 'bg-[#D9A441]/15 text-[#D9A441]'
                      : 'bg-[#22C55E]/15 text-[#22C55E]'
                    }`}>RPE {set.rpe}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Muscle group mapping tab ─────────────────────────────────────────────────

function MappingTab({ exercise, mappings, onReload }) {
  const [newGroup, setNewGroup] = useState(MUSCLE_GROUPS[0])
  const [newContrib, setNewContrib] = useState('1.0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const realMappings = mappings.filter(m => m.muscle_group !== 'Ongecategoriseerd')
  const isUncat = realMappings.length === 0

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const hasPlaceholder = mappings.length === 1 && mappings[0].muscle_group === 'Ongecategoriseerd'
    if (hasPlaceholder) {
      const { error: delErr } = await supabase.from('exercise_muscle_groups').delete().eq('id', mappings[0].id)
      if (delErr) { setError(delErr.message); setSaving(false); return }
    }
    const { error: insErr } = await supabase.from('exercise_muscle_groups').insert({
      exercise_title: exercise, muscle_group: newGroup, contribution: Number(newContrib),
    })
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    onReload()
  }

  async function handleRemove(id) {
    await supabase.from('exercise_muscle_groups').delete().eq('id', id)
    onReload()
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <div className="surface rounded-xl p-4">
        <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)] mb-3">Huidige koppelingen</p>
        {isUncat ? (
          <p className="text-sm text-[#D9A441] font-[var(--font-body)]">
            Nog ongecategoriseerd — voeg hieronder een spiergroep toe.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {realMappings.map(m => {
              const color = MG_COLORS[m.muscle_group] ?? '#9499A1'
              return (
                <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{ background: `${color}18`, border: `1px solid ${color}35` }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm font-[var(--font-body)] text-[var(--color-text-primary)]">{m.muscle_group}</span>
                  <span className="text-xs font-[var(--font-mono)] text-[var(--color-text-secondary)]">
                    {m.contribution === 1 ? 'primair' : '0.5×'}
                  </span>
                  <button onClick={() => handleRemove(m.id)}
                    className="text-[var(--color-text-secondary)] hover:text-[#FF4B3E] transition-colors ml-0.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="surface rounded-xl p-4">
        <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)] mb-3">Koppeling toevoegen</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">Spiergroep</label>
            <select value={newGroup} onChange={e => setNewGroup(e.target.value)}
              className="bg-[var(--color-bg)] text-[var(--color-text-primary)] rounded-lg px-3 py-2 text-sm outline-none border border-[#2A2D31] focus:border-[var(--color-accent)] font-[var(--font-body)]">
              {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">Rol</label>
            <select value={newContrib} onChange={e => setNewContrib(e.target.value)}
              className="bg-[var(--color-bg)] text-[var(--color-text-primary)] rounded-lg px-3 py-2 text-sm outline-none border border-[#2A2D31] focus:border-[var(--color-accent)] font-[var(--font-body)]">
              <option value="1.0">Primair (1.0×)</option>
              <option value="0.5">Secundair (0.5×)</option>
            </select>
          </div>
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--color-accent)] text-white font-[var(--font-body)] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
            {saving ? 'Opslaan…' : 'Toevoegen'}
          </button>
        </form>
        {error && <p className="text-xs text-[#FF4B3E] mt-2 font-[var(--font-body)]">{error}</p>}
      </div>
    </div>
  )
}

// ─── Exercise detail panel ────────────────────────────────────────────────────

function ExerciseDetailPanel({ exercise, mappings, exerciseSets, prs, onReload }) {
  const [tab, setTab] = useState('statistics')
  const [period, setPeriod] = useState('12w')

  const sessions = useMemo(() => {
    if (!exerciseSets) return []
    const byDate = new Map()
    for (const s of exerciseSets) {
      if (!s.start_date) continue
      const date = s.start_date.slice(0, 10)
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date).push(s)
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sets]) => {
        const normal = sets.filter(s => s.set_type === 'normal' && s.weight_kg != null && s.reps != null)
        const heaviest = normal.length ? Math.max(...normal.map(s => s.weight_kg)) : 0
        const best1rm = normal.reduce((best, s) => {
          const est = e1rm(s.weight_kg, s.reps)
          return est && est > (best ?? 0) ? est : best
        }, null)
        const volume = Math.round(normal.reduce((sum, s) => sum + s.weight_kg * s.reps, 0))
        return { date, sets: sets.sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0)), heaviest, best1rm, volume }
      })
  }, [exerciseSets])

  const bestSet = useMemo(() => {
    if (!exerciseSets?.length) return null
    const normal = exerciseSets.filter(s => s.set_type === 'normal' && s.weight_kg != null && s.reps != null)
    if (!normal.length) return null
    const maxW = Math.max(...normal.map(s => s.weight_kg))
    return normal.filter(s => s.weight_kg === maxW).reduce((best, s) => !best || s.reps > best.reps ? s : best)
  }, [exerciseSets])

  const primaryMGs = mappings.filter(m => m.contribution === 1 && m.muscle_group !== 'Ongecategoriseerd')
  const secondaryMGs = mappings.filter(m => m.contribution < 1 && m.muscle_group !== 'Ongecategoriseerd')
  const isUncat = primaryMGs.length === 0 && secondaryMGs.length === 0
  const accentColor = primaryMGs.length > 0 ? (MG_COLORS[primaryMGs[0].muscle_group] ?? '#3E7CB1') : '#3E7CB1'

  const DETAIL_TABS = [
    { id: 'statistics', label: 'Statistieken' },
    { id: 'history', label: 'Historie' },
    { id: 'mapping', label: 'Spiergroepen' },
  ]

  const hasPRs = prs && (prs.oneRepMax || prs.repPr || prs.volumePr)

  return (
    <div className="flex flex-col">

      {/* Gekleurde accentbalk + header */}
      <div
        className="px-6 pt-5 pb-4"
        style={{ borderTop: `3px solid ${accentColor}` }}
      >
        <h2 className="font-[var(--font-display)] font-bold text-2xl text-[var(--color-text-primary)] tracking-tight leading-tight mb-2">
          {exercise}
        </h2>

        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {primaryMGs.map(m => {
            const color = MG_COLORS[m.muscle_group] ?? '#9499A1'
            return (
              <span key={m.id} className="px-2.5 py-0.5 rounded-full text-xs font-[var(--font-body)] font-medium"
                style={{ background: `${color}25`, color }}>
                {m.muscle_group}
              </span>
            )
          })}
          {secondaryMGs.map(m => {
            const color = MG_COLORS[m.muscle_group] ?? '#9499A1'
            return (
              <span key={m.id} className="px-2.5 py-0.5 rounded-full text-xs font-[var(--font-body)]"
                style={{ background: `${color}12`, color }}>
                {m.muscle_group} · sec
              </span>
            )
          })}
          {isUncat && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-[var(--font-body)] bg-[#D9A441]/15 text-[#D9A441]">
              Ongecategoriseerd
            </span>
          )}
        </div>

        {bestSet && (
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#D9A441">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
              Zwaarst getild:{' '}
              <span className="text-[var(--color-text-primary)]">{bestSet.weight_kg} kg × {bestSet.reps}</span>
              <span className="mx-1.5 opacity-40">·</span>
              {fmtDate(bestSet.start_date)}
            </p>
          </div>
        )}
      </div>

      {/* PR Trophy Shelf */}
      {(hasPRs || prs === null) && (
        <div
          className="px-6 py-4"
          style={{ borderTop: '1px solid var(--color-border-subtle)', borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          {prs === null ? (
            <div className="flex gap-2.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex-1 h-16 rounded-xl bg-[var(--color-card)] animate-pulse" />
              ))}
            </div>
          ) : (
            <PrTrophyShelf prs={prs} accentColor={accentColor} />
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#2A2D31] px-6">
        {DETAIL_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-[var(--font-body)] transition-colors relative ${
              tab === t.id ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}>
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full" style={{ background: accentColor }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-6 py-5">
        {exerciseSets === null ? (
          <p className="text-[var(--color-text-secondary)] text-sm font-[var(--font-mono)]">Laden…</p>
        ) : (
          <>
            {tab === 'statistics' && (
              <StatisticsTab sessions={sessions} period={period} onPeriodChange={setPeriod} accentColor={accentColor} />
            )}
            {tab === 'history' && <HistoryTab sessions={sessions} />}
            {tab === 'mapping' && <MappingTab exercise={exercise} mappings={mappings} onReload={onReload} />}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ExerciseLibrary({ initialExercise, onResetInitialExercise }) {
  const [exercises, setExercises] = useState(null)
  const [mappings, setMappings] = useState(null)
  const [selected, setSelected] = useState(null)
  const [exerciseSets, setExerciseSets] = useState(null)
  const [exercisePRs, setExercisePRs] = useState(null)
  const [filterGroup, setFilterGroup] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('naam')
  const [maxE1rmMap, setMaxE1rmMap] = useState(new Map())
  const [mostRecentMap, setMostRecentMap] = useState(new Map())

  async function loadLibrary() {
    const [
      { data: sets, error: sErr },
      { data: maps, error: mErr },
      { data: workouts, error: wErr },
    ] = await Promise.all([
      supabase.from('sets').select('exercise_title, weight_kg, reps, set_type, workout_id'),
      supabase.from('exercise_muscle_groups').select('id, exercise_title, muscle_group, contribution'),
      supabase.from('workouts').select('id, start_date'),
    ])
    if (sErr) { setError(sErr.message); return }
    if (mErr) { setError(mErr.message); return }
    if (wErr) { setError(wErr.message); return }

    const dateById = new Map(workouts.map(w => [w.id, w.start_date]))
    const e1rmMap = new Map()
    const recentMap = new Map()
    for (const s of sets) {
      if (s.set_type === 'normal' && s.weight_kg != null && s.reps != null) {
        const est = e1rm(s.weight_kg, s.reps)
        if (est) {
          const cur = e1rmMap.get(s.exercise_title) ?? 0
          if (est > cur) e1rmMap.set(s.exercise_title, est)
        }
      }
      const date = dateById.get(s.workout_id)
      if (date) {
        const cur = recentMap.get(s.exercise_title) ?? ''
        if (date > cur) recentMap.set(s.exercise_title, date)
      }
    }

    setExercises([...new Set(sets.map(s => s.exercise_title))].sort())
    setMappings(maps)
    setMaxE1rmMap(e1rmMap)
    setMostRecentMap(recentMap)
  }

  useEffect(() => { loadLibrary() }, [])

  useEffect(() => {
    if (!initialExercise || !exercises) return
    const title = exercises.find((e) => e === initialExercise)
    if (title) {
      handleSelect(title)
      onResetInitialExercise?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExercise, exercises])

  async function loadSetsFor(exerciseTitle) {
    setExerciseSets(null)
    setExercisePRs(null)
    const [[{ data: workouts, error: wErr }, { data: setsData, error: sErr }], prs] = await Promise.all([
      Promise.all([
        supabase.from('workouts').select('id, start_date'),
        supabase.from('sets')
          .select('workout_id, weight_kg, reps, rpe, set_index, set_type')
          .eq('exercise_title', exerciseTitle),
      ]),
      calculatePRsForExercise(exerciseTitle).catch(() => null),
    ])
    if (wErr || sErr) return
    const dateById = new Map(workouts.map(w => [w.id, w.start_date]))
    setExerciseSets(setsData.map(s => ({ ...s, start_date: dateById.get(s.workout_id) })))
    setExercisePRs(prs)
  }

  function handleSelect(title) {
    setSelected(title)
    loadSetsFor(title)
  }

  const mappingsByExercise = useMemo(() => {
    const map = new Map()
    if (!mappings) return map
    for (const m of mappings) {
      if (!map.has(m.exercise_title)) map.set(m.exercise_title, [])
      map.get(m.exercise_title).push(m)
    }
    return map
  }, [mappings])

  const filteredExercises = useMemo(() => {
    if (!exercises) return []
    const filtered = exercises.filter(title => {
      const maps = mappingsByExercise.get(title) ?? []
      const isUncat = maps.length === 0 || (maps.length === 1 && maps[0].muscle_group === 'Ongecategoriseerd')
      if (filterGroup === 'Ongecategoriseerd') { if (!isUncat) return false }
      else if (filterGroup !== 'all') { if (!maps.some(m => m.muscle_group === filterGroup)) return false }
      if (search.trim() && !title.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
    if (sortBy === 'e1rm') {
      return [...filtered].sort((a, b) => (maxE1rmMap.get(b) ?? 0) - (maxE1rmMap.get(a) ?? 0))
    }
    if (sortBy === 'recent') {
      return [...filtered].sort((a, b) => {
        const da = mostRecentMap.get(a) ?? ''
        const db = mostRecentMap.get(b) ?? ''
        return db.localeCompare(da)
      })
    }
    return filtered
  }, [exercises, mappingsByExercise, filterGroup, search, sortBy, maxE1rmMap, mostRecentMap])

  const selectedMappings = selected ? (mappingsByExercise.get(selected) ?? []) : []

  if (error) return <p className="text-[#FF4B3E] p-6 font-[var(--font-body)]">Fout: {error}</p>

  return (
    <div className="flex" style={{ height: 'calc(100vh - 6.5rem)' }}>

      {/* Left: detail view — verborgen op mobiel als niks geselecteerd */}
      <div className={`flex-1 overflow-y-auto min-w-0 flex flex-col ${selected ? '' : 'hidden sm:flex'}`}>
        {/* Terugknop op mobiel */}
        {selected && (
          <div className="sm:hidden flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border-subtle)] sticky top-0 z-10 bg-[var(--color-bg)]">
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]"
            >
              <i className="ti ti-arrow-left" style={{ fontSize: 16 }} />
              Bibliotheek
            </button>
            <span className="font-medium text-sm text-[var(--color-text-primary)] truncate">{selected}</span>
          </div>
        )}
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-1"
              style={{ background: 'var(--color-card)', border: '1px solid var(--color-border-subtle)' }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#9499A1" strokeWidth="1.5" strokeLinecap="round">
                <path d="M6 4v16M18 4v16M3 8h4M17 8h4M3 16h4M17 16h4" />
              </svg>
            </div>
            <div>
              <p className="font-[var(--font-display)] text-xl text-[var(--color-text-primary)] font-semibold mb-1">
                Kies een oefening
              </p>
              <p className="text-sm text-[var(--color-text-secondary)] font-[var(--font-body)] max-w-xs leading-relaxed">
                Selecteer een oefening uit de lijst om PRs, statistieken en historie te bekijken.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {MUSCLE_GROUPS.slice(0, 6).map(g => (
                <button
                  key={g}
                  onClick={() => setFilterGroup(g)}
                  className="px-3 py-1.5 rounded-full text-xs font-[var(--font-body)] transition-all"
                  style={{
                    background: `${MG_COLORS[g]}18`,
                    color: MG_COLORS[g],
                    border: `1px solid ${MG_COLORS[g]}35`,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ExerciseDetailPanel
            key={selected}
            exercise={selected}
            mappings={selectedMappings}
            exerciseSets={exerciseSets}
            prs={exercisePRs}
            onReload={loadLibrary}
          />
        )}
      </div>

      {/* Right: library panel — verborgen op mobiel als een oefening geselecteerd is */}
      <div
        className={`shrink-0 flex flex-col sm:border-l sm:border-[#2A2D31] ${selected ? 'hidden sm:flex sm:w-[280px]' : 'flex w-full sm:w-[280px]'}`}
      >
        {/* Header */}
        <div
          className="p-4 flex flex-col gap-2.5"
          style={{ borderBottom: '1px solid #2A2D31' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-[var(--font-display)] font-semibold text-[var(--color-text-primary)]">Bibliotheek</h3>
            {exercises && (
              <span
                className="font-[var(--font-mono)] text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: 'var(--color-card)', color: 'var(--color-text-secondary)' }}
              >
                {filteredExercises.length}
              </span>
            )}
          </div>
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            className="w-full bg-[var(--color-card)] text-[var(--color-text-primary)] rounded-lg px-3 py-2 text-xs outline-none border border-[#2A2D31] focus:border-[var(--color-accent)] font-[var(--font-body)]"
          >
            <option value="all">Alle spiergroepen</option>
            {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            <option value="Ongecategoriseerd">Ongecategoriseerd</option>
          </select>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9499A1" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Zoek oefening…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[var(--color-card)] text-[var(--color-text-primary)] rounded-lg pl-8 pr-3 py-2 text-xs outline-none border border-[#2A2D31] focus:border-[var(--color-accent)] font-[var(--font-body)] placeholder:text-[var(--color-text-secondary)]"
            />
          </div>
          <div className="flex gap-1">
            {[{ key: 'naam', label: 'A–Z' }, { key: 'e1rm', label: '1RM' }, { key: 'recent', label: 'Recent' }].map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className="flex-1 py-1 rounded-lg text-[10px] font-[var(--font-mono)] transition-all border"
                style={{
                  background:  sortBy === opt.key ? 'var(--color-accent)' : 'transparent',
                  color:       sortBy === opt.key ? '#fff' : 'var(--color-text-secondary)',
                  borderColor: sortBy === opt.key ? 'var(--color-accent)' : 'var(--color-border)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise list */}
        <div className="overflow-y-auto flex-1">
          {!exercises ? (
            <p className="text-[var(--color-text-secondary)] text-sm font-[var(--font-mono)] p-4">Laden…</p>
          ) : filteredExercises.length === 0 ? (
            <p className="text-[var(--color-text-secondary)] text-sm font-[var(--font-body)] p-4">Geen oefeningen gevonden.</p>
          ) : (
            <ul className="divide-y divide-[#1E2125]">
              {filteredExercises.map(title => {
                const maps = mappingsByExercise.get(title) ?? []
                const primary = maps.find(m => m.contribution === 1 && m.muscle_group !== 'Ongecategoriseerd')
                const isUncat = maps.length === 0 || (maps.length === 1 && maps[0].muscle_group === 'Ongecategoriseerd')
                const isActive = selected === title
                const primaryColor = primary ? (MG_COLORS[primary.muscle_group] ?? '#9499A1') : null
                return (
                  <li key={title}>
                    <button
                      onClick={() => handleSelect(title)}
                      className={`w-full text-left px-3 py-2.5 transition-all flex items-center gap-2.5 ${
                        isActive
                          ? 'bg-[var(--color-accent)]/10'
                          : 'hover:bg-[var(--color-card)]'
                      }`}
                      style={{
                        borderLeft: isActive
                          ? `3px solid var(--color-accent)`
                          : primaryColor
                          ? `3px solid ${primaryColor}50`
                          : '3px solid transparent',
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center overflow-hidden"
                        style={{
                          background: primaryColor ? `${primaryColor}18` : '#2A2D31',
                          border: primaryColor ? `1px solid ${primaryColor}30` : '1px solid #2A2D31',
                        }}
                      >
                        <BodyIcon
                          muscle={primary?.muscle_group ?? 'Ongecategoriseerd'}
                          color={primaryColor ?? '#9499A1'}
                          size={26}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-[var(--font-body)] truncate leading-tight ${
                          isActive ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-primary)]'
                        }`}>{title}</p>
                        <p
                          className="text-[10px] font-[var(--font-body)] mt-0.5 truncate"
                          style={{ color: isUncat ? '#D9A441' : (primaryColor ?? '#9499A1') }}
                        >
                          {isUncat ? 'Ongecategoriseerd' : (primary?.muscle_group ?? '')}
                        </p>
                      </div>
                      {isUncat && <span className="w-1.5 h-1.5 rounded-full bg-[#D9A441] shrink-0" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

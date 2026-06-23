// src/components/VolumeDashboard.jsx  —  Statistics tab

import { useEffect, useState } from 'react'
import { fetchStatsForPeriod } from '../lib/statsData'

// ─── Constanten ───────────────────────────────────────────────────────────────

const PERIODS = [
  { weeks: 1,  label: 'Deze week' },
  { weeks: 4,  label: 'Laatste 4 weken' },
  { weeks: 8,  label: 'Laatste 8 weken' },
  { weeks: 12, label: 'Laatste 12 weken' },
  { weeks: 0,  label: 'All time' },
]

const MG_COLORS = {
  borst:     '#3E7CB1',
  rug:       '#22C55E',
  schouders: '#D9A441',
  bicep:     '#FF4B3E',
  tricep:    '#8B5CF6',
  benen:     '#EC4899',
  buik:      '#14B8A6',
  billen:    '#F97316',
  overig:    '#9499A1',
}

const METRIC_DEFS = [
  { key: 'volumeKg', label: 'Volume', unit: 'kg',   fmt: v => v.toLocaleString('nl-NL') },
  { key: 'setCount', label: 'Sets',   unit: 'sets', fmt: v => `${Math.round(v)}` },
  { key: 'repCount', label: 'Reps',   unit: 'reps', fmt: v => v.toLocaleString('nl-NL') },
  { key: 'avgRpe',   label: 'RPE',    unit: '',     fmt: v => v != null ? `${v}` : '—' },
]

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function formatKg(v) {
  return Math.round(v ?? 0).toLocaleString('nl-NL')
}

function formatDuration(minutes) {
  if (!minutes || minutes < 1) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}u`
  return `${h}u ${m}m`
}

function getMgColor(mg) {
  return MG_COLORS[mg?.toLowerCase()] ?? '#3E7CB1'
}

// ─── Periode selector ─────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="font-[var(--font-mono)] text-[11px] pl-3 pr-7 py-1.5 rounded-lg cursor-pointer transition-colors"
        style={{
          appearance: 'none',
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
          outline: 'none',
        }}
      >
        {PERIODS.map(p => (
          <option key={p.weeks} value={p.weeks}>{p.label}</option>
        ))}
      </select>
      <i
        className="ti ti-chevron-down"
        style={{
          position: 'absolute', right: 8, fontSize: 11,
          color: 'var(--color-text-secondary)', pointerEvents: 'none',
        }}
      />
    </div>
  )
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ icon, label, value, color }) {
  return (
    <div className="surface-flat rounded-xl px-plate-2 py-plate-2 flex-1 min-w-0">
      <div className="flex items-center gap-1 mb-1">
        {icon && (
          <i className={`ti ti-${icon}`}
            style={{ fontSize: 10, color: color ?? 'var(--color-text-secondary)', opacity: 0.75 }} />
        )}
        <p className="font-[var(--font-mono)] text-[8px] uppercase tracking-widest"
          style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </p>
      </div>
      <p className="font-[var(--font-display)] font-semibold text-base leading-none"
        style={{ color: color ?? 'var(--color-text-primary)' }}>
        {value}
      </p>
    </div>
  )
}

// ─── Metric selector knoppenrij ───────────────────────────────────────────────

function MetricSelector({ metrics, value, onChange, accentColor = '#FF4B3E' }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {metrics.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className="font-[var(--font-mono)] text-[9px] px-2 py-0.5 rounded-full border transition-all"
          style={{
            background:  value === m.key ? accentColor : 'transparent',
            color:       value === m.key ? 'var(--color-bg)' : 'var(--color-text-secondary)',
            borderColor: value === m.key ? accentColor : 'var(--color-border)',
            fontWeight:  value === m.key ? 700 : 400,
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

// ─── Hero wekelijkse barchart ─────────────────────────────────────────────────
// Alleen huidige week (laatste balk) gearceerd. Geen groen voor beste week.
// Bij veel weken (all time): horizontaal scrollbaar, smalle balken.

function HeroWeeklyBars({ weeklyData, metric = 'volumeKg' }) {
  const values    = weeklyData.map(w => (w[metric] ?? 0))
  const max       = Math.max(...values, 1)
  const lastIdx   = weeklyData.length - 1
  const BAR_MAX   = 52
  const manyWeeks = weeklyData.length > 12

  return (
    <div
      style={{
        overflowX: manyWeeks ? 'auto' : 'visible',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        marginBottom: 'var(--spacing-plate-2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: manyWeeks ? 3 : 6,
          height: BAR_MAX + 24,
          minWidth: manyWeeks ? weeklyData.length * 12 : 'auto',
        }}
      >
        {weeklyData.map((w, i) => {
          const v      = values[i]
          const barH   = v > 0 ? Math.max(4, Math.round((v / max) * BAR_MAX)) : 0
          const isLast = i === lastIdx

          return (
            <div
              key={i}
              style={{
                width: manyWeeks ? 8 : undefined,
                flex:  manyWeeks ? undefined : 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-end',
                gap: 5, height: '100%',
              }}
            >
              <div
                style={{
                  width: '100%', height: barH, minHeight: v > 0 ? 4 : 0,
                  background: isLast ? '#FF4B3E' : '#FF4B3E50',
                  borderRadius: '3px 3px 0 0',
                }}
              />
              {/* Weeknummer label alleen tonen als er genoeg ruimte is */}
              {(!manyWeeks || isLast) && (
                <span
                  className="font-[var(--font-mono)] text-[8px] font-medium"
                  style={{
                    color:   isLast ? '#FF4B3E' : 'var(--color-text-secondary)',
                    opacity: isLast ? 1 : 0.5,
                    whiteSpace: 'nowrap',
                  }}
                >
                  W{w.weekNum}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Overall stats hero ───────────────────────────────────────────────────────

function OverallStatsHero({ overall, loading, weeksBack }) {
  const [heroMetric, setHeroMetric] = useState('volumeKg')
  const periodLabel = PERIODS.find(p => p.weeks === weeksBack)?.label ?? `${weeksBack} weken`

  if (loading || !overall) {
    return (
      <div className="surface-hero rounded-xl overflow-hidden">
        <div className="loaded-bar" style={{ '--load-pct': '0%' }} />
        <div className="px-plate-3 py-plate-3">
          <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
            {loading ? 'Laden…' : 'Geen trainingen gevonden in deze periode.'}
          </p>
        </div>
      </div>
    )
  }

  const { volumeKg, setCount, repCount, avgRpe, durationMin, weeklyData } = overall

  // loaded-bar = huidige week vs zwaarste week
  const maxWeekVol     = Math.max(...weeklyData.map(w => w.volumeKg), 1)
  const currentWeekVol = weeklyData[weeklyData.length - 1]?.volumeKg ?? 0
  const loadPct        = Math.min(100, Math.round((currentWeekVol / maxWeekVol) * 100))

  const heroMetrics = METRIC_DEFS.filter(m => {
    if (m.key === 'avgRpe') return avgRpe != null
    return true
  })

  return (
    <div className="surface-hero rounded-xl overflow-hidden" style={{ position: 'relative' }}>
      <div className="loaded-bar" style={{ '--load-pct': `${loadPct}%` }} />

      <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 10 }}>
        <i className="ti ti-chart-area-line"
          style={{ fontSize: 18, color: 'var(--color-accent)', opacity: 0.5 }} />
      </div>

      <div className="px-plate-3 pt-plate-3 pb-plate-3">

        {/* Header */}
        <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-plate-3 pr-8">
          Statistieken · {periodLabel}
        </p>

        {/* Primair volume — altijd zichtbaar als ankerpunt */}
        <div className="mb-plate-2">
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-[var(--font-display)] font-semibold leading-none"
              style={{ fontSize: 40, color: 'var(--color-text-primary)' }}
            >
              {formatKg(volumeKg)}
            </span>
            <span className="font-[var(--font-body)] text-sm text-[var(--color-text-secondary)]">kg</span>
          </div>
          <p className="font-[var(--font-mono)] text-[9px] uppercase tracking-wider text-[var(--color-text-secondary)] mt-1">
            totaal volume
          </p>
        </div>

        {/* Metric selector + wekelijkse barchart */}
        {weeklyData.length > 1 && (
          <>
            <div className="mb-plate-2">
              <MetricSelector
                metrics={heroMetrics}
                value={heroMetric}
                onChange={setHeroMetric}
                accentColor="#FF4B3E"
              />
            </div>
            <HeroWeeklyBars weeklyData={weeklyData} metric={heroMetric} />
          </>
        )}

        {/* Secundaire stat chips */}
        <div className="flex gap-1.5">
          <StatChip icon="repeat"  label="Sets"     value={Math.round(setCount).toLocaleString('nl-NL')} color="var(--color-data)" />
          <StatChip icon="barbell" label="Reps"     value={repCount.toLocaleString('nl-NL')} />
          {avgRpe != null && (
            <StatChip icon="gauge" label="RPE gem." value={avgRpe} color="var(--color-status-low)" />
          )}
          {durationMin > 0 && (
            <StatChip icon="clock" label="Duur"     value={formatDuration(durationMin)} />
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Mini SVG sparkline (spiergroep rijen) ───────────────────────────────────

function MiniSparkline({ weeklyData, color, height = 20, width = 52 }) {
  const values  = weeklyData.map(w => w.volumeKg ?? 0)
  const max     = Math.max(...values, 1)
  const n       = values.length
  const gap     = 2
  const barW    = Math.max(1, Math.floor((width - gap * (n - 1)) / n))
  const used    = barW * n + gap * (n - 1)
  const lastIdx = n - 1

  return (
    <svg width={used} height={height} style={{ flexShrink: 0, display: 'block' }}>
      {values.map((v, i) => {
        const barH = Math.max(2, Math.round((v / max) * height))
        const x    = i * (barW + gap)
        return (
          <rect
            key={i}
            x={x} y={height - barH}
            width={barW} height={barH}
            rx={1}
            fill={i === lastIdx ? color : `${color}80`}
          />
        )
      })}
    </svg>
  )
}

// ─── Wekelijkse barchart voor spiergroep uitklap ─────────────────────────────

function WeeklyBars({ weeklyData, metric, color }) {
  const values    = weeklyData.map(w => (w[metric] ?? 0))
  const max       = Math.max(...values, 1)
  const avg       = values.reduce((s, v) => s + v, 0) / values.length
  const metaDef   = METRIC_DEFS.find(m => m.key === metric)
  const BAR_MAX   = 64
  const showLabels = weeklyData.length <= 6

  return (
    <div>
      <p className="font-[var(--font-mono)] text-[8px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-plate-2">
        {metaDef?.label} per week
      </p>
      <div className="flex items-end gap-1.5">
        {weeklyData.map((w, i) => {
          const v      = w[metric] ?? 0
          const barH   = v > 0 ? Math.max(6, Math.round((v / max) * BAR_MAX)) : 0
          const isLast = i === weeklyData.length - 1
          const above  = v >= avg
          return (
            <div
              key={i}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-end',
                gap: 4, height: BAR_MAX + (showLabels ? 32 : 20),
              }}
            >
              {showLabels && v > 0 && (
                <span
                  className="font-[var(--font-mono)] text-[7px] leading-none whitespace-nowrap"
                  style={{ color: isLast ? color : 'var(--color-text-secondary)', opacity: isLast ? 1 : 0.6 }}
                >
                  {metaDef?.fmt(v)}
                </span>
              )}
              <div
                style={{
                  width: '100%', height: barH, minHeight: v > 0 ? 6 : 0,
                  background: isLast ? color : above ? `${color}80` : `${color}40`,
                  borderRadius: '3px 3px 0 0',
                }}
              />
              <span
                className="font-[var(--font-mono)] text-[8px]"
                style={{ color: isLast ? color : 'var(--color-text-secondary)', fontWeight: isLast ? 600 : 400 }}
              >
                {w.weekLabel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Spiergroep rij (opklapbaar) ─────────────────────────────────────────────

function MuscleGroupRow({ data, isSelected, onSelect }) {
  const [metric, setMetric] = useState('volumeKg')
  const { muscleGroup, volumeKg, setCount, repCount, avgRpe, weeklyData } = data
  const color = getMgColor(muscleGroup)

  const availMetrics = METRIC_DEFS.filter(m => {
    if (m.key === 'avgRpe') return avgRpe != null
    return true
  })

  return (
    <div className="surface rounded-xl overflow-hidden">

      <button
        onClick={onSelect}
        className="w-full text-left px-plate-3 py-plate-2 hover:brightness-110 transition-all"
      >
        <div className="flex items-center gap-plate-2">

          {/* Gekleurde balk links */}
          <div style={{ width: 3, height: 44, borderRadius: 2, background: color, flexShrink: 0 }} />

          {/* Naam + sets/reps/RPE */}
          <div className="flex-1 min-w-0">
            <p className="font-[var(--font-body)] text-sm font-medium text-[var(--color-text-primary)] capitalize">
              {muscleGroup}
            </p>
            <p className="font-[var(--font-mono)] text-[9px] text-[var(--color-text-secondary)] mt-0.5">
              {Math.round(setCount)} sets
              {' · '}{repCount.toLocaleString('nl-NL')} reps
              {avgRpe != null ? ` · RPE ${avgRpe}` : ''}
            </p>
          </div>

          {/* Volume + mini sparkline */}
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-[var(--font-mono)] text-[11px] font-semibold" style={{ color }}>
              {formatKg(volumeKg)} kg
            </span>
            <MiniSparkline weeklyData={weeklyData} color={color} />
          </div>

          {/* Chevron */}
          <i
            className={`ti ti-chevron-${isSelected ? 'up' : 'down'}`}
            style={{ fontSize: 13, color: 'var(--color-text-secondary)', flexShrink: 0 }}
          />
        </div>
      </button>

      {/* Uitgebreide detail */}
      {isSelected && (
        <div className="border-t border-[var(--color-border-subtle)] px-plate-3 pb-plate-3 pt-plate-2">

          <div className="flex gap-1.5 mb-plate-3">
            <StatChip label="Volume"   value={`${formatKg(volumeKg)} kg`}       color={color} />
            <StatChip label="Sets"     value={Math.round(setCount)}              color="var(--color-data)" />
            <StatChip label="Reps"     value={repCount.toLocaleString('nl-NL')} />
            {avgRpe != null && <StatChip label="RPE gem." value={avgRpe}         color="var(--color-status-low)" />}
          </div>

          <div className="mb-plate-2">
            <MetricSelector
              metrics={availMetrics}
              value={metric}
              onChange={setMetric}
              accentColor={color}
            />
          </div>

          <WeeklyBars weeklyData={weeklyData} metric={metric} color={color} />

        </div>
      )}
    </div>
  )
}

// ─── Spiergroep sectie ────────────────────────────────────────────────────────

function MuscleGroupSection({ byMuscleGroup }) {
  const [selected, setSelected] = useState(null)

  if (!byMuscleGroup.length) return null

  return (
    <div className="flex flex-col gap-plate-2">
      <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] tracking-tight">
        Per spiergroep
      </h3>
      <div className="flex flex-col gap-2">
        {byMuscleGroup.map(mg => (
          <MuscleGroupRow
            key={mg.muscleGroup}
            data={mg}
            isSelected={selected === mg.muscleGroup}
            onSelect={() => setSelected(selected === mg.muscleGroup ? null : mg.muscleGroup)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Hoofd export ─────────────────────────────────────────────────────────────

export default function VolumeDashboard() {
  const [weeksBack, setWeeksBack] = useState(4)
  const [stats,     setStats]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    setStats(null)
    fetchStatsForPeriod(weeksBack)
      .then(data => { setStats(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [weeksBack])

  if (error) {
    return (
      <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">
        Fout bij laden: {error}
      </p>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-plate-4 flex flex-col gap-plate-4">

      <div className="flex items-center justify-between">
        <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
          Statistics
        </h2>
        <PeriodSelector value={weeksBack} onChange={setWeeksBack} />
      </div>

      <OverallStatsHero overall={stats?.overall ?? null} loading={loading} weeksBack={weeksBack} />

      {!loading && stats && (
        <MuscleGroupSection byMuscleGroup={stats.byMuscleGroup} />
      )}

    </div>
  )
}

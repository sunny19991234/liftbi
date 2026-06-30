// src/components/VolumeDashboard.jsx  —  Statistics tab

import { useEffect, useState } from 'react'
import { fetchStatsForPeriod } from '../lib/statsData'
import { fetchDeloadWeeks } from '../lib/deloadData'
import { detectImbalances, calculateHitRate } from '../lib/imbalanceData'
import { fetchVolumeTargets, getWeekStart } from '../lib/dashboardQueries'
import { getTodayStr } from '../lib/calendarData'

// ─── Constanten ───────────────────────────────────────────────────────────────

const PERIODS = [
  { weeks: 1,  label: 'Deze week' },
  { weeks: -1, label: 'Vorige week' },
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

const WEEK_COLOR_PALETTE = [
  '#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#F472B6',
  '#2DD4BF', '#FB923C', '#818CF8', '#4ADE80', '#E879F9',
  '#38BDF8', '#FCA5A5', '#86EFAC', '#C4B5FD', '#FDE68A',
]

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

function addDaysVD(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDateShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00Z')
  const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
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

function HeroWeeklyBars({ weeklyData, metric = 'volumeKg', deloadWeekSet }) {
  const values    = weeklyData.map(w => (w[metric] ?? 0))
  const max       = Math.max(...values, 1)
  const lastIdx   = weeklyData.length - 1
  const BAR_MAX   = 52
  const manyWeeks = weeklyData.length > 12
  const metaDef   = METRIC_DEFS.find(m => m.key === metric)

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
          height: BAR_MAX + (manyWeeks ? 24 : 44),
          minWidth: manyWeeks ? weeklyData.length * 12 : 'auto',
        }}
      >
        {weeklyData.map((w, i) => {
          const v        = values[i]
          const barH     = v > 0 ? Math.max(4, Math.round((v / max) * BAR_MAX)) : 0
          const isLast   = i === lastIdx
          const isDeload = deloadWeekSet?.has(w.weekStart)

          const barColor = isDeload
            ? '#D9A441'
            : isLast
              ? '#60A5FA'
              : '#60A5FA66'
          const labelColor = isDeload ? '#D9A441' : isLast ? '#60A5FA' : '#60A5FA99'

          return (
            <div
              key={i}
              style={{
                width: manyWeeks ? 8 : undefined,
                flex:  manyWeeks ? undefined : 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-end',
                gap: 4, height: '100%',
              }}
            >
              {(!manyWeeks || isLast) && v > 0 && (
                <span
                  className="font-[var(--font-mono)] text-[7px] leading-none whitespace-nowrap"
                  style={{ color: barColor }}
                >
                  {metaDef?.fmt(v)}
                </span>
              )}
              <div
                style={{
                  width: '100%', height: barH, minHeight: v > 0 ? 4 : 0,
                  background: barColor,
                  borderRadius: '3px 3px 0 0',
                  boxShadow: isLast && !isDeload ? '0 0 8px -2px rgba(96,165,250,0.5)' : 'none',
                }}
              />
              {(!manyWeeks || isLast) && (
                <span
                  className="font-[var(--font-mono)] text-[8px]"
                  style={{
                    color: labelColor,
                    fontWeight: isLast ? 700 : 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isDeload && !manyWeeks ? '🌙' : isLast ? `W${w.weekNum} ◀` : `W${w.weekNum}`}
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

function OverallStatsHero({ overall, loading, weeksBack, deloadWeekSet }) {
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
      {weeklyData.length > 1 && (
        <p className="font-[var(--font-mono)] text-[8px] text-[var(--color-text-secondary)] px-plate-3 pt-1 pb-0 opacity-60">
          balk = huidige week vs beste week ({loadPct}%)
        </p>
      )}

      <div style={{ position: 'absolute', top: 12, right: 14, zIndex: 10 }}>
        <i className="ti ti-chart-area-line"
          style={{ fontSize: 18, color: 'var(--color-accent)', opacity: 0.5 }} />
      </div>

      <div className="px-plate-3 pt-plate-3 pb-plate-3">

        <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-plate-3 pr-8">
          Statistieken · {periodLabel}
        </p>

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
            <HeroWeeklyBars weeklyData={weeklyData} metric={heroMetric} deloadWeekSet={deloadWeekSet} />
          </>
        )}

        <div className="flex gap-1.5">
          <StatChip icon="repeat"  label="Sets"     value={Math.round(setCount).toLocaleString('nl-NL')} />
          <StatChip icon="barbell" label="Reps"     value={repCount.toLocaleString('nl-NL')} />
          {avgRpe != null && (
            <StatChip icon="gauge" label="RPE gem." value={avgRpe} />
          )}
          {durationMin > 0 && (
            <StatChip icon="clock" label="Duur"     value={formatDuration(durationMin)} />
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Wekelijkse barchart voor spiergroep uitklap ─────────────────────────────

function WeeklyBars({ weeklyData, metric, color, deloadWeekSet, targetMin, targetMax }) {
  const rawValues  = weeklyData.map(w => (w[metric] ?? 0))
  const showBand   = metric === 'setCount' && targetMin != null && targetMax != null
  const chartMax   = showBand
    ? Math.max(...rawValues, targetMax, 1)
    : Math.max(...rawValues, 1)
  const avg        = rawValues.reduce((s, v) => s + v, 0) / rawValues.length
  const metaDef    = METRIC_DEFS.find(m => m.key === metric)
  const BAR_MAX    = 64
  const showLabels = weeklyData.length <= 6

  const bandBottomPx = showBand ? (targetMin / chartMax) * BAR_MAX : 0
  const bandTopPx    = showBand ? (targetMax / chartMax) * BAR_MAX : 0
  const bandHeightPx = bandTopPx - bandBottomPx

  const TARGET_COLOR = '#F59E0B'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <p className="font-[var(--font-mono)] text-[8px] uppercase tracking-widest text-[var(--color-text-secondary)]">
          {metaDef?.label} per week
        </p>
        {showBand && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: TARGET_COLOR, opacity: 0.9 }}>
            target {targetMin}–{targetMax}
          </span>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        {showBand && (
          <div style={{
            position: 'absolute',
            bottom: `${bandBottomPx + 16}px`,
            left: 0,
            right: 0,
            height: `${Math.max(1, bandHeightPx)}px`,
            background: `${TARGET_COLOR}18`,
            borderTop: `1.5px dashed ${TARGET_COLOR}BB`,
            borderBottom: `1.5px dashed ${TARGET_COLOR}BB`,
            pointerEvents: 'none',
            zIndex: 1,
          }} />
        )}
        <div className="flex items-end gap-1.5" style={{ position: 'relative', zIndex: 2 }}>
          {weeklyData.map((w, i) => {
            const v        = rawValues[i]
            const barH     = v > 0 ? Math.max(6, Math.round((v / chartMax) * BAR_MAX)) : 0
            const isLast   = i === weeklyData.length - 1
            const above    = v >= avg
            const isDeload = deloadWeekSet?.has(w.weekStart)

            let barBg
            if (isDeload) {
              barBg = isLast ? '#D9A441' : '#D9A44180'
            } else if (showBand && v > 0) {
              if (v < targetMin)      barBg = isLast ? '#D9A441'  : '#D9A44180'
              else if (v > targetMax) barBg = isLast ? '#FF4B3E'  : '#FF4B3E80'
              else                    barBg = isLast ? color : above ? `${color}AA` : `${color}55`
            } else {
              barBg = isLast ? color : above ? `${color}AA` : `${color}55`
            }

            const labelColor = isDeload
              ? (isLast ? '#D9A441' : '#D9A44180')
              : isLast ? color : (above ? `${color}AA` : `${color}55`)

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
                    style={{ color: isDeload ? '#D9A441' : isLast ? color : 'var(--color-text-secondary)', opacity: isLast || isDeload ? 1 : 0.6 }}
                  >
                    {metaDef?.fmt(v)}
                  </span>
                )}
                <div
                  style={{
                    width: '100%', height: barH, minHeight: v > 0 ? 6 : 0,
                    background: barBg,
                    borderRadius: '3px 3px 0 0',
                  }}
                />
                <span
                  className="font-[var(--font-mono)] text-[8px]"
                  style={{ color: labelColor, fontWeight: isLast || isDeload ? 600 : 400 }}
                >
                  {isDeload ? '🌙' : w.weekLabel}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Spiergroep rij (opklapbaar) ─────────────────────────────────────────────

function MuscleGroupRow({ data, isSelected, onSelect, deloadWeekSet, weeksBack, target }) {
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

          <div style={{ width: 3, height: 44, borderRadius: 2, background: color, flexShrink: 0 }} />

          <div className="flex-1 min-w-0">
            <p className="font-[var(--font-body)] text-sm font-medium text-[var(--color-text-primary)] capitalize">
              {muscleGroup}
            </p>
            <p className="font-[var(--font-mono)] text-[9px] text-[var(--color-text-secondary)] mt-0.5">
              {Math.round(setCount)} sets
              {' · '}{repCount.toLocaleString('nl-NL')} reps
              {avgRpe != null ? ` · RPE ${avgRpe}` : ''}
            </p>
            {(weeksBack === 1 || weeksBack === -1) && target && (
              <div style={{ marginTop: 4, width: '100%' }}>
                <div style={{ background: 'var(--color-border)', height: 3, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, Math.round((setCount / target.max) * 100))}%`,
                    height: '100%',
                    borderRadius: 2,
                    background: setCount < target.min ? '#D9A441' : setCount > target.max ? '#FF4B3E' : color,
                    transition: 'width 0.4s ease-out',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: setCount < target.min ? '#D9A441' : setCount > target.max ? '#FF4B3E' : color }}>
                    {Math.round(setCount)} / {target.min}–{target.max} sets
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                    {setCount < target.min ? 'te weinig' : setCount > target.max ? 'te veel' : 'goed'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end">
            <span className="font-[var(--font-mono)] text-[11px] font-semibold" style={{ color }}>
              {formatKg(volumeKg)} kg
            </span>
          </div>

          <i
            className={`ti ti-chevron-down transition-transform duration-200 ${isSelected ? 'rotate-180' : ''}`}
            style={{ fontSize: 14, color: 'var(--color-text-secondary)', flexShrink: 0 }}
          />
        </div>
      </button>

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

          <WeeklyBars
            weeklyData={weeklyData}
            metric={metric}
            color={color}
            deloadWeekSet={deloadWeekSet}
            targetMin={metric === 'setCount' ? target?.min : undefined}
            targetMax={metric === 'setCount' ? target?.max : undefined}
          />

        </div>
      )}
    </div>
  )
}

// ─── Volume targets imbalance bar ────────────────────────────────────────────

function ImbalanceBar({ imbalances }) {
  if (!imbalances?.length) return null

  const statusColor = (status) => {
    if (status === 'low')  return '#D9A441'
    if (status === 'high') return 'var(--color-accent)'
    return 'var(--color-status-ok)'
  }

  return (
    <div className="surface rounded-xl px-plate-3 py-plate-3">
      <p className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-plate-2">
        Volume targets · deze week
      </p>
      <div className="flex flex-col gap-2">
        {imbalances.map(item => {
          const pct   = Math.min(100, Math.round((item.setCount / item.max) * 100))
          const color = statusColor(item.status)
          return (
            <div key={item.muscle_group}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-[var(--font-body)] text-xs capitalize"
                  style={{ color: 'var(--color-text-primary)' }}>
                  {item.muscle_group}
                </span>
                <span className="font-[var(--font-mono)] text-[10px]" style={{ color }}>
                  {item.setCount} sets
                </span>
              </div>
              <div style={{ background: 'var(--color-border)', height: 4, borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Volume consistentie strip (hit rate) ─────────────────────────────────────

function HitRateStrip({ hitRateData, weeksBack, startDate }) {
  if (!hitRateData?.length) return null
  const totalWeeks = hitRateData[0]?.totalWeeks ?? 0
  if (totalWeeks < 2) return null

  const today   = getTodayStr()
  const endDate = getWeekStart(addDaysVD(today, -7))

  const dotColor = (hr) => hr < 0.5 ? '#FF4B3E' : hr < 0.75 ? '#D9A441' : '#22C55E'
  const separatorIdx = hitRateData.findIndex(d => d.hitRate >= 0.75)
  const weeksLabel   = `${totalWeeks} ${totalWeeks === 1 ? 'week' : 'weken'}`

  return (
    <div className="surface rounded-xl px-plate-3 py-plate-3">
      <div className="flex items-center justify-between mb-plate-2">
        <span className="font-[var(--font-mono)] text-[9px] uppercase tracking-widest"
          style={{ color: 'var(--color-text-secondary)' }}>
          Volume consistentie · {weeksLabel}
        </span>
        {startDate && (
          <span className="font-[var(--font-mono)] text-[9px] opacity-50"
            style={{ color: 'var(--color-text-secondary)' }}>
            {fmtDateShort(startDate)} – {fmtDateShort(endDate)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {hitRateData.map((item, idx) => {
          const hr           = item.hitRate
          const dot          = dotColor(hr)
          const showSep      = idx === separatorIdx && separatorIdx > 0
          const barFill      = hr >= 0.75 ? `${dot}59` : dot

          return (
            <div key={item.muscle_group}>
              {showSep && (
                <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0 6px' }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <span
                  className="font-[var(--font-body)] text-xs capitalize"
                  style={{ minWidth: 72, flexShrink: 0, color: 'var(--color-text-primary)' }}
                >
                  {item.muscle_group}
                </span>
                <div style={{ flex: 1, background: 'var(--color-border)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(hr * 100)}%`, height: '100%', borderRadius: 3, background: barFill }} />
                </div>
                <span
                  className="font-[var(--font-mono)] text-[10px] font-semibold"
                  style={{ color: dot, minWidth: 36, textAlign: 'right', flexShrink: 0 }}
                >
                  {Math.round(hr * 100)}%
                </span>
                <span
                  className="font-[var(--font-mono)] text-[9px]"
                  style={{ color: 'var(--color-text-secondary)', minWidth: 32, flexShrink: 0 }}
                >
                  {item.weeksInRange}/{item.totalWeeks}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Spiergroep sectie ────────────────────────────────────────────────────────

function MuscleGroupSection({ byMuscleGroup, deloadWeekSet, targets, weeksBack }) {
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
            deloadWeekSet={deloadWeekSet}
            weeksBack={weeksBack}
            target={targets?.get(mg.muscleGroup)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Hoofd export ─────────────────────────────────────────────────────────────

export default function VolumeDashboard() {
  const [weeksBack,   setWeeksBack]   = useState(1)
  const [stats,       setStats]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [deloadWeeks, setDeloadWeeks] = useState([])
  const [imbalances,  setImbalances]  = useState([])
  const [targets,     setTargets]     = useState(new Map())
  const [hitRateData, setHitRateData] = useState([])

  useEffect(() => {
    setLoading(true)
    setStats(null)
    Promise.all([
      fetchStatsForPeriod(weeksBack),
      fetchDeloadWeeks(),
      detectImbalances(),
      calculateHitRate(weeksBack),
      fetchVolumeTargets(),
    ])
      .then(([data, dlWeeks, imb, hitRate, volumeTargets]) => {
        setStats(data)
        setDeloadWeeks(dlWeeks)
        setImbalances(imb)
        setHitRateData(hitRate)
        setTargets(new Map(volumeTargets.map(t => [t.muscle_group, { min: t.min_sets_per_week, max: t.max_sets_per_week }])))
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [weeksBack])

  const deloadWeekSet = new Set(deloadWeeks)

  const hitRateStartDate = weeksBack > 1
    ? getWeekStart(addDaysVD(getTodayStr(), -(weeksBack - 1) * 7))
    : null

  if (error) {
    return (
      <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">
        Fout bij laden: {error}
      </p>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-plate-3 py-plate-3 sm:px-plate-4 sm:py-plate-4 flex flex-col gap-plate-4">

      <div className="flex items-center justify-between">
        <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
          Statistics
        </h2>
        <PeriodSelector value={weeksBack} onChange={setWeeksBack} />
      </div>

      <OverallStatsHero
        overall={stats?.overall ?? null}
        loading={loading}
        weeksBack={weeksBack}
        deloadWeekSet={deloadWeekSet}
      />

      {/* ImbalanceBar verwijderd — volume target hero niet meer getoond */}

      {!loading && weeksBack !== 1 && hitRateData.length > 0 && (
        <HitRateStrip
          hitRateData={hitRateData}
          weeksBack={weeksBack}
          startDate={hitRateStartDate}
        />
      )}

      {!loading && stats && (
        <MuscleGroupSection
          byMuscleGroup={stats.byMuscleGroup}
          deloadWeekSet={deloadWeekSet}
          targets={targets}
          weeksBack={weeksBack}
        />
      )}

    </div>
  )
}

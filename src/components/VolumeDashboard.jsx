// src/components/VolumeDashboard.jsx
//
// Per spiergroep, per week: aantal sets (tegen min/max-targetlijnen uit
// muscle_group_volume_targets) en totaal volume (kg x reps) ernaast.
// Geen target-vergelijking voor kg-volume -- targets zijn alleen in sets
// gedefinieerd en kg-volume is niet vergelijkbaar tussen spiergroepen.

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, LabelList,
} from 'recharts'
import { fetchSetsWithMuscleGroups, fetchVolumeTargets, getWeekStart } from '../lib/dashboardQueries'

const AXIS_STYLE = { fill: '#9499A1', fontSize: 11, fontFamily: 'JetBrains Mono' }
const GRID_COLOR = '#24272C'

function getIsoWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const weekOne = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - weekOne) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7)
}

function formatWeekLabel(weekStart) {
  const [, month, day] = weekStart.split('-')
  return `${day}/${month} W${getIsoWeekNumber(weekStart)}`
}

function ChartTooltip({ active, payload, label, suffix }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-bg)] border border-[#2A2D31] rounded-lg px-plate-2 py-plate-1 shadow-xl">
      <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] mb-0.5">{label}</p>
      <p className="font-[var(--font-mono)] text-sm text-[var(--color-text-primary)] tabular-data">
        {payload[0].value}{suffix}
      </p>
    </div>
  )
}

function ValueLabel({ x, y, width, value }) {
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fontFamily="JetBrains Mono"
      fontSize={11}
      fill="#9499A1"
    >
      {value}
    </text>
  )
}

export default function VolumeDashboard() {
  const [sets, setSets] = useState(null)
  const [targets, setTargets] = useState(null)
  const [error, setError] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)

  useEffect(() => {
    Promise.all([fetchSetsWithMuscleGroups(12), fetchVolumeTargets()])
      .then(([setsData, targetsData]) => {
        setSets(setsData)
        setTargets(targetsData)
      })
      .catch((err) => setError(err.message))
  }, [])

  const muscleGroups = useMemo(() => {
    if (!sets) return []
    return [...new Set(sets.map((s) => s.muscle_group))].sort()
  }, [sets])

  useEffect(() => {
    if (muscleGroups.length > 0 && !selectedGroup) {
      setSelectedGroup(muscleGroups[0])
    }
  }, [muscleGroups, selectedGroup])

  const weeklyData = useMemo(() => {
    if (!sets || !selectedGroup) return []

    const byWeek = new Map()
    for (const s of sets) {
      if (s.muscle_group !== selectedGroup || !s.start_date) continue
      const week = getWeekStart(s.start_date)
      if (!byWeek.has(week)) byWeek.set(week, { week, setCount: 0, volumeKg: 0 })
      const entry = byWeek.get(week)
      const factor = s.contribution ?? 1.0
      entry.setCount += factor
      if (s.weight_kg != null && s.reps != null) {
        entry.volumeKg += s.weight_kg * s.reps * factor
      }
    }

    return Array.from(byWeek.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((e) => ({
        ...e,
        weekLabel: formatWeekLabel(e.week),
        setCount: Math.round(e.setCount * 10) / 10,
        volumeKg: Math.round(e.volumeKg),
      }))
  }, [sets, selectedGroup])

  const target = useMemo(
    () => targets?.find((t) => t.muscle_group === selectedGroup),
    [targets, selectedGroup]
  )

  const latestStatus = useMemo(() => {
    if (!target || weeklyData.length === 0) return null
    const latest = weeklyData[weeklyData.length - 1]
    if (latest.setCount < target.min_sets_per_week) return 'low'
    if (latest.setCount > target.max_sets_per_week) return 'high'
    return 'ok'
  }, [target, weeklyData])

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout bij laden: {error}</p>
  }

  if (!sets) {
    return <p className="text-[var(--color-text-secondary)] p-plate-4 font-[var(--font-mono)] text-sm">Laden...</p>
  }

  return (
    <div className="max-w-4xl mx-auto p-plate-4 flex flex-col gap-plate-4">
      <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
        Volume per spiergroep
      </h2>

      <div className="flex flex-wrap gap-plate-2">
        {muscleGroups.map((g) => (
          <button
            key={g}
            onClick={() => setSelectedGroup(g)}
            className={`px-plate-3 py-plate-1 rounded-lg text-sm font-[var(--font-body)] transition-all border ${
              g === selectedGroup
                ? 'bg-[var(--color-accent)] text-white border-transparent shadow-[0_2px_12px_-2px_rgba(255,75,62,0.4)]'
                : 'bg-[var(--color-card)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)] hover:border-[var(--color-border)]'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {weeklyData.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
          Geen data voor deze spiergroep in de afgelopen 12 weken.
        </p>
      ) : (
        <>
          <div className="surface rounded-xl p-plate-3 pt-plate-4">
            <div className="flex items-baseline justify-between mb-plate-3">
              <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
                Sets per week
              </p>
              {target && (
                <div className="flex items-center gap-plate-2">
                  <LegendDot color="#3E7CB1" label="sets" />
                  <span className={`font-[var(--font-mono)] text-xs tabular-data ${
                    latestStatus === 'low' ? 'text-[var(--color-status-low)]'
                    : latestStatus === 'high' ? 'text-[var(--color-status-high)]'
                    : 'text-[var(--color-status-ok)]'
                  }`}>
                    target {target.min_sets_per_week}–{target.max_sets_per_week}
                  </span>
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyData} margin={{ top: 18, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="weekLabel" tick={AXIS_STYLE} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
                <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ChartTooltip suffix=" sets" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                {target && (
                  <>
                    <ReferenceLine
                      y={target.min_sets_per_week}
                      stroke="#D9A441"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: `min ${target.min_sets_per_week}`, position: 'right', fill: '#D9A441', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                    <ReferenceLine
                      y={target.max_sets_per_week}
                      stroke="#D9A441"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: `max ${target.max_sets_per_week}`, position: 'right', fill: '#D9A441', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                  </>
                )}
                <Bar dataKey="setCount" fill="#3E7CB1" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive animationDuration={500}>
                  <LabelList dataKey="setCount" content={<ValueLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="surface rounded-xl p-plate-3 pt-plate-4">
            <div className="flex items-center gap-plate-2 mb-plate-3">
              <LegendDot color="#FF4B3E" label="" />
              <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
                Volume per week (kg × reps)
              </p>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyData} margin={{ top: 18, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="weekLabel" tick={AXIS_STYLE} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
                <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={64} />
                <Tooltip content={<ChartTooltip suffix=" kg" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="volumeKg" fill="#FF4B3E" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive animationDuration={500}>
                  <LabelList dataKey="volumeKg" content={<ValueLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label && <span className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">{label}</span>}
    </span>
  )
}

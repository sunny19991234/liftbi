// src/components/MonthlyComparison.jsx
//
// Maand-op-maand vergelijking (PRD 4.9). Toont volume, sets, gemiddelde RPE
// per kalendermaand naast elkaar (bar charts), plus een spiergroep-breakdown
// tabel voor de geselecteerde maand t.o.v. de vorige maand.

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts'
import { fetchMonthlyComparison } from '../lib/monthlyComparisonData'

const AXIS_STYLE = { fill: '#9499A1', fontSize: 11, fontFamily: 'JetBrains Mono' }
const GRID_COLOR = '#24272C'

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
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={11} fill="#9499A1">
      {value}
    </text>
  )
}

function deltaBadge(current, previous, { higherIsBetter = true, suffix = '' } = {}) {
  if (previous == null || current == null || previous === 0) return null
  const diff = current - previous
  const pct = Math.round((diff / previous) * 100)
  if (pct === 0) return <span className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-xs">±0%</span>

  const isPositive = pct > 0
  const isGood = higherIsBetter ? isPositive : !isPositive
  const color = isGood ? 'text-[var(--color-status-ok)]' : 'text-[var(--color-status-high)]'
  const arrow = isPositive ? '↑' : '↓'

  return (
    <span className={`font-[var(--font-mono)] text-xs tabular-data ${color}`}>
      {arrow} {Math.abs(pct)}%{suffix}
    </span>
  )
}

export default function MonthlyComparison() {
  const [months, setMonths] = useState(null)
  const [error, setError] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(null)

  useEffect(() => {
    fetchMonthlyComparison(6)
      .then((data) => {
        setMonths(data)
        setSelectedMonth(data[data.length - 1]?.month ?? null)
      })
      .catch((err) => setError(err.message))
  }, [])

  const chartData = useMemo(() => {
    if (!months) return []
    return months.map((m) => ({ ...m }))
  }, [months])

  const selected = months?.find((m) => m.month === selectedMonth)
  const selectedIdx = months?.findIndex((m) => m.month === selectedMonth) ?? -1
  const previous = selectedIdx > 0 ? months[selectedIdx - 1] : null

  const muscleGroupRows = useMemo(() => {
    if (!selected) return []
    const groups = new Set([
      ...Object.keys(selected.byMuscleGroup),
      ...(previous ? Object.keys(previous.byMuscleGroup) : []),
    ])
    return [...groups].sort().map((g) => ({
      muscle_group: g,
      current: selected.byMuscleGroup[g] ?? { setCount: 0, volumeKg: 0, avgRpe: null },
      previous: previous?.byMuscleGroup[g] ?? null,
    }))
  }, [selected, previous])

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout bij laden: {error}</p>
  }
  if (!months) {
    return <p className="text-[var(--color-text-secondary)] p-plate-4 font-[var(--font-mono)] text-sm">Laden...</p>
  }

  return (
    <div className="max-w-4xl mx-auto p-plate-4 flex flex-col gap-plate-4">
      <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
        Maand-op-maand vergelijking
      </h2>

      <div className="surface rounded-xl p-plate-3 pt-plate-4">
        <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm mb-plate-3">Volume per maand (kg × reps)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 18, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="monthLabel" tick={AXIS_STYLE} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
            <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<ChartTooltip suffix=" kg" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar
              dataKey="volumeKg"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive
              animationDuration={500}
              onClick={(data) => setSelectedMonth(data.month)}
              cursor="pointer"
            >
              <LabelList dataKey="volumeKg" content={<ValueLabel />} />
              {chartData.map((entry) => (
                <Cell key={entry.month} fill={entry.month === selectedMonth ? '#FF4B3E' : '#B23B32'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-plate-3">
        <div className="surface rounded-xl p-plate-3 pt-plate-4">
          <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm mb-plate-3">Sets per maand</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 18, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="monthLabel" tick={AXIS_STYLE} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip suffix=" sets" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="setCount" fill="#3E7CB1" radius={[4, 4, 0, 0]} maxBarSize={36}>
                <LabelList dataKey="setCount" content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="surface rounded-xl p-plate-3 pt-plate-4">
          <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm mb-plate-3">Gem. RPE per maand</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 18, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="monthLabel" tick={AXIS_STYLE} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis domain={[0, 10]} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={20} />
              <Tooltip content={<ChartTooltip suffix=" RPE" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="avgRpe" fill="#D9A441" radius={[4, 4, 0, 0]} maxBarSize={36}>
                <LabelList dataKey="avgRpe" content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="surface rounded-xl p-plate-3">
        <div className="flex items-center justify-between mb-plate-3">
          <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
            Spiergroep-breakdown — <span className="text-[var(--color-text-primary)] font-medium">{selected?.monthLabel}</span>
          </p>
          <select
            value={selectedMonth ?? ''}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[var(--color-bg)] text-[var(--color-text-primary)] rounded-lg px-plate-2 py-1 outline-none border border-transparent focus:border-[var(--color-accent)] font-[var(--font-mono)] text-xs"
          >
            {months.map((m) => (
              <option key={m.month} value={m.month}>{m.monthLabel}</option>
            ))}
          </select>
        </div>

        {muscleGroupRows.length === 0 ? (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">Geen data voor deze maand.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">
                  <th className="py-plate-1 font-normal">Spiergroep</th>
                  <th className="py-plate-1 font-normal text-right">Sets</th>
                  <th className="py-plate-1 font-normal text-right">vs vorige</th>
                  <th className="py-plate-1 font-normal text-right">Volume (kg)</th>
                  <th className="py-plate-1 font-normal text-right">vs vorige</th>
                  <th className="py-plate-1 font-normal text-right">Gem. RPE</th>
                  <th className="py-plate-1 font-normal text-right">vs vorige</th>
                </tr>
              </thead>
              <tbody className="font-[var(--font-mono)] tabular-data">
                {muscleGroupRows.map((row) => (
                  <tr key={row.muscle_group} className="border-b border-[var(--color-bg)] last:border-0">
                    <td className="py-plate-1 text-[var(--color-text-primary)] font-[var(--font-body)] capitalize">{row.muscle_group}</td>
                    <td className="py-plate-1 text-right">{row.current.setCount}</td>
                    <td className="py-plate-1 text-right">{deltaBadge(row.current.setCount, row.previous?.setCount) ?? <span className="text-[var(--color-text-tertiary)]">—</span>}</td>
                    <td className="py-plate-1 text-right">{row.current.volumeKg}</td>
                    <td className="py-plate-1 text-right">{deltaBadge(row.current.volumeKg, row.previous?.volumeKg) ?? <span className="text-[var(--color-text-tertiary)]">—</span>}</td>
                    <td className="py-plate-1 text-right">{row.current.avgRpe ?? <span className="text-[var(--color-text-tertiary)]">—</span>}</td>
                    <td className="py-plate-1 text-right">{deltaBadge(row.current.avgRpe, row.previous?.avgRpe, { higherIsBetter: false }) ?? <span className="text-[var(--color-text-tertiary)]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

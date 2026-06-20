// src/components/RpeTrend.jsx
//
// Oefening-dropdown + twee aparte grafieken: RPE per set over tijd, en
// gewicht per set over tijd. Los van elkaar (i.p.v. gedeelde dubbele as)
// zodat elke metric op zijn eigen schaal goed leesbaar is. Samen lees je
// progressive overload (gewicht omhoog) los van vermoeidheid (RPE omhoog
// bij gelijk gewicht).

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Dot,
} from 'recharts'
import { supabase } from '../lib/supabase'

const AXIS_STYLE = { fill: '#9499A1', fontSize: 11, fontFamily: 'JetBrains Mono' }
const GRID_COLOR = '#24272C'

function ChartTooltip({ active, payload, suffix }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="bg-[var(--color-bg)] border border-[#2A2D31] rounded-lg px-plate-2 py-plate-1 shadow-xl">
      <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] mb-0.5">{p.date}</p>
      <p className="font-[var(--font-mono)] text-sm text-[var(--color-text-primary)] tabular-data">
        {payload[0].value}{suffix}
      </p>
    </div>
  )
}

function RpeDot(props) {
  const { cx, cy, value } = props
  const color = value >= 9 ? '#FF4B3E' : value >= 8 ? '#D9A441' : '#22C55E'
  return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="none" />
}

export default function RpeTrend() {
  const [sets, setSets] = useState(null)
  const [error, setError] = useState(null)
  const [selectedExercise, setSelectedExercise] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: workouts, error: wErr } = await supabase
          .from('workouts')
          .select('id, start_date')
        if (wErr) throw wErr

        const workoutDateById = new Map(workouts.map((w) => [w.id, w.start_date]))

        const { data: setsData, error: sErr } = await supabase
          .from('sets')
          .select('workout_id, exercise_title, weight_kg, reps, rpe, set_index')
          .not('rpe', 'is', null)
        if (sErr) throw sErr

        setSets(
          setsData.map((s) => ({ ...s, start_date: workoutDateById.get(s.workout_id) }))
        )
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [])

  const exercises = useMemo(() => {
    if (!sets) return []
    return [...new Set(sets.map((s) => s.exercise_title))].sort()
  }, [sets])

  useEffect(() => {
    if (exercises.length > 0 && !selectedExercise) {
      setSelectedExercise(exercises[0])
    }
  }, [exercises, selectedExercise])

  const chartData = useMemo(() => {
    if (!sets || !selectedExercise) return []

    return sets
      .filter((s) => s.exercise_title === selectedExercise && s.start_date)
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.set_index - b.set_index)
      .map((s, i) => ({
        index: i,
        date: s.start_date,
        dateLabel: s.start_date.slice(5).replace('-', '/'),
        rpe: s.rpe,
        weight_kg: s.weight_kg,
      }))
  }, [sets, selectedExercise])

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout bij laden: {error}</p>
  }

  if (!sets) {
    return <p className="text-[var(--color-text-secondary)] p-plate-4 font-[var(--font-mono)] text-sm">Laden...</p>
  }

  return (
    <div className="max-w-4xl mx-auto p-plate-4 flex flex-col gap-plate-4">
      <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
        RPE-trend per oefening
      </h2>

      <select
        value={selectedExercise ?? ''}
        onChange={(e) => setSelectedExercise(e.target.value)}
        className="bg-[var(--color-card)] text-[var(--color-text-primary)] rounded-lg px-plate-3 py-plate-2 font-[var(--font-body)] outline-none border border-transparent focus:border-[var(--color-accent)] w-fit"
      >
        {exercises.map((ex) => (
          <option key={ex} value={ex}>{ex}</option>
        ))}
      </select>

      {chartData.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
          Geen sets met RPE voor deze oefening.
        </p>
      ) : (
        <>
          <div className="surface rounded-xl p-plate-3 pt-plate-4">
            <div className="flex items-center justify-between mb-plate-3">
              <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">RPE per set</p>
              <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">doel ≈ 8</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="dateLabel" tick={AXIS_STYLE} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
                <YAxis domain={[4, 10]} ticks={[4, 5, 6, 7, 8, 9, 10]} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={24} />
                <ReferenceLine y={8} stroke="#9499A1" strokeDasharray="3 3" strokeWidth={1} />
                <Tooltip content={<ChartTooltip suffix=" RPE" />} cursor={{ stroke: '#2A2D31' }} />
                <Line
                  type="monotone"
                  dataKey="rpe"
                  stroke="#FF4B3E"
                  strokeWidth={2}
                  dot={<RpeDot />}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="surface rounded-xl p-plate-3 pt-plate-4">
            <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm mb-plate-3">Gewicht per set</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey="dateLabel" tick={AXIS_STYLE} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
                <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={32} />
                <Tooltip content={<ChartTooltip suffix=" kg" />} cursor={{ stroke: '#2A2D31' }} />
                <Line
                  type="monotone"
                  dataKey="weight_kg"
                  stroke="#3E7CB1"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3E7CB1', stroke: 'none' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

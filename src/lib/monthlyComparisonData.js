// src/lib/monthlyComparisonData.js
//
// Maand-op-maand vergelijking (conform PRD 4.9). Aggregeert volume, sets
// per spiergroep en gemiddelde RPE per kalendermaand. Volledig
// deterministisch, berekend uit sets en workouts -- geen AI-kosten.

import { supabase } from './supabase'

/**
 * Geeft de laatste N kalendermaanden terug als 'YYYY-MM' strings,
 * meest recent eerst.
 */
export function getLastNMonths(n, fromDate = new Date()) {
  const months = []
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
  for (let i = 0; i < n; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return months
}

/**
 * Haalt alle data op en aggregeert per maand (laatste `monthsBack` maanden).
 *
 * Return: [
 *   {
 *     month: 'YYYY-MM',
 *     monthLabel: 'jun 2026',
 *     setCount: number,
 *     volumeKg: number,
 *     avgRpe: number | null,
 *     sessionCount: number,
 *     byMuscleGroup: { [muscle_group]: { setCount: number, volumeKg: number } },
 *   }
 * ] gesorteerd oudste -> nieuwste maand.
 */
export async function fetchMonthlyComparison(monthsBack = 6) {
  const months = getLastNMonths(monthsBack)
  const oldestMonth = months[months.length - 1]
  const sinceDate = `${oldestMonth}-01`

  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id, start_date')
    .gte('start_date', sinceDate)
  if (wErr) throw wErr
  if (!workouts || workouts.length === 0) {
    return months.slice().reverse().map((m) => emptyMonth(m))
  }

  const monthByWorkoutId = new Map(
    workouts.map((w) => [w.id, w.start_date.slice(0, 7)])
  )
  const workoutIds = workouts.map((w) => w.id)

  const { data: sets, error: sErr } = await supabase
    .from('sets')
    .select('workout_id, exercise_title, weight_kg, reps, rpe')
    .in('workout_id', workoutIds)
  if (sErr) throw sErr

  const { data: mappings, error: mErr } = await supabase
    .from('exercise_muscle_groups')
    .select('exercise_title, muscle_group, contribution')
  if (mErr) throw mErr

  const mappingsByExercise = new Map()
  for (const m of mappings) {
    if (!mappingsByExercise.has(m.exercise_title)) mappingsByExercise.set(m.exercise_title, [])
    mappingsByExercise.get(m.exercise_title).push({ muscle_group: m.muscle_group, contribution: m.contribution })
  }

  const byMonth = new Map(months.map((m) => [m, {
    setCount: 0,
    volumeKg: 0,
    rpeSum: 0,
    rpeCount: 0,
    sessionIds: new Set(),
    byMuscleGroup: new Map(), // muscle_group -> { setCount, volumeKg }
  }]))

  for (const s of sets) {
    const month = monthByWorkoutId.get(s.workout_id)
    if (!month || !byMonth.has(month)) continue
    const entry = byMonth.get(month)

    entry.setCount += 1
    entry.sessionIds.add(s.workout_id)
    if (s.weight_kg != null && s.reps != null) entry.volumeKg += s.weight_kg * s.reps
    if (s.rpe != null) { entry.rpeSum += s.rpe; entry.rpeCount += 1 }

    const groupMappings = mappingsByExercise.get(s.exercise_title) ?? [
      { muscle_group: 'ongecategoriseerd', contribution: 1.0 },
    ]
    for (const gm of groupMappings) {
      if (!entry.byMuscleGroup.has(gm.muscle_group)) {
        entry.byMuscleGroup.set(gm.muscle_group, { setCount: 0, volumeKg: 0 })
      }
      const mgEntry = entry.byMuscleGroup.get(gm.muscle_group)
      mgEntry.setCount += gm.contribution
      if (s.weight_kg != null && s.reps != null) mgEntry.volumeKg += s.weight_kg * s.reps * gm.contribution
    }
  }

  return months.slice().reverse().map((month) => {
    const entry = byMonth.get(month)
    return {
      month,
      monthLabel: formatMonthLabel(month),
      setCount: entry.setCount,
      volumeKg: Math.round(entry.volumeKg),
      avgRpe: entry.rpeCount > 0 ? Math.round((entry.rpeSum / entry.rpeCount) * 10) / 10 : null,
      sessionCount: entry.sessionIds.size,
      byMuscleGroup: Object.fromEntries(
        [...entry.byMuscleGroup.entries()].map(([k, v]) => [
          k,
          { setCount: Math.round(v.setCount * 10) / 10, volumeKg: Math.round(v.volumeKg) },
        ])
      ),
    }
  })
}

function emptyMonth(month) {
  return {
    month,
    monthLabel: formatMonthLabel(month),
    setCount: 0,
    volumeKg: 0,
    avgRpe: null,
    sessionCount: 0,
    byMuscleGroup: {},
  }
}

const MONTH_LABELS_SHORT = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-')
  return `${MONTH_LABELS_SHORT[Number(month) - 1]} ${year}`
}

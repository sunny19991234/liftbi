// src/lib/workoutsData.js
// Haalt gedetailleerde workout-data op voor een maand: sets per oefening,
// AI-analyses, en kalenderdata voor de maandweergave.

import { supabase } from './supabase'
import { getTodayStr } from './calendarData'

const WORKOUTS_LIMIT = 100

function buildDetailedWorkout(w, setsByWorkout, analysisByWorkout) {
  const exMap = setsByWorkout.get(w.id) ?? new Map()
  const exercises = Array.from(exMap.entries()).map(([name, sets]) => {
    const volume = sets.reduce((sum, s) =>
      sum + (s.weight_kg != null && s.reps != null ? s.weight_kg * s.reps : 0), 0)
    return { name, sets, volume: Math.round(volume) }
  })

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const totalVolume = exercises.reduce((sum, ex) => sum + ex.volume, 0)
  const allRpe = exercises.flatMap((ex) => ex.sets.map((s) => s.rpe).filter((r) => r != null))
  const avgRpe = allRpe.length > 0
    ? Math.round((allRpe.reduce((a, b) => a + b, 0) / allRpe.length) * 10) / 10
    : null

  let durationMin = null
  if (w.start_time && w.end_time) {
    durationMin = Math.round((new Date(w.end_time) - new Date(w.start_time)) / 60000)
  }

  return {
    id: w.id,
    title: w.title,
    start_date: w.start_date,
    durationMin,
    totalSets,
    totalVolume,
    avgRpe,
    exercises,
    analysis: analysisByWorkout.get(w.id) ?? null,
    hasAnalysis: analysisByWorkout.has(w.id),
  }
}

async function fetchSetsAndAnalyses(workoutIds) {
  if (!workoutIds.length) return { setsByWorkout: new Map(), analysisByWorkout: new Map() }

  const [{ data: sets, error: sErr }, { data: analyses, error: aErr }] = await Promise.all([
    supabase
      .from('sets')
      .select('workout_id, exercise_title, set_index, weight_kg, reps, rpe')
      .in('workout_id', workoutIds)
      .order('set_index'),
    supabase
      .from('ai_analyses')
      .select('workout_id, content, created_at, model')
      .in('workout_id', workoutIds),
  ])

  if (sErr) throw sErr
  if (aErr) throw aErr

  const setsByWorkout = new Map()
  for (const s of sets) {
    if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, new Map())
    const exMap = setsByWorkout.get(s.workout_id)
    if (!exMap.has(s.exercise_title)) exMap.set(s.exercise_title, [])
    exMap.get(s.exercise_title).push({ weight_kg: s.weight_kg, reps: s.reps, rpe: s.rpe })
  }

  const analysisByWorkout = new Map()
  for (const a of analyses) analysisByWorkout.set(a.workout_id, a)

  return { setsByWorkout, analysisByWorkout }
}

export async function fetchMonthWorkoutsData(year, month) {
  const monthStr = String(month).padStart(2, '0')
  const firstDay = `${year}-${monthStr}-01`
  const lastDay = new Date(year, month, 0).toISOString().slice(0, 10)
  const todayStr = getTodayStr()

  const [
    { data: workouts, error: wErr },
    { data: planned, error: pErr },
  ] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, title, start_time, end_time, start_date')
      .gte('start_date', firstDay)
      .lte('start_date', lastDay)
      .order('start_date', { ascending: false })
      .limit(WORKOUTS_LIMIT),
    supabase
      .from('planned_workouts')
      .select('id, planned_date, title, notes, status')
      .gte('planned_date', firstDay)
      .lte('planned_date', lastDay),
  ])

  if (wErr) throw wErr
  if (pErr) throw pErr

  const hasMore = workouts.length === WORKOUTS_LIMIT

  const { setsByWorkout, analysisByWorkout } = await fetchSetsAndAnalyses(workouts.map((w) => w.id))

  const detailedWorkouts = workouts.map((w) => buildDetailedWorkout(w, setsByWorkout, analysisByWorkout))

  const dayMap = new Map()

  for (const w of detailedWorkouts) {
    dayMap.set(w.start_date, {
      type: 'done',
      workoutId: w.id,
      title: w.title,
      setCount: w.totalSets,
      volumeKg: w.totalVolume,
      avgRpe: w.avgRpe,
    })
  }

  for (const p of planned) {
    if (dayMap.has(p.planned_date)) continue
    const isPastAndStillPlanned = p.status === 'planned' && p.planned_date < todayStr
    dayMap.set(p.planned_date, {
      type: 'planned',
      plannedId: p.id,
      title: p.title,
      status: isPastAndStillPlanned ? 'missed' : p.status,
      notes: p.notes,
    })
  }

  const maxVolume = detailedWorkouts.reduce((max, w) => Math.max(max, w.totalVolume), 0)

  return { workouts: detailedWorkouts, dayMap, maxVolume, hasMore }
}

export async function fetchMoreWorkouts(year, month, offset) {
  const monthStr = String(month).padStart(2, '0')
  const firstDay = `${year}-${monthStr}-01`
  const lastDay = new Date(year, month, 0).toISOString().slice(0, 10)

  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id, title, start_time, end_time, start_date')
    .gte('start_date', firstDay)
    .lte('start_date', lastDay)
    .order('start_date', { ascending: false })
    .range(offset, offset + 49)

  if (wErr) throw wErr
  if (!workouts.length) return { workouts: [], hasMore: false }

  const { setsByWorkout, analysisByWorkout } = await fetchSetsAndAnalyses(workouts.map((w) => w.id))
  const detailedWorkouts = workouts.map((w) => buildDetailedWorkout(w, setsByWorkout, analysisByWorkout))

  return { workouts: detailedWorkouts, hasMore: workouts.length === 50 }
}

export async function fetchPreviousSessionComparison(workoutId, workoutTitle) {
  const { data: current, error: cErr } = await supabase
    .from('workouts')
    .select('start_date')
    .eq('id', workoutId)
    .single()
  if (cErr) throw cErr

  const { data: prev, error: pErr } = await supabase
    .from('workouts')
    .select('id, start_date')
    .eq('title', workoutTitle)
    .lt('start_date', current.start_date)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (pErr) throw pErr
  if (!prev) return null

  const [{ data: currentSets, error: csErr }, { data: prevSets, error: psErr }] = await Promise.all([
    supabase
      .from('sets')
      .select('exercise_title, weight_kg, reps, rpe, set_type')
      .eq('workout_id', workoutId)
      .order('set_index'),
    supabase
      .from('sets')
      .select('exercise_title, weight_kg, reps, rpe, set_type')
      .eq('workout_id', prev.id)
      .order('set_index'),
  ])
  if (csErr) throw csErr
  if (psErr) throw psErr

  function calcStats(sets) {
    const byExercise = new Map()
    for (const s of sets ?? []) {
      if (!byExercise.has(s.exercise_title)) byExercise.set(s.exercise_title, [])
      byExercise.get(s.exercise_title).push(s)
    }
    const result = new Map()
    for (const [name, exSets] of byExercise) {
      const valid = exSets.filter((s) => s.weight_kg != null && s.reps != null)
      const heaviest = valid.length > 0 ? Math.max(...valid.map((s) => s.weight_kg)) : null
      const volume = exSets.reduce((sum, s) =>
        sum + (s.weight_kg != null && s.reps != null ? s.weight_kg * s.reps : 0), 0)
      const e1rmSets = valid.filter((s) => s.reps <= 12)
      const bestE1rm = e1rmSets.length > 0
        ? Math.max(...e1rmSets.map((s) => Math.round(s.weight_kg * (1 + s.reps / 30) * 10) / 10))
        : null
      result.set(name, { heaviest, volume: Math.round(volume), bestE1rm })
    }
    return result
  }

  const currStats = calcStats(currentSets)
  const prevStats = calcStats(prevSets)

  const comparison = new Map()
  for (const [name, curr] of currStats) {
    const p = prevStats.get(name) ?? { heaviest: null, volume: 0, bestE1rm: null }
    comparison.set(name, {
      deltaWeight: curr.heaviest != null && p.heaviest != null
        ? Math.round((curr.heaviest - p.heaviest) * 10) / 10
        : null,
      deltaVolume: curr.volume - p.volume,
      currE1rm: curr.bestE1rm,
      prevE1rm: p.bestE1rm,
    })
  }

  return { prevDate: prev.start_date, comparison }
}

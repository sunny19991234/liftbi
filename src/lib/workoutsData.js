// src/lib/workoutsData.js
// Haalt gedetailleerde workout-data op voor een maand: sets per oefening,
// AI-analyses, en kalenderdata voor de maandweergave.

import { supabase } from './supabase'
import { getTodayStr } from './calendarData'

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
      .order('start_date', { ascending: false }),
    supabase
      .from('planned_workouts')
      .select('id, planned_date, title, notes, status')
      .gte('planned_date', firstDay)
      .lte('planned_date', lastDay),
  ])

  if (wErr) throw wErr
  if (pErr) throw pErr

  const workoutIds = workouts.map((w) => w.id)
  let setsByWorkout = new Map()
  let analysisByWorkout = new Map()

  if (workoutIds.length > 0) {
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

    for (const s of sets) {
      if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, new Map())
      const exMap = setsByWorkout.get(s.workout_id)
      if (!exMap.has(s.exercise_title)) exMap.set(s.exercise_title, [])
      exMap.get(s.exercise_title).push({ weight_kg: s.weight_kg, reps: s.reps, rpe: s.rpe })
    }

    for (const a of analyses) analysisByWorkout.set(a.workout_id, a)
  }

  const detailedWorkouts = workouts.map((w) => {
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
    }
  })

  // Kalender dayMap
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
      title: p.title,
      status: isPastAndStillPlanned ? 'missed' : p.status,
      notes: p.notes,
    })
  }

  const maxVolume = detailedWorkouts.reduce((max, w) => Math.max(max, w.totalVolume), 0)

  return { workouts: detailedWorkouts, dayMap, maxVolume }
}

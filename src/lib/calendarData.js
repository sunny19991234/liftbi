// src/lib/calendarData.js
//
// Haalt workouts + planned_workouts op voor een gegeven maand en combineert
// ze per kalenderdag, met de regel: uitgevoerd heeft voorrang boven gepland.

import { supabase } from './supabase'

/**
 * @param {number} year
 * @param {number} month 1-12
 * @returns {Promise<Map<string, DayInfo>>} key = YYYY-MM-DD
 */
export async function fetchMonthData(year, month) {
  const monthStr = String(month).padStart(2, '0')
  const firstDay = `${year}-${monthStr}-01`
  const lastDayDate = new Date(year, month, 0) // dag 0 van volgende maand = laatste dag huidige maand
  const lastDay = lastDayDate.toISOString().slice(0, 10)

  const [{ data: workouts, error: wErr }, { data: planned, error: pErr }] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, title, start_date')
      .gte('start_date', firstDay)
      .lte('start_date', lastDay),
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
  let summaryByWorkout = new Map()

  if (workoutIds.length > 0) {
    const { data: sets, error: sErr } = await supabase
      .from('sets')
      .select('workout_id, weight_kg, reps, rpe')
      .in('workout_id', workoutIds)
    if (sErr) throw sErr

    setsByWorkout = new Map()
    for (const s of sets) {
      if (!setsByWorkout.has(s.workout_id)) {
        setsByWorkout.set(s.workout_id, { setCount: 0, volumeKg: 0, rpeSum: 0, rpeCount: 0 })
      }
      const entry = setsByWorkout.get(s.workout_id)
      entry.setCount += 1
      if (s.weight_kg != null && s.reps != null) {
        entry.volumeKg += s.weight_kg * s.reps
      }
      if (s.rpe != null) {
        entry.rpeSum += s.rpe
        entry.rpeCount += 1
      }
    }

    // AI-samenvattingen ophalen voor de zichtbare maand. Niet elke workout
    // heeft een analyse (alleen sessies geupload na invoering van
    // analyze-session) -- dat is verwacht, geen foutsituatie.
    const { data: analyses, error: aErr } = await supabase
      .from('ai_analyses')
      .select('workout_id, content')
      .in('workout_id', workoutIds)
    if (aErr) throw aErr

    summaryByWorkout = new Map(analyses.map((a) => [a.workout_id, a.content?.summary ?? null]))
  }

  const dayMap = new Map()

  for (const w of workouts) {
    const stats = setsByWorkout.get(w.id) ?? { setCount: 0, volumeKg: 0, rpeSum: 0, rpeCount: 0 }
    const avgRpe = stats.rpeCount > 0 ? Math.round((stats.rpeSum / stats.rpeCount) * 10) / 10 : null
    dayMap.set(w.start_date, {
      type: 'done',
      workoutId: w.id,
      title: w.title,
      setCount: stats.setCount,
      volumeKg: Math.round(stats.volumeKg),
      avgRpe,
      summary: summaryByWorkout.get(w.id) ?? null,
    })
  }

  const todayStr = getTodayStr()

  for (const p of planned) {
    if (dayMap.has(p.planned_date)) continue // uitgevoerd heeft voorrang
    const isPastAndStillPlanned = p.status === 'planned' && p.planned_date < todayStr
    dayMap.set(p.planned_date, {
      type: 'planned',
      title: p.title,
      status: isPastAndStillPlanned ? 'missed' : p.status,
      notes: p.notes,
    })
  }

  return dayMap
}

export function getTodayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

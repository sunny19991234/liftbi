// src/lib/homeData.js
//
// Verzamelt de samengevatte data voor de homepage: eerstvolgende geplande
// sessie, een dagstrip (recente + komende dagen) en het totale weekvolume.

import { supabase } from './supabase'
import { getTodayStr } from './calendarData'

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Eerstvolgende geplande sessie met status 'planned' en datum >= vandaag.
 * Geeft null als er niets gepland staat.
 */
export async function fetchNextPlanned() {
  const today = getTodayStr()
  const { data, error } = await supabase
    .from('planned_workouts')
    .select('id, planned_date, title, notes')
    .eq('status', 'planned')
    .gte('planned_date', today)
    .order('planned_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Dagstrip: van `daysBack` dagen geleden t/m `daysForward` dagen vooruit,
 * elke dag met afgeleide status (done/planned/missed/skipped/rest).
 */
export async function fetchDayStrip(daysBack = 3, daysForward = 3) {
  const today = getTodayStr()
  const start = addDays(today, -daysBack)
  const end = addDays(today, daysForward)

  const [{ data: workouts, error: wErr }, { data: planned, error: pErr }] = await Promise.all([
    supabase.from('workouts').select('id, title, start_date').gte('start_date', start).lte('start_date', end),
    supabase.from('planned_workouts').select('id, planned_date, title, status').gte('planned_date', start).lte('planned_date', end),
  ])

  if (wErr) throw wErr
  if (pErr) throw pErr

  const dayMap = new Map()

  for (const w of workouts) {
    dayMap.set(w.start_date, { type: 'done', title: w.title, workoutId: w.id })
  }
  for (const p of planned) {
    if (dayMap.has(p.planned_date)) continue
    const isMissed = p.status === 'planned' && p.planned_date < today
    dayMap.set(p.planned_date, { type: 'planned', title: p.title, status: isMissed ? 'missed' : p.status })
  }

  const days = []
  for (let i = -daysBack; i <= daysForward; i++) {
    const dateStr = addDays(today, i)
    days.push({ date: dateStr, isToday: dateStr === today, info: dayMap.get(dateStr) ?? null })
  }
  return days
}

/**
 * Totaal volume (sets + kg) van de huidige kalenderweek (maandag t/m
 * vandaag), opgeteld over alle spiergroepen. Telt elke uitgevoerde set
 * één keer (niet gewogen per spiergroep-contributie), want dit is totaal
 * trainingsvolume, geen spiergroep-specifieke metric.
 */
export async function fetchWeekVolume() {
  const today = getTodayStr()
  const todayDate = new Date(today + 'T00:00:00')
  const dayOfWeek = todayDate.getDay() // 0 = zondag
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = addDays(today, diffToMonday)

  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id')
    .gte('start_date', monday)
    .lte('start_date', today)
  if (wErr) throw wErr

  if (workouts.length === 0) return { setCount: 0, volumeKg: 0, weekStart: monday }

  const { data: sets, error: sErr } = await supabase
    .from('sets')
    .select('weight_kg, reps')
    .in('workout_id', workouts.map((w) => w.id))
  if (sErr) throw sErr

  let setCount = 0
  let volumeKg = 0
  for (const s of sets) {
    setCount += 1
    if (s.weight_kg != null && s.reps != null) volumeKg += s.weight_kg * s.reps
  }

  return { setCount, volumeKg: Math.round(volumeKg), weekStart: monday }
}

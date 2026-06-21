// src/lib/homeData.js
//
// Verzamelt de samengevatte data voor de homepage: eerstvolgende geplande
// sessie, een dagstrip (recente + komende dagen) en het weekvolume (huidige
// + vorige kalenderweek).
//
// BELANGRIJK: "deze week" is hier altijd de volledige kalenderweek
// (maandag t/m zondag), niet "maandag t/m vandaag". Dat is dezelfde
// week-definitie als VolumeDashboard.jsx/dashboardQueries.js
// (getWeekStart) en imbalanceData.js -- eerder telde fetchWeekVolume hier
// alleen t/m vandaag, waardoor het cijfer op Home structureel lager was
// dan in de Volume-tab voor dezelfde week. Door consistent de hele
// kalenderweek te tellen kunnen de schermen niet meer uit elkaar lopen.

import { supabase } from './supabase'
import { getTodayStr } from './calendarData'
import { getWeekStart } from './dashboardQueries'

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
 * Telt sets/volume/gem.RPE op voor een gegeven kalenderweek (maandag t/m
 * zondag, op basis van weekStartDate = de maandag van die week).
 */
async function fetchVolumeForWeek(weekStartDate) {
  const weekEndDate = addDays(weekStartDate, 6)

  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id')
    .gte('start_date', weekStartDate)
    .lte('start_date', weekEndDate)
  if (wErr) throw wErr

  if (workouts.length === 0) {
    return { setCount: 0, volumeKg: 0, avgRpe: null, weekStart: weekStartDate, weekEnd: weekEndDate }
  }

  const { data: sets, error: sErr } = await supabase
    .from('sets')
    .select('weight_kg, reps, rpe')
    .in('workout_id', workouts.map((w) => w.id))
  if (sErr) throw sErr

  let setCount = 0
  let volumeKg = 0
  let rpeSum = 0
  let rpeCount = 0
  for (const s of sets) {
    setCount += 1
    if (s.weight_kg != null && s.reps != null) volumeKg += s.weight_kg * s.reps
    if (s.rpe != null) { rpeSum += s.rpe; rpeCount += 1 }
  }

  return {
    setCount,
    volumeKg: Math.round(volumeKg),
    avgRpe: rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 10) / 10 : null,
    weekStart: weekStartDate,
    weekEnd: weekEndDate,
  }
}

/**
 * Volledige huidige kalenderweek (maandag t/m zondag), inclusief dagen die
 * nog moeten komen -- consistent met de Volume-tab, niet "tot nu".
 */
export async function fetchWeekVolume() {
  const currentWeekStart = getWeekStart(getTodayStr())
  return fetchVolumeForWeek(currentWeekStart)
}

/**
 * Vorige volledige kalenderweek (maandag t/m zondag).
 */
export async function fetchPreviousWeekVolume() {
  const currentWeekStart = getWeekStart(getTodayStr())
  const previousWeekStart = addDays(currentWeekStart, -7)
  return fetchVolumeForWeek(previousWeekStart)
}

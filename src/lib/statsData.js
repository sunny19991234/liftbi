// src/lib/statsData.js
//
// Data fetching en aggregatie voor de Statistics tab.
// weeksBack = 0 → all time (geen datumfilter, weeks afgeleid uit data).
// weeksBack > 0 → laatste N kalenderweken incl. huidige.
// Cardio-sets (geen weight én geen reps) worden altijd uitgesloten.

import { supabase } from './supabase'
import { getWeekStart } from './dashboardQueries'
import { getTodayStr } from './calendarData'

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function getIsoWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const weekOne = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - weekOne) / 86400000 - 3 + ((weekOne.getDay() + 6) % 7)) / 7)
}

function formatWeekShort(weekStart) {
  const [, month, day] = weekStart.split('-')
  return `${parseInt(day)}/${parseInt(month)}`
}

export function computeTrend(weeklyData) {
  const vols  = weeklyData.map(w => w.volumeKg ?? 0)
  const n     = vols.length
  const total = vols.reduce((s, v) => s + v, 0)
  if (n < 3 || total === 0) return { pct: 0, label: 'stabiel', kgPerWeek: 0 }

  const xMean = (n - 1) / 2
  const yMean = total / n
  const ssXX  = vols.reduce((s, _, i) => s + (i - xMean) ** 2, 0)
  const ssXY  = vols.reduce((s, v, i) => s + (i - xMean) * (v - yMean), 0)
  const slope = ssXX > 0 ? ssXY / ssXX : 0

  const half     = Math.floor(n / 2)
  const avgFirst = vols.slice(0, half).reduce((s, v) => s + v, 0) / half
  const avgLast  = vols.slice(-half).reduce((s, v) => s + v, 0) / half
  const pct      = avgFirst > 0 ? Math.round(((avgLast - avgFirst) / avgFirst) * 100) : 0
  const label    = pct > 5 ? 'stijgend' : pct < -5 ? 'dalend' : 'stabiel'

  return { pct, label, kgPerWeek: Math.round(slope) }
}

export async function fetchStatsForPeriod(weeksBack = 4) {
  const today      = getTodayStr()
  const isAllTime  = weeksBack === 0
  const isPrevWeek = weeksBack === -1

  // Workouts ophalen — all time of gefilterd op oudste weekstart
  let workoutQuery = supabase.from('workouts').select('id, start_date, start_time, end_time')
  if (!isAllTime) {
    if (isPrevWeek) {
      const prevWeekStart    = getWeekStart(addDays(today, -7))
      const currentWeekStart = getWeekStart(today)
      workoutQuery = workoutQuery.gte('start_date', prevWeekStart).lt('start_date', currentWeekStart)
    } else {
      const oldestWeekStart = getWeekStart(addDays(today, -(weeksBack - 1) * 7))
      workoutQuery = workoutQuery.gte('start_date', oldestWeekStart)
    }
  }

  const { data: workouts, error: wErr } = await workoutQuery
  if (wErr) throw wErr
  if (!workouts?.length) return { overall: null, byMuscleGroup: [] }

  const workoutIds  = workouts.map(w => w.id)
  const workoutById = new Map(workouts.map(w => [w.id, w]))

  const { data: rawSets, error: sErr } = await supabase
    .from('sets')
    .select('id, workout_id, exercise_title, weight_kg, reps, rpe')
    .in('workout_id', workoutIds)
  if (sErr) throw sErr

  // Cardio uitsluiten: sets zonder weight én zonder reps
  const sets = rawSets.filter(s => !(s.weight_kg == null && s.reps == null))

  const { data: mappings, error: mErr } = await supabase
    .from('exercise_muscle_groups')
    .select('exercise_title, muscle_group, contribution')
  if (mErr) throw mErr

  const mappingsByExercise = new Map()
  for (const m of mappings) {
    if (!mappingsByExercise.has(m.exercise_title)) mappingsByExercise.set(m.exercise_title, [])
    mappingsByExercise.get(m.exercise_title).push({ muscle_group: m.muscle_group, contribution: m.contribution ?? 1.0 })
  }

  // Weken array oud → nieuw
  const weeks = []
  if (isPrevWeek) {
    weeks.push(getWeekStart(addDays(today, -7)))
  } else if (isAllTime) {
    const earliest = workouts.reduce((m, w) => w.start_date < m ? w.start_date : m, workouts[0].start_date)
    let cur = getWeekStart(earliest)
    const todayWeek = getWeekStart(today)
    while (cur <= todayWeek) {
      weeks.push(cur)
      cur = addDays(cur, 7)
    }
  } else {
    for (let i = weeksBack - 1; i >= 0; i--) weeks.push(getWeekStart(addDays(today, -i * 7)))
  }
  const weekSet = new Set(weeks)

  // Duur per week
  const durationByWeek = new Map()
  for (const w of workouts) {
    const ws = getWeekStart(w.start_date)
    if (!weekSet.has(ws) || !w.start_time || !w.end_time) continue
    const mins = (new Date(w.end_time) - new Date(w.start_time)) / 60000
    if (mins > 0 && mins < 300) durationByWeek.set(ws, (durationByWeek.get(ws) ?? 0) + mins)
  }

  function emptyBucket() { return { vol: 0, sets: 0, reps: 0, rpeSum: 0, rpeN: 0 } }
  const overallByWeek = new Map(weeks.map(w => [w, emptyBucket()]))
  const mgByWeek      = new Map()

  for (const s of sets) {
    const wo = workoutById.get(s.workout_id)
    if (!wo) continue
    const ws = getWeekStart(wo.start_date)
    if (!weekSet.has(ws)) continue

    const vol  = (s.weight_kg ?? 0) * (s.reps ?? 0)
    const reps = s.reps ?? 0

    const oe = overallByWeek.get(ws)
    oe.vol  += vol
    oe.sets += 1
    oe.reps += reps
    if (s.rpe != null) { oe.rpeSum += s.rpe; oe.rpeN++ }

    const gms = mappingsByExercise.get(s.exercise_title) ?? [{ muscle_group: 'overig', contribution: 1.0 }]
    for (const gm of gms) {
      const mg = gm.muscle_group
      if (mg.toLowerCase() === 'cardio') continue
      const f = gm.contribution
      if (!mgByWeek.has(mg)) mgByWeek.set(mg, new Map(weeks.map(w => [w, emptyBucket()])))
      const me = mgByWeek.get(mg).get(ws)
      me.vol  += vol * f
      me.sets += f
      me.reps += reps * f
      if (s.rpe != null) { me.rpeSum += s.rpe; me.rpeN++ }
    }
  }

  function bucketToWeekRow(w, bucket, extra = {}) {
    return {
      weekStart: w,
      weekLabel: formatWeekShort(w),
      weekNum:   getIsoWeekNumber(w),
      volumeKg:  Math.round(bucket.vol),
      setCount:  Math.round(bucket.sets * 10) / 10,
      repCount:  Math.round(bucket.reps),
      avgRpe:    bucket.rpeN > 0 ? Math.round((bucket.rpeSum / bucket.rpeN) * 10) / 10 : null,
      ...extra,
    }
  }

  const overallWeekly = weeks.map(w =>
    bucketToWeekRow(w, overallByWeek.get(w), { durationMin: Math.round(durationByWeek.get(w) ?? 0) })
  )

  let totalRpeSum = 0, totalRpeN = 0
  for (const s of sets) { if (s.rpe != null) { totalRpeSum += s.rpe; totalRpeN++ } }

  const overall = {
    volumeKg:    overallWeekly.reduce((s, w) => s + w.volumeKg, 0),
    setCount:    overallWeekly.reduce((s, w) => s + w.setCount, 0),
    repCount:    overallWeekly.reduce((s, w) => s + w.repCount, 0),
    avgRpe:      totalRpeN > 0 ? Math.round((totalRpeSum / totalRpeN) * 10) / 10 : null,
    durationMin: overallWeekly.reduce((s, w) => s + w.durationMin, 0),
    weeklyData:  overallWeekly,
    trend:       computeTrend(overallWeekly),
  }

  const byMuscleGroup = [...mgByWeek.entries()].map(([mg, weekMap]) => {
    const weeklyData = weeks.map(w => bucketToWeekRow(w, weekMap.get(w)))
    const rpeWeeks   = weeklyData.filter(w => w.avgRpe != null)
    return {
      muscleGroup: mg,
      volumeKg:    weeklyData.reduce((s, w) => s + w.volumeKg, 0),
      setCount:    Math.round(weeklyData.reduce((s, w) => s + w.setCount, 0) * 10) / 10,
      repCount:    weeklyData.reduce((s, w) => s + w.repCount, 0),
      avgRpe:      rpeWeeks.length > 0
        ? Math.round(rpeWeeks.reduce((s, w) => s + w.avgRpe, 0) / rpeWeeks.length * 10) / 10
        : null,
      weeklyData,
      trend: computeTrend(weeklyData),
    }
  }).sort((a, b) => b.volumeKg - a.volumeKg)

  return { overall, byMuscleGroup }
}

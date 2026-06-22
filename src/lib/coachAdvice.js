// src/lib/coachAdvice.js
//
// Deterministisch progressie-advies per oefening (geen AI-call).
// Vergelijkt de meest recente sessie per workout-type met de voorgaande
// sessie van hetzelfde type en bepaalt per oefening of gewicht of reps
// omhoog kunnen.
//
// LOGICA (als hypertrofie-coach):
//
// Rep-ranges (conform PRD / Sunny's voorkeur):
//   Compound: 6–10 reps
//   Isolation: 8–12 reps
//
// Advies wordt per werkset (set_type = 'normal') berekend op basis van
// de BESTE set van die sessie (hoogste e1RM, zodat we niet sturen op een
// slechte set).
//
// Progressie-regels:
// 1. Als beste set reps >= bovenkant range EN RPE <= 8.5 → GEWICHT omhoog
//    (je zit comfortabel boven range, klaar voor meer weerstand)
// 2. Als beste set reps >= bovenkant range EN RPE > 8.5 → REPS consolideren
//    (je haalt de reps maar het kost moeite — nog een sessie op dit gewicht)
// 3. Als beste set reps < onderkant range → GEWICHT omlaag (te zwaar)
// 4. Als beste set reps binnen range EN RPE <= 8.0 → REPS omhoog
//    (je hebt ruimte, push naar de bovenkant)
// 5. Als beste set reps binnen range EN RPE 8.1–8.9 → HANDHAVEN
//    (goed gewicht, goed gevoel — volgende keer kijken of je bovenkant haalt)
// 6. Als beste set reps binnen range EN RPE >= 9.0 → GEWICHT VERLAGEN of
//    VOLUME verminderen (te intensief, herstelrisico)
//
// Gewichtsincrement (standaard Hevy-plates):
//   Dumbbell/cable: +2 kg per zijde (dus +2 op de waarde in de data)
//   Machine/barbell: +5 kg
// Heuristiek: als weight_kg <= 30 → dumbbell/cable increment, anders machine.
//
// Oefening-classificatie (compound vs isolation):
// Compound keywords: squat, deadlift, press, row, pulldown, pull-up, dip
// Isolation: alles wat niet compound is.

import { supabase } from './supabase'

const COMPOUND_KEYWORDS = [
  'squat', 'deadlift', 'press', 'row', 'pulldown', 'pull-up', 'pull up',
  'dip', 'hack squat', 'leg press',
]

function isCompound(exerciseTitle) {
  const lower = exerciseTitle.toLowerCase()
  return COMPOUND_KEYWORDS.some((kw) => lower.includes(kw))
}

function getRepRange(exerciseTitle) {
  return isCompound(exerciseTitle) ? { min: 6, max: 10 } : { min: 8, max: 12 }
}

function weightIncrement(weightKg) {
  return weightKg <= 30 ? 2 : 5
}

function estimatedOneRepMax(weightKg, reps) {
  if (reps > 12 || reps === 0) return null
  return weightKg * (1 + reps / 30)
}

/**
 * Geeft het advies voor één oefening op basis van de beste werkset.
 * Beste werkset = werkset met hoogste e1RM in die sessie.
 *
 * Return: {
 *   exercise_title,
 *   action: 'gewicht_omhoog' | 'reps_omhoog' | 'handhaven' | 'consolideren' | 'gewicht_omlaag',
 *   advice: string (korte Nederlandse zin),
 *   bestSet: { weight_kg, reps, rpe },
 *   targetWeight?: number,
 *   targetReps?: string,
 *   repRange: { min, max },
 * }
 */
function adviseExercise(exerciseTitle, currentSets) {
  const normalSets = currentSets.filter(
    (s) => s.set_type === 'normal' && s.weight_kg != null && s.reps != null
  )
  if (normalSets.length === 0) return null

  const range = getRepRange(exerciseTitle)

  // Beste set = hoogste e1RM
  let bestSet = null
  let bestE1rm = -Infinity
  for (const s of normalSets) {
    const e1rm = estimatedOneRepMax(s.weight_kg, s.reps)
    if (e1rm !== null && e1rm > bestE1rm) {
      bestE1rm = e1rm
      bestSet = s
    }
  }
  if (!bestSet) return null

  const { weight_kg, reps, rpe } = bestSet
  const effectiveRpe = rpe ?? 8.0 // als geen RPE ingevuld, neem gemiddeld aan
  const inc = weightIncrement(weight_kg)

  let action, advice, targetWeight, targetReps

  if (reps < range.min) {
    action = 'gewicht_omlaag'
    targetWeight = Math.max(weight_kg - inc, 1)
    advice = `${weight_kg} kg is te zwaar (${reps} reps < min ${range.min}) — probeer ${targetWeight} kg`
  } else if (reps >= range.max && effectiveRpe <= 8.5) {
    action = 'gewicht_omhoog'
    targetWeight = weight_kg + inc
    advice = `${reps} reps @ ${weight_kg} kg met RPE ${effectiveRpe} — klaar voor ${targetWeight} kg`
  } else if (reps >= range.max && effectiveRpe > 8.5) {
    action = 'consolideren'
    targetReps = `${range.min}–${range.max}`
    advice = `${reps} reps gehaald maar RPE ${effectiveRpe} — nog een ronde op ${weight_kg} kg`
  } else if (reps < range.max && effectiveRpe <= 8.0) {
    action = 'reps_omhoog'
    targetReps = `${reps + 1}–${range.max}`
    advice = `RPE ${effectiveRpe} — ruimte voor meer reps, push naar ${reps + 1}–${range.max}`
  } else if (effectiveRpe >= 9.0) {
    action = 'gewicht_omlaag'
    targetWeight = Math.max(weight_kg - inc, 1)
    advice = `RPE ${effectiveRpe} — te intensief, ga naar ${targetWeight} kg of schrap een set`
  } else {
    action = 'handhaven'
    advice = `${weight_kg} kg × ${reps} reps — zelfde gewicht, probeer ${Math.min(reps + 1, range.max)} reps`
  }

  return {
    exercise_title: exerciseTitle,
    action,
    advice,
    bestSet,
    targetWeight,
    targetReps,
    repRange: range,
  }
}

/**
 * Haalt de meest recente workout van een gegeven type op + de sets ervan,
 * en berekent per oefening het progressie-advies.
 *
 * workoutTitle: bijv. 'Push', 'Pull', 'Legs', 'Upper'
 *
 * Return: {
 *   workoutTitle,
 *   date,
 *   advices: CoachAdvice[],
 * } | null als geen recente sessie gevonden
 */
export async function fetchCoachAdviceForType(workoutTitle) {
  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id, title, start_date')
    .eq('title', workoutTitle)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (wErr) throw wErr
  if (!workouts) return null

  const { data: sets, error: sErr } = await supabase
    .from('sets')
    .select('exercise_title, set_type, weight_kg, reps, rpe, set_index')
    .eq('workout_id', workouts.id)
    .order('set_index', { ascending: true })

  if (sErr) throw sErr

  // Groepeer sets per oefening
  const byExercise = new Map()
  for (const s of sets) {
    if (!byExercise.has(s.exercise_title)) byExercise.set(s.exercise_title, [])
    byExercise.get(s.exercise_title).push(s)
  }

  const advices = []
  for (const [title, exerciseSets] of byExercise) {
    // Skip cardio/duration-only sets (geen weight/reps)
    const hasWeightSets = exerciseSets.some(
      (s) => s.set_type === 'normal' && s.weight_kg != null && s.reps != null
    )
    if (!hasWeightSets) continue

    const advice = adviseExercise(title, exerciseSets)
    if (advice) advices.push(advice)
  }

  // Sorteer: eerst de actionabele (gewicht/reps omhoog), dan handhaven, dan omlaag
  const order = { gewicht_omhoog: 0, reps_omhoog: 1, handhaven: 2, consolideren: 3, gewicht_omlaag: 4 }
  advices.sort((a, b) => (order[a.action] ?? 5) - (order[b.action] ?? 5))

  return {
    workoutTitle: workouts.title,
    date: workouts.start_date,
    advices,
  }
}

/**
 * Berekent de Training Readiness Score (1–10) deterministisch.
 *
 * Factoren:
 * - Dagen sinds laatste training: 0 = te vers (−2), 1 = goed, 2+ = ok, 4+ = wellicht te lang
 * - Gemiddelde RPE laatste sessie: > 9 = hoog vermoeid (−2), 8–9 = normaal, < 7 = licht
 * - Volume trend: huidige week vs gemiddelde van laatste 3 weken
 *
 * Geeft een score 1–10 + een korte statuslabel.
 */
export async function calculateReadinessScore() {
  const { data: workouts, error } = await supabase
    .from('workouts')
    .select('id, start_date')
    .order('start_date', { ascending: false })
    .limit(5)

  if (error) throw error
  if (!workouts || workouts.length === 0) return { score: 5, label: 'Onvoldoende data', color: 'neutral' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lastDate = new Date(workouts[0].start_date + 'T00:00:00Z')
  const daysSinceLast = Math.round((today - lastDate) / 86400000)

  // Haal RPE op van laatste sessie
  const { data: lastSets, error: sErr } = await supabase
    .from('sets')
    .select('rpe')
    .eq('workout_id', workouts[0].id)
    .eq('set_type', 'normal')
    .not('rpe', 'is', null)

  if (sErr) throw sErr

  const avgRpe = lastSets.length > 0
    ? lastSets.reduce((sum, s) => sum + s.rpe, 0) / lastSets.length
    : 8.0

  // Score opbouwen
  let score = 7.0

  // Dagen factor
  if (daysSinceLast === 0) score -= 2.5      // vandaag al getraind
  else if (daysSinceLast === 1) score += 0.5 // gisteren getraind, prima
  else if (daysSinceLast === 2) score += 1.0 // twee dagen rust, goed hersteld
  else if (daysSinceLast >= 4) score -= 0.5  // lang niet getraind, lichte detraining

  // RPE factor
  if (avgRpe >= 9.5) score -= 2.0
  else if (avgRpe >= 9.0) score -= 1.0
  else if (avgRpe <= 7.0) score += 0.5

  score = Math.max(1, Math.min(10, Math.round(score * 10) / 10))

  let label, color
  if (score >= 8) { label = 'Goed hersteld'; color = 'ok' }
  else if (score >= 6) { label = 'Klaar om te trainen'; color: 'ok'; color = 'neutral' }
  else if (score >= 4) { label = 'Matig hersteld'; color = 'warn' }
  else { label = 'Neem rust'; color = 'danger' }

  return { score, label, color, daysSinceLast, avgRpe: Math.round(avgRpe * 10) / 10 }
}

/**
 * Berekent het aantal weken op rij met >= minSessions sessies per week.
 */
export async function calculateStreak(minSessionsPerWeek = 3) {
  const { data: workouts, error } = await supabase
    .from('workouts')
    .select('start_date')
    .order('start_date', { ascending: false })

  if (error) throw error
  if (!workouts || workouts.length === 0) return { weeks: 0, heatmap: [] }

  // Groepeer per week (maandag-start)
  function getWeekStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z')
    const day = d.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setUTCDate(d.getUTCDate() + diff)
    return d.toISOString().slice(0, 10)
  }

  const sessionsByWeek = new Map()
  for (const w of workouts) {
    const ws = getWeekStart(w.start_date)
    sessionsByWeek.set(ws, (sessionsByWeek.get(ws) ?? 0) + 1)
  }

  // Huidige week (misschien nog niet vol) telt alleen mee als we al >= minSessions hebben
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const currentWeekStart = getWeekStart(today.toISOString().slice(0, 10))

  const sortedWeeks = [...sessionsByWeek.keys()].sort((a, b) => b.localeCompare(a))

  let streakWeeks = 0
  for (const week of sortedWeeks) {
    if (week === currentWeekStart) {
      // Huidige week: telt alleen mee als al vol
      if ((sessionsByWeek.get(week) ?? 0) >= minSessionsPerWeek) streakWeeks++
      continue
    }
    if ((sessionsByWeek.get(week) ?? 0) >= minSessionsPerWeek) {
      streakWeeks++
    } else {
      break
    }
  }

  // Heatmap: laatste 10 weken × 7 dagen
  const heatmapDays = []
  const workoutDates = new Set(workouts.map((w) => w.start_date))
  for (let i = 69; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    const ds = d.toISOString().slice(0, 10)
    const isToday = ds === today.toISOString().slice(0, 10)
    heatmapDays.push({
      date: ds,
      done: workoutDates.has(ds),
      isToday,
    })
  }

  return { weeks: streakWeeks, heatmap: heatmapDays }
}

/**
 * Haalt de beste week (hoogste volume) ooit op + het huidige weekvolume.
 */
export async function fetchBestWeekComparison(currentWeekVol) {
  function getWeekStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z')
    const day = d.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setUTCDate(d.getUTCDate() + diff)
    return d.toISOString().slice(0, 10)
  }

  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id, start_date')
  if (wErr) throw wErr

  if (!workouts || workouts.length === 0) return { bestWeekVolume: 0, pct: 0 }

  const { data: sets, error: sErr } = await supabase
    .from('sets')
    .select('workout_id, weight_kg, reps')
    .not('weight_kg', 'is', null)
    .not('reps', 'is', null)
  if (sErr) throw sErr

  const volByWorkout = new Map()
  for (const s of sets) {
    volByWorkout.set(s.workout_id, (volByWorkout.get(s.workout_id) ?? 0) + s.weight_kg * s.reps)
  }

  const volByWeek = new Map()
  for (const w of workouts) {
    const ws = getWeekStart(w.start_date)
    volByWeek.set(ws, (volByWeek.get(ws) ?? 0) + (volByWorkout.get(w.id) ?? 0))
  }

  const bestWeekVolume = Math.round(Math.max(...volByWeek.values()))
  const pct = bestWeekVolume > 0 ? Math.round((currentWeekVol / bestWeekVolume) * 100) : 0

  return { bestWeekVolume, pct }
}

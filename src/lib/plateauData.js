// src/lib/plateauData.js
//
// Plateau-detectie (conform PRD 4.12). Volledig deterministisch, geen
// AI-kosten. Draait op het Home-scherm als proactief signaal.
//
// Definitie van een plateau voor een oefening: over de laatste 3 sessies
// waarin die oefening voorkwam,
//   (a) is het top-set-gewicht niet gestegen, EN
//   (b) is de gemiddelde RPE niet gedaald (gelijk of gestegen)
// Beide voorwaarden moeten kloppen -- alleen (a) kan ook "je wordt sterker
// bij gelijke belasting" betekenen (RPE daalt), wat geen probleem is. Alleen
// (b) zonder (a) is een normale zware week.
//
// Minimaal 3 sessies nodig om uitspraak te doen -- bij minder data is het
// ruis, geen patroon.

import { supabase } from './supabase'

const SESSIONS_WINDOW = 3

/**
 * Top-set van een sessie voor één oefening = de set met het hoogste gewicht
 * (set_type 'normal' alleen -- warmups vertekenen het beeld).
 */
function topSetWeight(sets) {
  const normal = sets.filter((s) => s.set_type === 'normal' && s.weight_kg != null)
  if (normal.length === 0) return null
  return Math.max(...normal.map((s) => s.weight_kg))
}

function averageRpe(sets) {
  const withRpe = sets.filter((s) => s.set_type === 'normal' && s.rpe != null)
  if (withRpe.length === 0) return null
  return withRpe.reduce((sum, s) => sum + s.rpe, 0) / withRpe.length
}

/**
 * Detecteert plateaus over alle oefeningen die minimaal SESSIONS_WINDOW
 * sessies hebben. Geeft een array van plateau-signalen terug, gesorteerd
 * op meest recente sessie eerst.
 *
 * Return: [{ exercise_title, sessions: [{date, topWeight, avgRpe}, ...], weightTrend, rpeTrend }]
 */
export async function detectPlateaus() {
  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id, start_date')
  if (wErr) throw wErr
  const dateById = new Map(workouts.map((w) => [w.id, w.start_date]))

  const { data: sets, error: sErr } = await supabase
    .from('sets')
    .select('workout_id, exercise_title, set_type, weight_kg, reps, rpe')
  if (sErr) throw sErr

  // Groepeer per oefening, dan per sessie (workout_id).
  const byExercise = new Map()
  for (const s of sets) {
    const date = dateById.get(s.workout_id)
    if (!date) continue
    if (!byExercise.has(s.exercise_title)) byExercise.set(s.exercise_title, new Map())
    const bySession = byExercise.get(s.exercise_title)
    if (!bySession.has(s.workout_id)) bySession.set(s.workout_id, { date, sets: [] })
    bySession.get(s.workout_id).sets.push(s)
  }

  const plateaus = []

  for (const [exerciseTitle, bySession] of byExercise) {
    const sessions = Array.from(bySession.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((sess) => ({
        date: sess.date,
        topWeight: topSetWeight(sess.sets),
        avgRpe: averageRpe(sess.sets),
      }))
      .filter((sess) => sess.topWeight !== null) // sessies zonder gewicht (bv. cardio) overslaan

    if (sessions.length < SESSIONS_WINDOW) continue

    const recent = sessions.slice(-SESSIONS_WINDOW)

    const weights = recent.map((s) => s.topWeight)
    const weightNotIncreased = weights[weights.length - 1] <= weights[0]

    const rpes = recent.map((s) => s.avgRpe).filter((r) => r !== null)
    // Als er geen RPE-data is, kunnen we conditie (b) niet toetsen -- dan
    // is het voorzichtiger om geen plateau te melden (geen vals positief).
    if (rpes.length < 2) continue
    const rpeNotDecreased = rpes[rpes.length - 1] >= rpes[0]

    if (weightNotIncreased && rpeNotDecreased) {
      const weightTrend = weights[weights.length - 1] < weights[0] ? 'dalend' : 'gelijk'
      const rpeTrend = rpes[rpes.length - 1] > rpes[0] ? 'stijgend' : 'gelijk'
      plateaus.push({
        exercise_title: exerciseTitle,
        sessions: recent,
        weightTrend,
        rpeTrend,
        mostRecentDate: recent[recent.length - 1].date,
      })
    }
  }

  return plateaus.sort((a, b) => b.mostRecentDate.localeCompare(a.mostRecentDate))
}

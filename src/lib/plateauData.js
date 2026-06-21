// src/lib/plateauData.js
//
// Plateau-detectie (conform PRD 4.12). Volledig deterministisch, geen
// AI-kosten. Draait op het Home-scherm als proactief signaal.
//
// COACH-DEFINITIE (herzien): stagnatie is geen kwestie van "het gewicht
// bleef gelijk" alleen -- als je op hetzelfde gewicht meer reps haalt, is
// dat progressive overload, geen plateau. De juiste maatstaf is daarom de
// top-set e1RM (geschat 1RM via Epley, net als prData.js), die gewicht
// ÉN reps samen vangt in één vergelijkbaar getal.
//
// Een plateau voor een oefening: over de laatste 3 sessies waarin die
// oefening voorkwam,
//   (a) is de top-set e1RM niet gestegen (binnen een kleine ruismarge), EN
//   (b) is de gemiddelde RPE niet gedaald (gelijk of gestegen)
// Beide voorwaarden moeten kloppen -- (a) zonder (b) kan ook "je wordt
// sterker bij gelijke belasting" betekenen (RPE daalt), wat geen probleem
// is. (b) zonder (a) is een normale zware week.
//
// e1RM is alleen betrouwbaar tot en met 12 reps (zie prData.js) -- sets
// met meer reps worden voor de e1RM-vergelijking genegeerd, maar tellen
// nog wel mee voor de RPE-component.
//
// Minimaal 3 sessies nodig om uitspraak te doen -- bij minder data is het
// ruis, geen patroon.

import { supabase } from './supabase'

const SESSIONS_WINDOW = 3
const MAX_REPS_FOR_1RM = 12
// e1RM-stijging kleiner dan dit (kg) wordt als ruis beschouwd, niet als
// "echte" vooruitgang -- voorkomt dat een 0.1kg-afrondingsverschil een
// plateau-signaal wegpoetst.
const E1RM_NOISE_MARGIN = 0.5

function estimatedOneRepMax(weightKg, reps) {
  if (reps > MAX_REPS_FOR_1RM) return null
  return weightKg * (1 + reps / 30)
}

/**
 * Top-set van een sessie voor één oefening = de set met de hoogste e1RM
 * (set_type 'normal' alleen -- warmups vertekenen het beeld). Geeft ook
 * het bijbehorende gewicht/reps terug voor weergave.
 */
function topSetByE1RM(sets) {
  const normal = sets.filter((s) => s.set_type === 'normal' && s.weight_kg != null && s.reps != null)
  let best = null
  for (const s of normal) {
    const e1rm = estimatedOneRepMax(s.weight_kg, s.reps)
    if (e1rm === null) continue
    if (!best || e1rm > best.e1rm) {
      best = { e1rm, weight_kg: s.weight_kg, reps: s.reps }
    }
  }
  return best
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
 * Return: [{
 *   exercise_title,
 *   sessions: [{ date, e1rm, weight_kg, reps, avgRpe }, ...],
 *   e1rmTrend: 'dalend' | 'gelijk',
 *   rpeTrend: 'stijgend' | 'gelijk',
 * }]
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
      .map((sess) => {
        const top = topSetByE1RM(sess.sets)
        return {
          date: sess.date,
          e1rm: top ? Math.round(top.e1rm * 10) / 10 : null,
          weight_kg: top?.weight_kg ?? null,
          reps: top?.reps ?? null,
          avgRpe: averageRpe(sess.sets),
        }
      })
      .filter((sess) => sess.e1rm !== null) // sessies zonder bruikbare e1RM overslaan (bv. cardio, of alleen >12 reps)

    if (sessions.length < SESSIONS_WINDOW) continue

    const recent = sessions.slice(-SESSIONS_WINDOW)

    const e1rms = recent.map((s) => s.e1rm)
    const e1rmNotIncreased = e1rms[e1rms.length - 1] <= e1rms[0] + E1RM_NOISE_MARGIN

    const rpes = recent.map((s) => s.avgRpe).filter((r) => r !== null)
    // Als er geen RPE-data is, kunnen we conditie (b) niet toetsen -- dan
    // is het voorzichtiger om geen plateau te melden (geen vals positief).
    if (rpes.length < 2) continue
    const rpeNotDecreased = rpes[rpes.length - 1] >= rpes[0]

    if (e1rmNotIncreased && rpeNotDecreased) {
      const e1rmTrend = e1rms[e1rms.length - 1] < e1rms[0] ? 'dalend' : 'gelijk'
      const rpeTrend = rpes[rpes.length - 1] > rpes[0] ? 'stijgend' : 'gelijk'
      plateaus.push({
        exercise_title: exerciseTitle,
        sessions: recent,
        e1rmTrend,
        rpeTrend,
        mostRecentDate: recent[recent.length - 1].date,
      })
    }
  }

  return plateaus.sort((a, b) => b.mostRecentDate.localeCompare(a.mostRecentDate))
}

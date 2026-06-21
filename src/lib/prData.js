// src/lib/prData.js
//
// PR-tracking (conform PRD 4.11). Drie PR-types per oefening, uitsluitend
// berekend uit set_type = 'normal' (warmups tellen nooit mee voor een PR --
// anders zou een zware warmup een PR kunnen "stelen" van een echte werkset).
//
// 1. Estimated 1RM (Epley): weight_kg * (1 + reps / 30)
//    Alleen berekend voor reps <= 12 -- de Epley-formule wordt onbetrouwbaar
//    bij hogere reps (het verband tussen reps en krachtverlies is daar niet
//    meer lineair genoeg om een zinvolle 1RM-schatting te geven).
// 2. Rep-PR per gewicht: hoogste reps ooit gehaald op exact dat gewicht.
//    Vangt progressie die 1RM mist (3x8 -> 3x10 op gelijk gewicht).
// 3. Volume-PR per sessie: hoogste (som van weight_kg * reps) in een enkele
//    sessie voor die oefening. Vangt "meer totaal werk", los van piekgewicht.
//
// Alles deterministisch, geen AI-kosten.

import { supabase } from './supabase'

const MAX_REPS_FOR_1RM = 12

function estimatedOneRepMax(weightKg, reps) {
  if (reps > MAX_REPS_FOR_1RM) return null
  return weightKg * (1 + reps / 30)
}

/**
 * Haalt alle 'normal' sets op voor een gegeven oefening, met workout-datum,
 * gesorteerd oud -> nieuw.
 */
async function fetchNormalSetsForExercise(exerciseTitle) {
  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('id, start_date')
  if (wErr) throw wErr
  const dateById = new Map(workouts.map((w) => [w.id, w.start_date]))

  const { data: sets, error: sErr } = await supabase
    .from('sets')
    .select('workout_id, weight_kg, reps, set_type')
    .eq('exercise_title', exerciseTitle)
    .eq('set_type', 'normal')
    .not('weight_kg', 'is', null)
    .not('reps', 'is', null)
  if (sErr) throw sErr

  return sets
    .map((s) => ({ ...s, start_date: dateById.get(s.workout_id) }))
    .filter((s) => s.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
}

/**
 * Berekent de drie PR's voor één oefening, en geeft per PR ook terug of de
 * meest recente sessie 'm net heeft gezet (voor een "nieuwe PR!"-badge).
 *
 * Return: {
 *   exercise_title,
 *   oneRepMax: { value, weight_kg, reps, date, isRecent } | null,
 *   repPr: { weight_kg, reps, date, isRecent } | null,         // beste reps op het zwaarste gewicht waarop een rep-PR is gezet
 *   volumePr: { value, date, isRecent } | null,
 * }
 */
export async function calculatePRsForExercise(exerciseTitle) {
  const sets = await fetchNormalSetsForExercise(exerciseTitle)
  if (sets.length === 0) {
    return { exercise_title: exerciseTitle, oneRepMax: null, repPr: null, volumePr: null }
  }

  const mostRecentDate = sets[sets.length - 1].start_date

  // --- Estimated 1RM ---
  let best1RM = null
  for (const s of sets) {
    const est = estimatedOneRepMax(s.weight_kg, s.reps)
    if (est === null) continue
    if (!best1RM || est > best1RM.value) {
      best1RM = { value: Math.round(est * 10) / 10, weight_kg: s.weight_kg, reps: s.reps, date: s.start_date }
    }
  }

  // --- Rep-PR per gewicht: voor elk gewicht, het hoogste aantal reps ---
  const bestRepsByWeight = new Map() // weight_kg -> { reps, date }
  for (const s of sets) {
    const existing = bestRepsByWeight.get(s.weight_kg)
    if (!existing || s.reps > existing.reps) {
      bestRepsByWeight.set(s.weight_kg, { reps: s.reps, date: s.start_date })
    }
  }
  // "De" rep-PR die we tonen: het zwaarste gewicht dat ooit getild is,
  // met het bijbehorende rep-record. Dat is doorgaans de meest relevante
  // regel voor de coach-view (zwaarste gewicht x hoogste reps daarop).
  let repPr = null
  for (const [weight, info] of bestRepsByWeight) {
    if (!repPr || weight > repPr.weight_kg) {
      repPr = { weight_kg: weight, reps: info.reps, date: info.date }
    }
  }

  // --- Volume-PR per sessie ---
  const volumeByDate = new Map()
  for (const s of sets) {
    const vol = s.weight_kg * s.reps
    volumeByDate.set(s.start_date, (volumeByDate.get(s.start_date) ?? 0) + vol)
  }
  let bestVolume = null
  for (const [date, vol] of volumeByDate) {
    if (!bestVolume || vol > bestVolume.value) {
      bestVolume = { value: Math.round(vol), date }
    }
  }

  return {
    exercise_title: exerciseTitle,
    oneRepMax: best1RM ? { ...best1RM, isRecent: best1RM.date === mostRecentDate } : null,
    repPr: repPr ? { ...repPr, isRecent: repPr.date === mostRecentDate } : null,
    volumePr: bestVolume ? { ...bestVolume, isRecent: bestVolume.date === mostRecentDate } : null,
  }
}

/**
 * Haalt PR's op voor alle oefeningen die ooit een 'normal' set hebben gehad.
 * Gebruikt voor het PR-overzichtsscherm.
 */
export async function calculateAllPRs() {
  const { data: titles, error } = await supabase
    .from('sets')
    .select('exercise_title')
    .eq('set_type', 'normal')
  if (error) throw error

  const uniqueTitles = [...new Set(titles.map((t) => t.exercise_title))].sort()
  const results = await Promise.all(uniqueTitles.map((t) => calculatePRsForExercise(t)))
  return results
}

/**
 * Recente PR's (gezet op de meest recente sessie van die oefening) over alle
 * oefeningen heen -- voor een "nieuwe PR's deze sessie"-overzicht.
 */
export function extractRecentPRs(allPRs) {
  const recent = []
  for (const pr of allPRs) {
    if (pr.oneRepMax?.isRecent) {
      recent.push({ exercise_title: pr.exercise_title, type: '1RM', detail: `${pr.oneRepMax.value} kg (geschat)`, date: pr.oneRepMax.date })
    }
    if (pr.repPr?.isRecent) {
      recent.push({ exercise_title: pr.exercise_title, type: 'reps', detail: `${pr.repPr.reps} reps @ ${pr.repPr.weight_kg} kg`, date: pr.repPr.date })
    }
    if (pr.volumePr?.isRecent) {
      recent.push({ exercise_title: pr.exercise_title, type: 'volume', detail: `${pr.volumePr.value} kg totaal`, date: pr.volumePr.date })
    }
  }
  return recent
}

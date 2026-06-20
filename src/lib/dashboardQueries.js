// src/lib/dashboardQueries.js
//
// Read-only queries voor het dashboard. Gebruikt de Supabase anon-client
// (src/lib/supabase.js) rechtstreeks -- RLS staat uit, dus dit werkt zonder
// Edge Function. Single-user app, geen scoping nodig.

import { supabase } from './supabase'

/**
 * Haalt alle sets op van de laatste N weken, inclusief workout-datum en
 * gekoppelde spiergroep (via exercise_title-join op exercise_muscle_groups).
 */
export async function fetchSetsWithMuscleGroups(weeksBack = 12) {
  const since = new Date()
  since.setDate(since.getDate() - weeksBack * 7)

  const { data: workouts, error: workoutsError } = await supabase
    .from('workouts')
    .select('id, title, start_time, start_date')
    .gte('start_date', since.toISOString().slice(0, 10))

  if (workoutsError) throw workoutsError
  if (!workouts || workouts.length === 0) return []

  const workoutIds = workouts.map((w) => w.id)
  const workoutById = new Map(workouts.map((w) => [w.id, w]))

  const { data: sets, error: setsError } = await supabase
    .from('sets')
    .select('id, workout_id, exercise_title, set_index, set_type, weight_kg, reps, rpe')
    .in('workout_id', workoutIds)

  if (setsError) throw setsError

  const { data: mappings, error: mgError } = await supabase
    .from('exercise_muscle_groups')
    .select('exercise_title, muscle_group, contribution')

  if (mgError) throw mgError

  // Eén oefening kan meerdere spiergroepen aanspreken (bv. Incline DB
  // Press: borst primair, triceps secundair). Groepeer mappings per
  // exercise_title zodat we elke set kunnen "uitsplitsen" naar al zijn
  // betrokken spiergroepen, elk gewogen met de contributiefactor
  // (1.0 = primair, 0.5 = secundair).
  const mappingsByExercise = new Map()
  for (const m of mappings) {
    if (!mappingsByExercise.has(m.exercise_title)) mappingsByExercise.set(m.exercise_title, [])
    mappingsByExercise.get(m.exercise_title).push({ muscle_group: m.muscle_group, contribution: m.contribution })
  }

  const expanded = []
  for (const s of sets) {
    const groupMappings = mappingsByExercise.get(s.exercise_title) ?? [
      { muscle_group: 'ongecategoriseerd', contribution: 1.0 },
    ]
    for (const gm of groupMappings) {
      expanded.push({
        ...s,
        start_date: workoutById.get(s.workout_id)?.start_date,
        muscle_group: gm.muscle_group,
        contribution: gm.contribution,
      })
    }
  }

  return expanded
}

export async function fetchVolumeTargets() {
  const { data, error } = await supabase
    .from('muscle_group_volume_targets')
    .select('muscle_group, min_sets_per_week, max_sets_per_week')

  if (error) throw error
  return data
}

/**
 * Geeft de maandag (ISO-weekstart) van een gegeven datum terug, als
 * YYYY-MM-DD string.
 */
export function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() // 0 = zondag
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

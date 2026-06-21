// supabase/functions/upload-workouts/index.ts
//
// Verwacht een POST-body: { sessions: ParsedSession[] }
// waarbij elke sessie de vorm heeft die src/lib/hevyParser.js produceert:
//   { title, start_time (ISO), end_time (ISO), sets: [...] }
//
// Per sessie (conform PRD 4.1 / besluit 1 sectie 11):
// - Match op title + lokale kalenderdag van start_time (start_date kolom)
// - Bij match: bestaande sets voor die workout_id verwijderen, nieuwe
//   sets invoegen (delete+insert, geen upsert per set)
// - Geen match: nieuwe workout + sets aanmaken
// - Niet-gematchte bestaande sessies blijven ongemoeid (niet-destructief)
//
// Agenda-koppeling (nieuw):
// - Na het aanmaken/updaten van een workout wordt gezocht naar een
//   planned_workouts-rij met status 'planned', gelijke title en gelijke
//   planned_date (= lokale kalenderdag van start_time). Bij match wordt
//   die rij gekoppeld met linked_workout = workout.id. De status blijft
//   'planned': uitgevoerde dagen worden in de app afgeleid uit de workouts-tabel.
// - Geen match: planned_workouts blijft ongemoeid (geen plan = geen actie).
//
// Response: { created: number, updated: number, sessionResults: [...] }

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isAuthorized } from '../_shared/auth.ts'
import { create } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

async function getSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('JWT_SIGNING_SECRET')
  if (!secret) throw new Error('JWT_SIGNING_SECRET environment variable ontbreekt')
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

/**
 * Genereert een kortlevend intern token voor de server-naar-server call
 * naar analyze-session. Gebruikt hetzelfde HMAC-secret als verify-passcode,
 * zodat isAuthorized() in _shared/auth.ts deze zonder aanpassing accepteert.
 */
async function createInternalToken(): Promise<string> {
  const key = await getSigningKey()
  const now = Math.floor(Date.now() / 1000)
  return await create(
    { alg: 'HS256', typ: 'JWT' },
    { internal: true, iat: now, exp: now + 60 }, // 60s geldig, ruim genoeg voor één call
    key
  )
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IncomingSet {
  exercise_title: string
  set_index: number
  set_type: string
  weight_kg: number | null
  reps: number | null
  distance_km: number | null
  duration_seconds: number | null
  rpe: number | null
}

interface IncomingSession {
  title: string
  start_time: string
  end_time: string
  sets: IncomingSet[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authorized = await isAuthorized(req)
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sessions: IncomingSession[]
  try {
    const body = await req.json()
    sessions = body.sessions
    if (!Array.isArray(sessions) || sessions.length === 0) {
      throw new Error('Geen sessies aangeleverd')
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Ongeldige request-body: ${err.message}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Service-role key: enige plek in de app waar deze gebruikt wordt.
  // Negeert RLS sowieso, maar RLS staat hier al uit (architectuurkeuze:
  // toegang via deze Edge Function, niet via Supabase Auth-policies).
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let created = 0
  let updated = 0
  const sessionResults: Array<{
    title: string
    start_time: string
    status: string
    error?: string
    plannedMatch?: boolean
  }> = []

  for (const session of sessions) {
    try {
      // Lokale kalenderdag bepalen (Europe/Amsterdam), consistent met de
      // gegenereerde start_date-kolom in het schema.
      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Amsterdam',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(session.start_time))
      const todayDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Amsterdam',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())

      // Zoek bestaande workout met gelijke titel + lokale dag.
      const { data: existing, error: lookupError } = await supabase
        .from('workouts')
        .select('id')
        .eq('title', session.title)
        .eq('start_date', localDate)
        .maybeSingle()

      if (lookupError) throw lookupError

      let workoutId: string

      if (existing) {
        // Match gevonden: workout-metadata verversen, sets vervangen.
        workoutId = existing.id

        const { error: updateError } = await supabase
          .from('workouts')
          .update({ start_time: session.start_time, end_time: session.end_time })
          .eq('id', workoutId)
        if (updateError) throw updateError

        const { error: deleteError } = await supabase
          .from('sets')
          .delete()
          .eq('workout_id', workoutId)
        if (deleteError) throw deleteError

        updated++
      } else {
        // Geen match: nieuwe workout aanmaken.
        const { data: inserted, error: insertError } = await supabase
          .from('workouts')
          .insert({
            title: session.title,
            start_time: session.start_time,
            end_time: session.end_time,
          })
          .select('id')
          .single()
        if (insertError) throw insertError

        workoutId = inserted.id
        created++
      }

      // Sets invoegen (zowel bij nieuwe als ververste workout).
      if (session.sets.length > 0) {
        const setsToInsert = session.sets.map((s) => ({
          workout_id: workoutId,
          exercise_title: s.exercise_title,
          set_index: s.set_index,
          set_type: s.set_type,
          weight_kg: s.weight_kg,
          reps: s.reps,
          distance_km: s.distance_km,
          duration_seconds: s.duration_seconds,
          rpe: s.rpe,
        }))

        const { error: setsInsertError } = await supabase.from('sets').insert(setsToInsert)
        if (setsInsertError) throw setsInsertError

        // Onbekende oefeningen automatisch markeren als "ongecategoriseerd"
        // conform PRD 4.4 -- alleen invoegen als de oefening nog geen
        // enkele spiergroep-koppeling heeft (many-to-many: een oefening
        // kan meerdere rijen hebben, dus check op exercise_title i.p.v.
        // op de oude PK-upsert).
        const uniqueExerciseTitles = [...new Set(session.sets.map((s) => s.exercise_title))]
        for (const title of uniqueExerciseTitles) {
          const { data: existingMapping, error: mappingLookupError } = await supabase
            .from('exercise_muscle_groups')
            .select('id')
            .eq('exercise_title', title)
            .limit(1)
          if (mappingLookupError) throw mappingLookupError

          if (!existingMapping || existingMapping.length === 0) {
            const { error: muscleGroupError } = await supabase
              .from('exercise_muscle_groups')
              .insert({ exercise_title: title, muscle_group: 'Ongecategoriseerd', contribution: 1.0 })
            if (muscleGroupError) throw muscleGroupError
          }
        }
      }

      // Agenda-koppeling: zoek een geplande sessie met gelijke titel +
      // gelijke dag die nog openstaat, en koppel die aan deze workout.
      // planned_workouts.status accepteert alleen planningstatussen; de
      // kalender toont uitvoering via de workouts-tabel.
      let plannedMatch = false
      const { data: plannedRow, error: plannedLookupError } = await supabase
        .from('planned_workouts')
        .select('id')
        .eq('title', session.title)
        .eq('planned_date', localDate)
        .eq('status', 'planned')
        .maybeSingle()

      if (plannedLookupError) throw plannedLookupError

      if (plannedRow) {
        const { error: plannedUpdateError } = await supabase
          .from('planned_workouts')
          .update({ linked_workout_id: workoutId })
          .eq('id', plannedRow.id)
        if (plannedUpdateError) throw plannedUpdateError
        plannedMatch = true
      }

      sessionResults.push({
        title: session.title,
        start_time: session.start_time,
        status: existing ? 'updated' : 'created',
        plannedMatch,
      })

      // AI-analyse triggeren voor sessies vanaf vandaag. Zo kan een
      // her-upload van de huidige sessie een eerder gemiste analyse alsnog
      // vullen, zonder historische workouts met terugwerkende kracht te
      // analyseren. analyze-session is idempotent en slaat over als er al
      // een ai_analyses-rij voor deze workout bestaat.
      if (localDate >= todayDate) {
        try {
          const internalToken = await createInternalToken()
          const analyzeRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${internalToken}`,
            },
            body: JSON.stringify({ workout_id: workoutId }),
          })
          if (!analyzeRes.ok) {
            console.error(`AI-analyse mislukt voor workout ${workoutId}: ${await analyzeRes.text()}`)
          }
        } catch (analyzeErr) {
          console.error(`AI-analyse mislukt voor workout ${workoutId}: ${analyzeErr.message}`)
        }
      }
    } catch (err) {
      sessionResults.push({
        title: session.title,
        start_time: session.start_time,
        status: 'error',
        error: err.message,
      })
    }
  }

  return new Response(JSON.stringify({ created, updated, sessionResults }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

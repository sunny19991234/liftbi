// supabase/functions/analyze-session/index.ts
//
// Genereert een AI-hypertrofiecoach-analyse voor één workout, conform PRD 4.5.
// Wordt aangeroepen door upload-workouts direct na het aanmaken van een
// NIEUWE workout (nooit voor 'updated' sessies, en nooit met terugwerkende
// kracht voor reeds bestaande data -- die check gebeurt in de aanroeper).
//
// Tokenkosten geminimaliseerd door:
// - alleen de huidige sessie + max. 2 voorgaande sessies van hetzelfde type
//   (zelfde title) mee te sturen, niet de hele historie
// - een compacte CSV-achtige representatie i.p.v. verbose JSON
// - max_tokens beperkt tot wat het uitvoerschema nodig heeft
//
// Idempotent: als er al een ai_analyses-rij bestaat voor workout_id, wordt
// niets opnieuw gegenereerd (PRD 4.5: "geen herhaalde generatie bij
// herhaalde uploads van dezelfde sessie").

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isAuthorized } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Rol: Je bent een ervaren hypertrofie-coach met grondige kennis van trainingswetenschap (progressive overload, RPE-sturing, volumelandmarks per spiergroep, herstelfrequentie).

Context:
• Split: PPL + Upper, gericht op hypertrofie.
• RPE-doel: gemiddeld 8 op werksets, niet structureel 9-10 op de laatste set.
• Aandachtspunt: warm-up cardio vóór zware compound lifts.
• Ben in herstel na niertransplantatie (maart 2026) — neem dit alleen mee als het relevant is voor advies over intensiteit/herstelcapaciteit, niet standaard benoemen.

Data: Hevy CSV-export. Kolommen: title, start_time, end_time, exercise_title, set_index, set_type (warmup/normal), weight_kg, reps, distance_km, duration_seconds, rpe.

Opdracht:
1. De meest recente sessie in de data is "vandaag". Vergelijk met de voorgaande sessie(s) van hetzelfde type (zelfde title).
2. Per oefening: beoordeel per set of de progressie (gewicht × reps × RPE) t.o.v. vorige keer een vooruitgang, stagnatie of achteruitgang is. Benoem concreet wat goed ging en wat niet (te snel naar RPE 9-10, geen warm-up gedaan, reps buiten de doelrange: 6-10 voor compound oefeningen, 8-12 voor isolatie-oefeningen, etc.).
3. Geef een cijfer (1-10) op: progressive overload, RPE-management, warm-up consistentie, volume per spiergroep, oefenkeuze/mix.
4. Helicopter view over de beschikbare weken in de data: sets per spiergroep per week, disbalans (structureel te veel/te weinig), trainingsfrequentie toereikend voor herstel + groei.
5. Top 3 concrete aanbevelingen voor de volgende sessie van dit type.

Stijl: kritisch, eerlijk, onderbouwd met cijfers uit de data — geen onnodige complimenten.

Output: uitsluitend geldig JSON, geen markdown, geen toelichting eromheen, exact volgens dit schema:
{
  "summary": "string, korte tekstsamenvatting",
  "exercises": [
    { "exercise_title": "string", "verdict": "progressie|stagnatie|achteruitgang", "explanation": "string" }
  ],
  "scores": {
    "progressive_overload": 1-10,
    "rpe_management": 1-10,
    "warmup_consistency": 1-10,
    "volume_per_spiergroep": 1-10,
    "oefenkeuze": 1-10
  },
  "weekly_overview": [
    { "muscle_group": "string", "sets_per_week": number, "trend": "string", "note": "string" }
  ],
  "recommendations": ["string", "string", "string"]
}`

interface SetRow {
  exercise_title: string
  set_index: number
  set_type: string
  weight_kg: number | null
  reps: number | null
  rpe: number | null
}

function toCompactCsv(workout: { title: string; start_time: string }, sets: SetRow[]): string {
  const header = 'title,start_time,exercise_title,set_index,set_type,weight_kg,reps,rpe'
  const lines = sets.map((s) =>
    [
      workout.title,
      workout.start_time,
      s.exercise_title,
      s.set_index,
      s.set_type,
      s.weight_kg ?? '',
      s.reps ?? '',
      s.rpe ?? '',
    ].join(',')
  )
  return [header, ...lines].join('\n')
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

  let workoutId: string
  try {
    const body = await req.json()
    workoutId = body.workout_id
    if (!workoutId) throw new Error('workout_id ontbreekt')
  } catch (err) {
    return new Response(JSON.stringify({ error: `Ongeldige body: ${err.message}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Idempotentie: bestaat er al een analyse voor deze workout?
    const { data: existingAnalysis, error: existingError } = await supabase
      .from('ai_analyses')
      .select('id')
      .eq('workout_id', workoutId)
      .maybeSingle()
    if (existingError) throw existingError

    if (existingAnalysis) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Analyse bestaat al' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Huidige workout ophalen.
    const { data: currentWorkout, error: workoutError } = await supabase
      .from('workouts')
      .select('id, title, start_time, start_date')
      .eq('id', workoutId)
      .single()
    if (workoutError) throw workoutError

    // Max. 2 voorgaande sessies van hetzelfde type (titel), vóór deze datum.
    const { data: priorWorkouts, error: priorError } = await supabase
      .from('workouts')
      .select('id, title, start_time, start_date')
      .eq('title', currentWorkout.title)
      .lt('start_date', currentWorkout.start_date)
      .order('start_date', { ascending: false })
      .limit(2)
    if (priorError) throw priorError

    const relevantWorkouts = [currentWorkout, ...priorWorkouts]
    const relevantWorkoutIds = relevantWorkouts.map((w) => w.id)

    const { data: allSets, error: setsError } = await supabase
      .from('sets')
      .select('workout_id, exercise_title, set_index, set_type, weight_kg, reps, rpe')
      .in('workout_id', relevantWorkoutIds)
    if (setsError) throw setsError

    const setsByWorkout = new Map<string, SetRow[]>()
    for (const s of allSets) {
      if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, [])
      setsByWorkout.get(s.workout_id)!.push(s)
    }

    // Compacte CSV-blokken, oudste eerst zodat Claude de tijdsvolgorde leest
    // zoals in de oorspronkelijke prompt-instructie ("meest recente = vandaag").
    const csvBlocks = [...relevantWorkouts]
      .reverse()
      .map((w) => toCompactCsv(w, setsByWorkout.get(w.id) ?? []))
      .join('\n\n')

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY ontbreekt in Edge Function secrets')

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: csvBlocks }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      throw new Error(`Claude API-fout (${claudeRes.status}): ${errText}`)
    }

    const claudeData = await claudeRes.json()
    const rawText = claudeData.content?.[0]?.text
    if (!rawText) throw new Error('Geen tekstrespons van Claude ontvangen')

    let parsedContent: unknown
    try {
      const firstBrace = rawText.indexOf('{')
      const lastBrace = rawText.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
        throw new Error('Geen JSON-object gevonden in respons')
      }
      const cleaned = rawText.slice(firstBrace, lastBrace + 1)
      parsedContent = JSON.parse(cleaned)
    } catch (parseErr) {
      throw new Error(`Claude-respons is geen geldig JSON (${parseErr.message}): ${rawText.slice(0, 300)}`)
    }

    const { error: insertError } = await supabase.from('ai_analyses').insert({
      workout_id: workoutId,
      content: parsedContent,
      model: 'claude-sonnet-4-6',
    })
    if (insertError) throw insertError

    return new Response(JSON.stringify({ skipped: false, content: parsedContent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
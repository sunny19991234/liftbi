// src/lib/hevyParser.js
//
// Parseert een Hevy CSV-export naar het formaat dat upload-workouts verwacht:
//   { sessions: [ { title, start_time (ISO), end_time (ISO), sets: [...] } ] }
//
// CSV-kolommen (Hevy-export):
//   title, start_time, end_time, description, exercise_title, superset_id,
//   exercise_notes, set_index, set_type, weight_kg, reps, distance_km,
//   duration_seconds, rpe
//
// Groepering: rijen met dezelfde title + start_time + end_time vormen één sessie.
// Datums in de CSV zijn lokale tijd zonder tz-suffix (bv. "Jun 19, 2026, 9:40 AM"),
// geïnterpreteerd als Europe/Amsterdam en geconverteerd naar ISO/UTC, zodat de
// gegenereerde start_date-kolom in Supabase (Europe/Amsterdam) klopt.

import Papa from 'papaparse'

const TIME_ZONE = 'Europe/Amsterdam'

/**
 * Parseert "MMM D, YYYY, H:MM AM/PM" als lokale Europe/Amsterdam-tijd
 * en geeft een ISO 8601 UTC-string terug.
 */
function parseHevyDateToISO(raw) {
  if (!raw) return null

  const match = raw
    .trim()
    .match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2})\s?(AM|PM)$/i)
  if (!match) {
    throw new Error(`Onherkenbaar datumformaat: "${raw}"`)
  }

  const [, monStr, dayStr, yearStr, hourStr, minStr, meridiem] = match
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  }
  const month = months[monStr.toLowerCase()]
  if (month === undefined) {
    throw new Error(`Onbekende maand in datum: "${raw}"`)
  }

  let hour = parseInt(hourStr, 10) % 12
  if (meridiem.toUpperCase() === 'PM') hour += 12

  // Construeer als UTC-"wandtijd", reken vervolgens het Amsterdam-offset
  // eraf door het verschil te meten tussen hoe deze wandtijd in Amsterdam
  // eruitziet vs. in UTC.
  const naiveUTC = Date.UTC(
    parseInt(yearStr, 10),
    month,
    parseInt(dayStr, 10),
    hour,
    parseInt(minStr, 10)
  )

  const offsetMinutes = getTimeZoneOffsetMinutes(naiveUTC, TIME_ZONE)
  const realUTC = naiveUTC - offsetMinutes * 60_000

  return new Date(realUTC).toISOString()
}

/**
 * Bepaalt het offset (in minuten, UTC - lokale tijd) van een tijdzone
 * op een gegeven UTC-timestamp, rekening houdend met DST.
 */
function getTimeZoneOffsetMinutes(utcMillis, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMillis))
  const get = (type) => parts.find((p) => p.type === type).value

  const asUTC = Date.UTC(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    parseInt(get('hour'), 10),
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10)
  )

  return (asUTC - utcMillis) / 60_000
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

/**
 * Parseert Hevy CSV-tekst naar { sessions: [...] }.
 * Gooit een Error met duidelijke melding bij ontbrekende verplichte kolommen.
 */
export function parseHevyCsv(csvText) {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  if (result.errors.length > 0) {
    const first = result.errors[0]
    throw new Error(`CSV-parsefout op rij ${first.row}: ${first.message}`)
  }

  const rows = result.data
  if (rows.length === 0) {
    throw new Error('CSV bevat geen datarijen')
  }

  const requiredColumns = ['title', 'start_time', 'end_time', 'exercise_title', 'set_index', 'set_type']
  const headerKeys = Object.keys(rows[0])
  for (const col of requiredColumns) {
    if (!headerKeys.includes(col)) {
      throw new Error(`Verplichte kolom ontbreekt in CSV: "${col}"`)
    }
  }

  // Groepeer rijen op title + start_time + end_time (= één sessie).
  const sessionMap = new Map()

  rows.forEach((row, idx) => {
    const rowNum = idx + 2 // +1 voor 0-index, +1 voor header-rij

    if (!row.title || !row.start_time || !row.end_time || !row.exercise_title) {
      throw new Error(`Rij ${rowNum}: ontbrekende verplichte waarde (title/start_time/end_time/exercise_title)`)
    }

    const key = `${row.title}__${row.start_time}__${row.end_time}`

    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        title: row.title,
        start_time: parseHevyDateToISO(row.start_time),
        end_time: parseHevyDateToISO(row.end_time),
        sets: [],
      })
    }

    const setIndex = toNullableNumber(row.set_index)
    if (setIndex === null) {
      throw new Error(`Rij ${rowNum}: ongeldige set_index "${row.set_index}"`)
    }

    sessionMap.get(key).sets.push({
      exercise_title: row.exercise_title,
      set_index: setIndex,
      set_type: row.set_type || 'normal',
      weight_kg: toNullableNumber(row.weight_kg),
      reps: toNullableNumber(row.reps),
      distance_km: toNullableNumber(row.distance_km),
      duration_seconds: toNullableNumber(row.duration_seconds),
      rpe: toNullableNumber(row.rpe),
    })
  })

  return { sessions: Array.from(sessionMap.values()) }
}
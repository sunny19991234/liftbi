// src/lib/deloadData.js
//
// Beheert deload weken: ophalen, togglen en hulpfuncties voor
// het bepalen of een week een deload week is en hoeveel weken
// er verstreken zijn sinds de laatste deload.

import { supabase } from './supabase'
import { getWeekStart } from './dashboardQueries'
import { getTodayStr } from './calendarData'

/**
 * Haalt alle deload week-starts op, gesorteerd oud → nieuw.
 * Geeft [] terug als de tabel nog niet bestaat.
 */
export async function fetchDeloadWeeks() {
  const { data, error } = await supabase
    .from('deload_weeks')
    .select('week_start')
    .order('week_start', { ascending: true })
  if (error) return []
  return (data ?? []).map(r => r.week_start)
}

/**
 * Zet een week aan/uit als deload. weekStart = ISO-datum (maandag).
 * Geeft true terug als de week nu een deload is, false als het verwijderd is.
 */
export async function toggleDeloadWeek(weekStart) {
  const { data: existing } = await supabase
    .from('deload_weeks')
    .select('id')
    .eq('week_start', weekStart)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('deload_weeks').delete().eq('week_start', weekStart)
    if (error) throw error
    return false
  } else {
    const { error } = await supabase.from('deload_weeks').insert({ week_start: weekStart })
    if (error) throw error
    return true
  }
}

/**
 * Checkt of een weekStart (ISO-datum maandag) een deload week is.
 */
export function isDeloadWeek(weekStart, deloadSet) {
  if (!weekStart || !deloadSet) return false
  return deloadSet.has(weekStart)
}

/**
 * Berekent hoeveel weken er verstreken zijn sinds de laatste deload week.
 * Geeft { weeksSince, lastDeloadWeekStart } terug.
 * weeksSince = 1 voor de week direct na de deload, 2 voor de week daarna, etc.
 * null als er nog nooit een deload was.
 */
export function getWeeksSinceDeload(deloadWeeksArr) {
  const today = getTodayStr()
  const currentWeekStart = getWeekStart(today)

  const pastDeloads = deloadWeeksArr
    .filter(ws => ws < currentWeekStart)
    .sort()

  if (pastDeloads.length === 0) return { weeksSince: null, lastDeloadWeekStart: null }

  const lastDeload = pastDeloads[pastDeloads.length - 1]
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const diff = new Date(currentWeekStart + 'T00:00:00Z') - new Date(lastDeload + 'T00:00:00Z')
  const weeksSince = Math.round(diff / msPerWeek)

  return { weeksSince, lastDeloadWeekStart: lastDeload }
}

// src/lib/imbalanceData.js
//
// Disbalans-signalering (PRD 4.7), herbruikt voor het Home-dashboard.
// Berekent sets per spiergroep voor de huidige kalenderweek en vergelijkt
// tegen muscle_group_volume_targets. Geeft alleen spiergroepen terug die
// buiten de bandbreedte vallen -- "in lijn" is geen actiepunt.
//
// BELANGRIJK: gebruikt exact dezelfde aggregatie-aanpak als
// VolumeDashboard.jsx (groeperen per getWeekStart(start_date), huidige
// week = de week waarvan getWeekStart gelijk is aan getWeekStart(vandaag)).
// Eerder gebruikte deze module een eigen datumfilter die net niet identiek
// was aan de Volume-tab, waardoor de twee schermen andere getallen toonden
// voor "deze week". Door dezelfde groepeerlogica te hergebruiken kan dat
// niet meer uit elkaar lopen.

import { fetchSetsWithMuscleGroups, fetchVolumeTargets, getWeekStart } from './dashboardQueries'
import { getTodayStr } from './calendarData'

/**
 * Return: [{ muscle_group, setCount, min, max, status: 'low' | 'high' }]
 * gesorteerd op grootste afwijking eerst.
 */
export async function detectImbalances() {
  const [sets, targets] = await Promise.all([
    fetchSetsWithMuscleGroups(3), // ruim genoeg venster; we filteren hieronder alsnog exact op huidige week
    fetchVolumeTargets(),
  ])

  const currentWeekStart = getWeekStart(getTodayStr())

  // Zelfde groepering als VolumeDashboard.jsx: per spiergroep, per
  // week-start (maandag), sommeer setCount met contributiefactor.
  const setCountByGroup = new Map() // muscle_group -> setCount

  for (const s of sets) {
    if (!s.start_date) continue
    const week = getWeekStart(s.start_date)
    if (week !== currentWeekStart) continue

    const factor = s.contribution ?? 1.0
    setCountByGroup.set(s.muscle_group, (setCountByGroup.get(s.muscle_group) ?? 0) + factor)
  }

  const results = []
  for (const target of targets) {
    const raw = setCountByGroup.get(target.muscle_group) ?? 0
    const setCount = Math.round(raw * 10) / 10

    let status = null
    let distance = 0
    if (setCount < target.min_sets_per_week) {
      status = 'low'
      distance = target.min_sets_per_week - setCount
    } else if (setCount > target.max_sets_per_week) {
      status = 'high'
      distance = setCount - target.max_sets_per_week
    }
    if (status) {
      results.push({
        muscle_group: target.muscle_group,
        setCount,
        min: target.min_sets_per_week,
        max: target.max_sets_per_week,
        status,
        distance,
      })
    }
  }

  return results.sort((a, b) => b.distance - a.distance)
}

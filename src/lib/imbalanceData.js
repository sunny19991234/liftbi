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
import { fetchDeloadWeeks } from './deloadData'
import { getTodayStr } from './calendarData'

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const SPLIT_MUSCLE_MAP = {
  Push:  ['Borst', 'Schouders', 'Triceps'],
  Pull:  ['Rug', 'Biceps', 'Forearms'],
  Legs:  ['Benen'],
  Upper: ['Borst', 'Rug', 'Schouders', 'Biceps', 'Triceps'],
}

/**
 * Return: [{ muscle_group, setCount, min, max, status: 'low' | 'high' }]
 * gesorteerd op grootste afwijking eerst.
 *
 * @param {Array<{title: string, planned_date: string}>} upcomingPlanned
 */
export async function detectImbalances(upcomingPlanned = []) {
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
      // Signalen voor 'high' zijn altijd relevant; onderdruk alleen 'low'-signalen
      if (status === 'low') {
        // Voorwaarde 1: geplande sessie deze week die spiergroep aanspreekt?
        const covered = upcomingPlanned.some((p) => {
          const muscles = SPLIT_MUSCLE_MAP[p.title] ?? []
          return muscles.includes(target.muscle_group)
        })
        if (covered) continue

        // Voorwaarde 2: achterstand op weekpace (ma=1 … zo=7, UTC)
        const todayUtc = new Date(getTodayStr() + 'T00:00:00Z')
        const rawDay = todayUtc.getUTCDay() // 0=zo
        const dayOfWeek = rawDay === 0 ? 7 : rawDay // ma=1 … zo=7
        const weekProgress = dayOfWeek / 7
        const paceThreshold = target.min_sets_per_week * weekProgress * 0.6
        if (setCount >= paceThreshold) continue
      }

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

/**
 * Berekent over hoeveel van de afgelopen N weken elke spiergroep in de
 * target range zat. Sluit de huidige (lopende) week en deload weken uit.
 *
 * Return: Array gesorteerd op hitRate ASC (laagste eerst):
 *   { muscle_group, hitRate, weeksInRange, totalWeeks, min, max }
 */
export async function calculateHitRate(weeksBack) {
  if (weeksBack === -1) return []  // vorige week: te weinig data voor hit rate

  const effectiveWeeks = weeksBack === 0 ? 520 : weeksBack
  const [sets, targets, deloadWeeksArr] = await Promise.all([
    fetchSetsWithMuscleGroups(effectiveWeeks + 2),
    fetchVolumeTargets(),
    fetchDeloadWeeks(),
  ])

  const today           = getTodayStr()
  const currentWeekStart = getWeekStart(today)
  const deloadSet        = new Set(deloadWeeksArr)

  // Bouw volledige weeklijst (excl. lopende week)
  const weeks = []
  if (weeksBack === 0) {
    if (!sets.length) return []
    const earliest = sets
      .map(s => s.start_date)
      .filter(Boolean)
      .reduce((a, b) => (a < b ? a : b))
    let cur = getWeekStart(earliest)
    while (cur < currentWeekStart) {
      weeks.push(cur)
      cur = addDays(cur, 7)
    }
  } else {
    for (let i = weeksBack - 1; i >= 1; i--) {
      weeks.push(getWeekStart(addDays(today, -i * 7)))
    }
  }

  // Filter deload weken
  const workWeeks = weeks.filter(w => !deloadSet.has(w))
  if (workWeeks.length < 2) return []
  const workWeekSet = new Set(workWeeks)

  // Sets per spiergroep per week sommeren
  const setsByMgByWeek = new Map()
  for (const s of sets) {
    if (!s.start_date) continue
    const ws = getWeekStart(s.start_date)
    if (!workWeekSet.has(ws)) continue
    const mg     = s.muscle_group
    const factor = s.contribution ?? 1.0
    if (!setsByMgByWeek.has(mg)) setsByMgByWeek.set(mg, new Map())
    const mgMap = setsByMgByWeek.get(mg)
    mgMap.set(ws, (mgMap.get(ws) ?? 0) + factor)
  }

  const results = []
  for (const target of targets) {
    const mg    = target.muscle_group
    const min   = target.min_sets_per_week
    const max   = target.max_sets_per_week
    const mgMap = setsByMgByWeek.get(mg) ?? new Map()

    let weeksInRange = 0
    for (const ws of workWeeks) {
      const count = Math.round((mgMap.get(ws) ?? 0) * 10) / 10
      if (count >= min && count <= max) weeksInRange++
    }

    const totalWeeks = workWeeks.length
    results.push({
      muscle_group: mg,
      hitRate:      totalWeeks > 0 ? weeksInRange / totalWeeks : 0,
      weeksInRange,
      totalWeeks,
      min,
      max,
    })
  }

  return results.sort((a, b) => a.hitRate - b.hitRate)
}

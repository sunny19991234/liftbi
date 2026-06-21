// src/components/PersonalRecords.jsx
//
// PR-tracking (PRD 4.11). Toont per oefening de drie PR-types
// (estimated 1RM, rep-PR, volume-PR), met een "nieuwe PR's"-sectie
// bovenaan voor PR's gezet op de meest recente sessie van die oefening.

import { useEffect, useMemo, useState } from 'react'
import { calculateAllPRs, extractRecentPRs } from '../lib/prData'

const TYPE_LABEL = { '1RM': 'Estimated 1RM', reps: 'Rep-PR', volume: 'Volume-PR' }
const TYPE_COLOR = { '1RM': 'text-[var(--color-accent)]', reps: 'text-[var(--color-data)]', volume: 'text-[var(--color-status-ok)]' }

export default function PersonalRecords() {
  const [allPRs, setAllPRs] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    calculateAllPRs()
      .then(setAllPRs)
      .catch((err) => setError(err.message))
  }, [])

  const recentPRs = useMemo(() => (allPRs ? extractRecentPRs(allPRs) : []), [allPRs])

  const filteredPRs = useMemo(() => {
    if (!allPRs) return []
    const withAnyPr = allPRs.filter((p) => p.oneRepMax || p.repPr || p.volumePr)
    if (!query.trim()) return withAnyPr
    const q = query.toLowerCase()
    return withAnyPr.filter((p) => p.exercise_title.toLowerCase().includes(q))
  }, [allPRs, query])

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout bij laden: {error}</p>
  }
  if (!allPRs) {
    return <p className="text-[var(--color-text-secondary)] p-plate-4 font-[var(--font-mono)] text-sm">Laden...</p>
  }

  return (
    <div className="max-w-4xl mx-auto p-plate-4 flex flex-col gap-plate-4">
      <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
        Personal Records
      </h2>

      {recentPRs.length > 0 && (
        <div className="surface-hero rounded-2xl p-plate-4 pulse-once">
          <div className="loaded-bar -mx-plate-4 -mt-plate-4 mb-plate-3 rounded-t-2xl" style={{ '--load-pct': '100%' }} />
          <p className="text-xs text-[var(--color-accent)] font-[var(--font-mono)] tracking-wide uppercase mb-plate-2">
            Nieuwe PR's — laatste sessie
          </p>
          <div className="flex flex-col gap-plate-2">
            {recentPRs.map((pr, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <span className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] font-medium">{pr.exercise_title}</span>
                  <span className={`ml-2 font-[var(--font-mono)] text-xs ${TYPE_COLOR[pr.type]}`}>{TYPE_LABEL[pr.type]}</span>
                </div>
                <span className="font-[var(--font-mono)] text-sm text-[var(--color-text-primary)] tabular-data">{pr.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Zoek oefening..."
        className="bg-[var(--color-card)] text-[var(--color-text-primary)] rounded-lg px-plate-3 py-plate-2 outline-none border border-transparent focus:border-[var(--color-accent)] font-[var(--font-body)] text-sm"
      />

      {filteredPRs.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">Geen PR's gevonden.</p>
      ) : (
        <div className="surface rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-secondary)] font-[var(--font-body)] border-b border-[var(--color-border-subtle)]">
                <th className="py-plate-2 px-plate-3 font-normal">Oefening</th>
                <th className="py-plate-2 px-plate-3 font-normal text-right">Est. 1RM</th>
                <th className="py-plate-2 px-plate-3 font-normal text-right">Rep-PR</th>
                <th className="py-plate-2 px-plate-3 font-normal text-right">Volume-PR</th>
              </tr>
            </thead>
            <tbody>
              {filteredPRs.map((pr) => (
                <tr key={pr.exercise_title} className="border-b border-[var(--color-border-subtle)] last:border-0">
                  <td className="py-plate-2 px-plate-3 text-[var(--color-text-primary)] font-[var(--font-body)]">{pr.exercise_title}</td>
                  <td className="py-plate-2 px-plate-3 text-right font-[var(--font-mono)] tabular-data">
                    {pr.oneRepMax ? (
                      <span className={pr.oneRepMax.isRecent ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-primary)]'}>
                        {pr.oneRepMax.value} kg
                        <span className="block text-[10px] text-[var(--color-text-tertiary)]">{pr.oneRepMax.weight_kg}kg × {pr.oneRepMax.reps}</span>
                      </span>
                    ) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                  </td>
                  <td className="py-plate-2 px-plate-3 text-right font-[var(--font-mono)] tabular-data">
                    {pr.repPr ? (
                      <span className={pr.repPr.isRecent ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-primary)]'}>
                        {pr.repPr.reps} reps
                        <span className="block text-[10px] text-[var(--color-text-tertiary)]">@ {pr.repPr.weight_kg} kg</span>
                      </span>
                    ) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                  </td>
                  <td className="py-plate-2 px-plate-3 text-right font-[var(--font-mono)] tabular-data">
                    {pr.volumePr ? (
                      <span className={pr.volumePr.isRecent ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-primary)]'}>
                        {pr.volumePr.value} kg
                      </span>
                    ) : <span className="text-[var(--color-text-tertiary)]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[var(--color-text-tertiary)] font-[var(--font-body)] text-xs">
        Est. 1RM via Epley-formule (gewicht × (1 + reps/30)), alleen berekend bij ≤12 reps. Rode waarden = PR gezet op de meest recente sessie van die oefening. Alleen normale werksets tellen mee (geen warmups).
      </p>
    </div>
  )
}

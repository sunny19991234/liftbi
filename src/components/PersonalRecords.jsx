// src/components/PersonalRecords.jsx
//
// PR-overzicht (PRD 4.11 / src/lib/prData.js). Toont per oefening de drie
// PR-types (geschat 1RM, rep-PR op zwaarste gewicht, volume-PR per sessie),
// met een "nieuwe PR's deze sessie"-samenvatting bovenaan.

import { useEffect, useState } from 'react'
import { calculateAllPRs, extractRecentPRs } from '../lib/prData'

const TYPE_LABEL = {
  '1RM': 'Geschat 1RM',
  reps: 'Rep-PR',
  volume: 'Volume-PR',
}

export default function PersonalRecords() {
  const [prs, setPrs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    calculateAllPRs()
      .then(setPrs)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout bij laden: {error}</p>
  }

  if (!prs) {
    return <p className="text-[var(--color-text-secondary)] p-plate-4 font-[var(--font-mono)] text-sm">Laden...</p>
  }

  const recent = extractRecentPRs(prs)
  const withAnyPr = prs.filter((p) => p.oneRepMax || p.repPr || p.volumePr)

  return (
    <div className="max-w-4xl mx-auto p-plate-4 flex flex-col gap-plate-4">
      <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
        Personal Records
      </h2>

      {recent.length > 0 && (
        <div className="surface rounded-xl p-plate-3 pulse-once">
          <div className="loaded-bar -mx-plate-3 -mt-plate-3 mb-plate-3 rounded-t-xl" style={{ '--load-pct': '100%' }} />
          <p className="text-xs text-[var(--color-status-ok)] font-[var(--font-mono)] tracking-wide uppercase mb-plate-2">
            Nieuwe PR's in de meest recente sessie
          </p>
          <ul className="flex flex-col gap-plate-1">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between text-sm font-[var(--font-body)]">
                <span className="text-[var(--color-text-primary)] font-medium">{r.exercise_title}</span>
                <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] tabular-data">
                  {TYPE_LABEL[r.type]} · {r.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {withAnyPr.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
          Nog geen PR's berekend — voeg sessies toe met 'normal' sets (geen warmups).
        </p>
      ) : (
        <div className="surface rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-secondary)] font-[var(--font-body)] border-b border-[var(--color-border-subtle)]">
                <th className="py-plate-2 px-plate-3 font-normal">Oefening</th>
                <th className="py-plate-2 px-plate-3 font-normal text-right">Geschat 1RM</th>
                <th className="py-plate-2 px-plate-3 font-normal text-right">Rep-PR</th>
                <th className="py-plate-2 px-plate-3 font-normal text-right">Volume-PR</th>
              </tr>
            </thead>
            <tbody className="font-[var(--font-mono)] tabular-data">
              {withAnyPr.map((p) => (
                <tr key={p.exercise_title} className="border-b border-[var(--color-bg)] last:border-0">
                  <td className="py-plate-2 px-plate-3 text-[var(--color-text-primary)] font-[var(--font-body)]">
                    {p.exercise_title}
                  </td>
                  <PrCell pr={p.oneRepMax} render={(v) => `${v.value} kg`} sub={(v) => `${v.weight_kg}kg × ${v.reps}`} />
                  <PrCell pr={p.repPr} render={(v) => `${v.reps} reps`} sub={(v) => `@ ${v.weight_kg} kg`} />
                  <PrCell pr={p.volumePr} render={(v) => `${v.value} kg`} sub={() => null} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PrCell({ pr, render, sub }) {
  if (!pr) {
    return <td className="py-plate-2 px-plate-3 text-right text-[var(--color-text-tertiary)]">—</td>
  }
  return (
    <td className="py-plate-2 px-plate-3 text-right">
      <div className={`font-medium ${pr.isRecent ? 'text-[var(--color-status-ok)]' : 'text-[var(--color-text-primary)]'}`}>
        {render(pr)}
        {pr.isRecent && <span className="ml-1 text-[10px] align-top">●</span>}
      </div>
      {sub(pr) && <div className="text-[10px] text-[var(--color-text-secondary)]">{sub(pr)}</div>}
    </td>
  )
}
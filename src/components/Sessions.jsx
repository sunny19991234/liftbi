// src/components/Sessions.jsx
//
// Lijst van workouts (meest recent eerst), klik toont AI-analyse indien
// aanwezig. Analyses zijn alleen aanwezig voor sessies die zijn geupload
// NA invoering van analyze-session -- oudere sessies tonen "geen analyse",
// wat verwacht en correct gedrag is (PRD 4.5: geen backfill).

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const VERDICT_COLOR = {
  progressie: 'text-[var(--color-status-ok)]',
  stagnatie: 'text-[var(--color-status-low)]',
  achteruitgang: 'text-[var(--color-status-high)]',
}

export default function Sessions({ initialSelectedId, onSelectionHandled }) {
  const [workouts, setWorkouts] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)

  useEffect(() => {
    supabase
      .from('workouts')
      .select('id, title, start_time, start_date')
      .order('start_date', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setWorkouts(data)
      })
  }, [])

  // Vanuit Agenda doorverwezen: zodra de workoutlijst geladen is en er een
  // initialSelectedId staat klaar, selecteer die sessie automatisch.
  useEffect(() => {
    if (!initialSelectedId || !workouts) return
    const target = workouts.find((w) => w.id === initialSelectedId)
    if (target) handleSelect(target)
    onSelectionHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId, workouts])

  async function handleSelect(workout) {
    setSelectedId(workout.id)
    setAnalysis(null)
    setAnalysisError(null)
    setAnalysisLoading(true)

    const { data, error } = await supabase
      .from('ai_analyses')
      .select('content, created_at, model')
      .eq('workout_id', workout.id)
      .maybeSingle()

    setAnalysisLoading(false)

    if (error) {
      setAnalysisError(error.message)
      return
    }
    setAnalysis(data)
  }

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout: {error}</p>
  }

  return (
    <div className="max-w-5xl mx-auto p-plate-4 flex flex-col md:flex-row gap-plate-4">
      <div className="md:w-72 flex-shrink-0 flex flex-col gap-plate-1">
        <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight mb-plate-2">
          Sessies
        </h2>

        {!workouts ? (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {workouts.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => handleSelect(w)}
                  className={`w-full text-left px-plate-3 py-plate-2 rounded-lg transition-colors ${
                    selectedId === w.id
                      ? 'bg-[var(--color-accent)] text-[var(--color-text-primary)]'
                      : 'bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <div className="font-[var(--font-body)] text-sm">{w.title}</div>
                  <div className="font-[var(--font-mono)] text-xs opacity-70 tabular-data">{w.start_date}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {!selectedId && (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
            Kies een sessie om de analyse te bekijken.
          </p>
        )}

        {selectedId && analysisLoading && (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Analyse laden...</p>
        )}

        {selectedId && analysisError && (
          <p className="text-[var(--color-status-high)] font-[var(--font-body)] text-sm">{analysisError}</p>
        )}

        {selectedId && !analysisLoading && !analysisError && !analysis && (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
            Geen AI-analyse voor deze sessie. Analyses worden alleen automatisch gegenereerd voor nieuw geüploade sessies.
          </p>
        )}

        {analysis && <AnalysisView content={analysis.content} createdAt={analysis.created_at} model={analysis.model} />}
      </div>
    </div>
  )
}

function AnalysisView({ content, createdAt, model }) {
  return (
    <div className="flex flex-col gap-plate-4 pulse-once">
      <div className="surface rounded-xl p-plate-3">
        <div className="loaded-bar -mx-plate-3 -mt-plate-3 mb-plate-3 rounded-t-xl" style={{ '--load-pct': '100%' }} />
        <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] mb-plate-2">
          Samenvatting
        </h3>
        <p className="font-[var(--font-body)] text-sm text-[var(--color-text-primary)] leading-relaxed">
          {content.summary}
        </p>
        <p className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] mt-plate-2">
          {model} · {new Date(createdAt).toLocaleString('nl-NL')}
        </p>
      </div>

      <div className="surface rounded-xl p-plate-3">
        <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] mb-plate-2">
          Cijfers
        </h3>
        <table className="w-full text-sm font-[var(--font-mono)] tabular-data">
          <tbody>
            {Object.entries(content.scores ?? {}).map(([key, value]) => (
              <tr key={key} className="border-b border-[var(--color-bg)] last:border-0">
                <td className="py-plate-1 text-[var(--color-text-secondary)] font-[var(--font-body)] capitalize">
                  {key.replaceAll('_', ' ')}
                </td>
                <td className="py-plate-1 text-right text-[var(--color-text-primary)] font-medium">{value}/10</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="surface rounded-xl p-plate-3">
        <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] mb-plate-2">
          Per oefening
        </h3>
        <ul className="flex flex-col gap-plate-2">
          {(content.exercises ?? []).map((ex, i) => (
            <li key={i} className="text-sm font-[var(--font-body)]">
              <div className="flex items-center gap-plate-2">
                <span className="text-[var(--color-text-primary)] font-medium">{ex.exercise_title}</span>
                <span className={`text-xs font-[var(--font-mono)] ${VERDICT_COLOR[ex.verdict] ?? 'text-[var(--color-text-secondary)]'}`}>
                  {ex.verdict}
                </span>
              </div>
              <p className="text-[var(--color-text-secondary)] text-xs mt-0.5">{ex.explanation}</p>
            </li>
          ))}
        </ul>
      </div>

      {(content.weekly_overview ?? []).length > 0 && (
        <div className="surface rounded-xl p-plate-3">
          <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] mb-plate-2">
            Weekoverzicht per spiergroep
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">
                <th className="py-plate-1 font-normal">Spiergroep</th>
                <th className="py-plate-1 font-normal text-right">Sets/week</th>
                <th className="py-plate-1 font-normal">Trend</th>
                <th className="py-plate-1 font-normal">Opmerking</th>
              </tr>
            </thead>
            <tbody className="font-[var(--font-body)]">
              {content.weekly_overview.map((row, i) => (
                <tr key={i} className="border-b border-[var(--color-bg)] last:border-0">
                  <td className="py-plate-1 text-[var(--color-text-primary)]">{row.muscle_group}</td>
                  <td className="py-plate-1 text-right font-[var(--font-mono)] tabular-data">{row.sets_per_week}</td>
                  <td className="py-plate-1 text-[var(--color-text-secondary)] text-xs">{row.trend}</td>
                  <td className="py-plate-1 text-[var(--color-text-secondary)] text-xs">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="surface rounded-xl p-plate-3">
        <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)] mb-plate-2">
          Aanbevelingen
        </h3>
        <ol className="flex flex-col gap-plate-1 list-decimal list-inside">
          {(content.recommendations ?? []).map((rec, i) => (
            <li key={i} className="text-sm font-[var(--font-body)] text-[var(--color-text-primary)]">{rec}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}

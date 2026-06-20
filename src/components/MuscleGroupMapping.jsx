// src/components/MuscleGroupMapping.jsx
//
// Conform PRD 4.2/4.4: oefeningenbibliotheek + spiergroep-mapping, nu
// many-to-many. Eén oefening kan meerdere spiergroepen aanspreken; elke
// koppeling heeft een contributiefactor (1.0 primair, 0.5 secundair) zodat
// volumetelling realistisch is -- een compound-oefening telt niet voor een
// volledige set mee bij elke betrokken spiergroep.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const MUSCLE_GROUPS = [
  'Borst', 'Rug', 'Schouders', 'Biceps', 'Triceps', 'Benen', 'Forearms', 'Cardio', 'Overig',
]

export default function MuscleGroupMapping() {
  const [exerciseTitles, setExerciseTitles] = useState(null)
  const [mappings, setMappings] = useState(null)
  const [error, setError] = useState(null)
  const [selectedExercise, setSelectedExercise] = useState(null)
  const [saving, setSaving] = useState(false)

  // Nieuwe-koppeling formulier state.
  const [newGroup, setNewGroup] = useState(MUSCLE_GROUPS[0])
  const [newContribution, setNewContribution] = useState('1.0')

  async function load() {
    const [{ data: sets, error: setsErr }, { data: mappingRows, error: mapErr }] = await Promise.all([
      supabase.from('sets').select('exercise_title'),
      supabase.from('exercise_muscle_groups').select('id, exercise_title, muscle_group, contribution'),
    ])

    if (setsErr) { setError(setsErr.message); return }
    if (mapErr) { setError(mapErr.message); return }

    setExerciseTitles([...new Set(sets.map((s) => s.exercise_title))].sort())
    setMappings(mappingRows)
  }

  useEffect(() => {
    load()
  }, [])

  const mappingsByExercise = useMemo(() => {
    const map = new Map()
    if (!mappings) return map
    for (const m of mappings) {
      if (!map.has(m.exercise_title)) map.set(m.exercise_title, [])
      map.get(m.exercise_title).push(m)
    }
    return map
  }, [mappings])

  const selectedMappings = selectedExercise ? mappingsByExercise.get(selectedExercise) ?? [] : []

  async function handleAddMapping(e) {
    e.preventDefault()
    if (!selectedExercise) return
    setSaving(true)
    setError(null)

    // Eerste koppeling voor deze oefening vervangt de 'ongecategoriseerd'
    // placeholder die upload-workouts automatisch aanmaakt.
    const isFirstRealMapping =
      selectedMappings.length === 1 && selectedMappings[0].muscle_group === 'Ongecategoriseerd'

    if (isFirstRealMapping) {
      const { error: delErr } = await supabase
        .from('exercise_muscle_groups')
        .delete()
        .eq('id', selectedMappings[0].id)
      if (delErr) { setError(delErr.message); setSaving(false); return }
    }

    const { error: insErr } = await supabase.from('exercise_muscle_groups').insert({
      exercise_title: selectedExercise,
      muscle_group: newGroup,
      contribution: Number(newContribution),
    })

    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    load()
  }

  async function handleRemoveMapping(id) {
    const { error } = await supabase.from('exercise_muscle_groups').delete().eq('id', id)
    if (error) { setError(error.message); return }
    load()
  }

  if (error) {
    return <p className="text-[var(--color-status-high)] p-plate-4 font-[var(--font-body)]">Fout: {error}</p>
  }

  return (
    <div className="max-w-4xl mx-auto p-plate-4 flex flex-col md:flex-row gap-plate-4">
      <div className="md:w-72 flex-shrink-0 flex flex-col gap-plate-1">
        <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight mb-plate-2">
          Oefeningen
        </h2>

        {!exerciseTitles ? (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Laden...</p>
        ) : (
          <ul className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
            {exerciseTitles.map((title) => {
              const groups = mappingsByExercise.get(title) ?? []
              const isUncategorized = groups.length === 0 || (groups.length === 1 && groups[0].muscle_group === 'Ongecategoriseerd')
              return (
                <li key={title}>
                  <button
                    onClick={() => setSelectedExercise(title)}
                    className={`w-full text-left px-plate-3 py-plate-2 rounded-lg transition-colors ${
                      selectedExercise === title
                        ? 'bg-[var(--color-accent)] text-[var(--color-text-primary)]'
                        : 'bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <div className="font-[var(--font-body)] text-sm flex items-center justify-between gap-2">
                      <span className="truncate">{title}</span>
                      {isUncategorized && (
                        <span className="w-2 h-2 rounded-full bg-[var(--color-status-low)] flex-shrink-0" title="Ongecategoriseerd" />
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {!selectedExercise ? (
          <p className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
            Kies een oefening om de spiergroep-koppelingen te beheren.
          </p>
        ) : (
          <div className="flex flex-col gap-plate-4">
            <h3 className="font-[var(--font-display)] font-semibold text-lg text-[var(--color-text-primary)]">
              {selectedExercise}
            </h3>

            <div className="surface rounded-xl p-plate-3 flex flex-col gap-plate-2">
              <p className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)] mb-1">
                Huidige koppelingen
              </p>
              {selectedMappings.length === 0 || (selectedMappings.length === 1 && selectedMappings[0].muscle_group === 'Ongecategoriseerd') ? (
                <p className="text-sm text-[var(--color-status-low)] font-[var(--font-body)]">
                  Nog ongecategoriseerd — voeg hieronder de eerste spiergroep toe.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {selectedMappings.map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-sm font-[var(--font-body)]">
                      <span className="text-[var(--color-text-primary)]">
                        {m.muscle_group}
                        <span className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-xs ml-2 tabular-data">
                          {m.contribution === 1 ? 'primair' : 'secundair (0.5×)'}
                        </span>
                      </span>
                      <button
                        onClick={() => handleRemoveMapping(m.id)}
                        className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-status-high)] underline"
                      >
                        verwijder
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={handleAddMapping} className="flex flex-wrap gap-plate-2 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">Spiergroep</label>
                <select
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="bg-[var(--color-card)] text-[var(--color-text-primary)] rounded-lg px-plate-3 py-plate-2 outline-none border border-transparent focus:border-[var(--color-accent)] font-[var(--font-body)]"
                >
                  {MUSCLE_GROUPS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--color-text-secondary)] font-[var(--font-body)]">Rol</label>
                <select
                  value={newContribution}
                  onChange={(e) => setNewContribution(e.target.value)}
                  className="bg-[var(--color-card)] text-[var(--color-text-primary)] rounded-lg px-plate-3 py-plate-2 outline-none border border-transparent focus:border-[var(--color-accent)] font-[var(--font-body)]"
                >
                  <option value="1.0">Primair (1.0×)</option>
                  <option value="0.5">Secundair (0.5×)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="px-plate-3 py-plate-2 rounded-lg text-sm bg-[var(--color-accent)] text-[var(--color-text-primary)] font-[var(--font-body)] font-medium disabled:opacity-40"
              >
                {saving ? 'Bezig...' : 'Toevoegen'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

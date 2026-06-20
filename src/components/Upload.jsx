// src/components/Upload.jsx
//
// CSV-bestand kiezen -> client-side parsen (hevyParser.js) -> POST naar
// upload-workouts met JWT uit localStorage. Bij 401 wordt de token gewist
// en moet de gebruiker opnieuw inloggen (afgehandeld door de parent).

import { useState } from 'react'
import { parseHevyCsv } from '../lib/hevyParser'
import { getToken, clearToken } from '../lib/auth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export default function Upload({ onTokenExpired }) {
  const [status, setStatus] = useState('idle') // idle | parsing | uploading | done | error
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [fileName, setFileName] = useState(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setError(null)
    setResult(null)
    setStatus('parsing')

    let sessions
    try {
      const text = await file.text()
      const parsed = parseHevyCsv(text)
      sessions = parsed.sessions
    } catch (err) {
      setError(`Parsefout: ${err.message}`)
      setStatus('error')
      return
    }

    setStatus('uploading')

    try {
      const token = getToken()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-workouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessions }),
      })

      if (res.status === 401) {
        clearToken()
        onTokenExpired()
        return
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Server gaf status ${res.status}: ${text}`)
      }

      const data = await res.json()
      setResult(data)
      setStatus('done')
    } catch (err) {
      setError(`Uploadfout: ${err.message}`)
      setStatus('error')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-plate-4 flex flex-col gap-plate-4">
      <h2 className="font-[var(--font-display)] font-semibold text-xl text-[var(--color-text-primary)] tracking-tight">
        Workouts importeren
      </h2>

      <label className="cursor-pointer bg-[var(--color-card)] border border-dashed border-[var(--color-text-secondary)]/40 rounded-xl p-plate-4 text-center hover:border-[var(--color-accent)] transition-colors">
        <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
        <span className="text-[var(--color-text-secondary)] font-[var(--font-body)] text-sm">
          {fileName ?? 'Klik om een Hevy CSV-export te kiezen'}
        </span>
      </label>

      {status === 'parsing' && (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">CSV parsen...</p>
      )}
      {status === 'uploading' && (
        <p className="text-[var(--color-text-secondary)] font-[var(--font-mono)] text-sm">Uploaden naar database...</p>
      )}

      {error && (
        <p className="text-[var(--color-status-high)] font-[var(--font-body)] text-sm">{error}</p>
      )}

      {result && (
        <div className="surface rounded-xl p-plate-3 flex flex-col gap-plate-2">
          <p className="text-[var(--color-status-ok)] font-[var(--font-mono)] text-sm tabular-data">
            {result.created} nieuw · {result.updated} bijgewerkt
          </p>
          <ul className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] flex flex-col gap-1 max-h-64 overflow-y-auto tabular-data">
            {result.sessionResults.map((s, i) => (
              <li key={i} className="flex items-center gap-plate-2">
                <span className={s.status === 'error' ? 'text-[var(--color-status-high)]' : 'text-[var(--color-status-ok)]'}>
                  {s.status === 'error' ? '✗' : '✓'}
                </span>
                <span>{s.title}</span>
                <span>{new Date(s.start_time).toLocaleDateString('nl-NL')}</span>
                <span>({s.status}{s.error ? `: ${s.error}` : ''})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// src/components/Login.jsx
//
// Passcode-invoer -> verify-passcode Edge Function -> token in localStorage.
// Bij succes roept onLoginSuccess() aan zodat de parent (App.jsx) kan
// doorschakelen naar de hoofdapplicatie.

import { useState } from 'react'
import { setToken } from '../lib/auth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export default function Login({ onLoginSuccess }) {
  const [passcode, setPasscode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!passcode || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-passcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })

      if (!res.ok) {
        if (res.status === 401) {
          setError('Onjuiste passcode.')
        } else {
          setError('Inloggen mislukt. Probeer het opnieuw.')
        }
        return
      }

      const { token } = await res.json()
      setToken(token)
      onLoginSuccess()
    } catch (err) {
      setError('Geen verbinding. Controleer je netwerk.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-plate-3">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm surface-hero rounded-2xl p-plate-4 flex flex-col gap-plate-3"
      >
        <div className="loaded-bar -mx-plate-4 -mt-plate-4 mb-plate-2 rounded-t-2xl" style={{ '--load-pct': '100%' }} />

        <h1 className="font-[var(--font-display)] font-semibold text-3xl text-[var(--color-text-primary)] text-center tracking-tight">
          Lift<span className="text-[var(--color-accent)]">BI</span>
        </h1>

        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          autoFocus
          className="bg-[var(--color-bg)] text-[var(--color-text-primary)] rounded-lg px-plate-3 py-plate-2 outline-none border border-transparent focus:border-[var(--color-accent)] font-[var(--font-mono)] tracking-wider text-center"
        />

        {error && (
          <p className="text-[var(--color-status-high)] text-sm font-[var(--font-body)] text-center">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !passcode}
          className="bg-[var(--color-accent)] text-[var(--color-text-primary)] rounded-lg px-plate-3 py-plate-2 font-[var(--font-body)] font-medium disabled:opacity-40 transition-opacity"
        >
          {loading ? 'Bezig...' : 'Inloggen'}
        </button>
      </form>
    </div>
  )
}

// test-analyze.mjs
// Run vanuit project root: node --env-file=.env.local test-analyze.mjs <workout_id> <passcode>

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const [, , workoutId, passcode] = process.argv

if (!SUPABASE_URL) {
  console.error('VITE_SUPABASE_URL ontbreekt. Run met: node --env-file=.env.local test-analyze.mjs <workout_id> <passcode>')
  process.exit(1)
}
if (!workoutId || !passcode) {
  console.error('Gebruik: node --env-file=.env.local test-analyze.mjs <workout_id> <passcode>')
  process.exit(1)
}

async function main() {
  const authRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-passcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  })
  if (!authRes.ok) {
    console.error('verify-passcode faalde:', authRes.status, await authRes.text())
    process.exit(1)
  }
  const { token } = await authRes.json()
  console.log('Token ontvangen.')

  console.log('Analyse aanvragen voor workout', workoutId, '...')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ workout_id: workoutId }),
  })

  const text = await res.text()
  console.log('Status:', res.status)
  console.log('Response:', text)
}

main().catch((err) => {
  console.error('Fout:', err)
  process.exit(1)
})

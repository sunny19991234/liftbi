// test-upload.mjs
// Run vanuit project root: node test-upload.mjs <pad-naar-csv> <passcode>
//
// Doet: passcode -> JWT, CSV parsen met hevyParser.js, POST naar upload-workouts.

console.log('TRACE: script gestart')

import fs from 'node:fs'
console.log('TRACE: node:fs geimporteerd')

import { parseHevyCsv } from './src/lib/hevyParser.js'
console.log('TRACE: hevyParser geimporteerd')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const [, , csvPath, passcode] = process.argv

if (!SUPABASE_URL) {
  console.error('VITE_SUPABASE_URL ontbreekt. Run met: node --env-file=.env.local test-upload.mjs <csv> <passcode>')
  process.exit(1)
}
if (!csvPath || !passcode) {
  console.error('Gebruik: node --env-file=.env.local test-upload.mjs <pad-naar-csv> <passcode>')
  process.exit(1)
}

async function main() {
  // 1. Token ophalen
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

  // 2. CSV parsen
  const csvText = fs.readFileSync(csvPath, 'utf-8')
  const { sessions } = parseHevyCsv(csvText)
  console.log(`Geparsed: ${sessions.length} sessies, ${sessions.reduce((n, s) => n + s.sets.length, 0)} sets.`)

  // 3. Upload
  const uploadRes = await fetch(`${SUPABASE_URL}/functions/v1/upload-workouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sessions }),
  })

  const text = await uploadRes.text()
  console.log('Status:', uploadRes.status)
  console.log('Response:', text)
}

main().catch((err) => {
  console.error('Fout:', err)
  process.exit(1)
})

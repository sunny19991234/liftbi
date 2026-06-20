// supabase/functions/verify-passcode/index.ts
//
// Conform PRD 4.10:
// - Eén passcode, ingesteld als Supabase environment variable
// - Bij match: sessietoken (JWT, lange geldigheid) terug naar de client
//
// De client slaat dit token op in localStorage en stuurt het mee als
// Authorization-header bij alle volgende dataverzoeken (zie _shared/auth.ts).

import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// JWT-geldigheid: lang, conform 4.10 ("lange geldigheid"). 180 dagen --
// ruim genoeg om niet steeds opnieuw te hoeven inloggen op een
// single-user personal app, zonder een oneindig token te zijn.
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 180

async function getSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('JWT_SIGNING_SECRET')
  if (!secret) {
    throw new Error('JWT_SIGNING_SECRET environment variable ontbreekt')
  }
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { passcode } = await req.json()

    if (!passcode || typeof passcode !== 'string') {
      return new Response(JSON.stringify({ error: 'Passcode ontbreekt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const expectedPasscode = Deno.env.get('APP_PASSCODE')
    if (!expectedPasscode) {
      console.error('APP_PASSCODE environment variable niet ingesteld')
      return new Response(JSON.stringify({ error: 'Server-configuratiefout' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (passcode !== expectedPasscode) {
      // Bewust generieke foutmelding -- geen onderscheid tussen
      // "verkeerde passcode" en andere fouten, om geen info te lekken.
      return new Response(JSON.stringify({ error: 'Ongeldige passcode' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const key = await getSigningKey()
    const token = await create(
      { alg: 'HS256', typ: 'JWT' },
      {
        sub: 'liftbi-user',
        iat: getNumericDate(0),
        exp: getNumericDate(TOKEN_LIFETIME_SECONDS),
      },
      key
    )

    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('verify-passcode error:', err)
    return new Response(JSON.stringify({ error: 'Interne serverfout' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
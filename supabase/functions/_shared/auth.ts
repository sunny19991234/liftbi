// supabase/functions/_shared/auth.ts
//
// Herbruikbare token-verificatie voor alle Edge Functions die data
// teruggeven of wijzigen (conform PRD 4.10: "alle dataverzoeken vereisen
// geldig token"). Gebruikt hetzelfde HMAC-secret als verify-passcode
// om het token te ondertekenen.

import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

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

/**
 * Valideert het Authorization-header-token van een binnenkomend request.
 * Retourneert true als geldig, false als ontbrekend/ongeldig/verlopen.
 *
 * Gebruik aan het begin van elke Edge Function die data raakt:
 *
 *   const authorized = await isAuthorized(req)
 *   if (!authorized) {
 *     return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
 *   }
 */
export async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.slice('Bearer '.length)

  try {
    const key = await getSigningKey()
    await verify(token, key)
    return true
  } catch {
    return false
  }
}

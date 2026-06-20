// src/lib/auth.js
//
// Token-beheer voor de eigen JWT (verify-passcode), niet Supabase Auth.
// 180 dagen geldig conform architectuurkeuze; geen client-side expiry-check
// nodig — de Edge Function valideert bij elk verzoek. Bij een 401 ruimen we
// de token hier op zodat de gebruiker opnieuw moet inloggen.

const TOKEN_KEY = 'liftbi_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function isLoggedIn() {
  return Boolean(getToken())
}
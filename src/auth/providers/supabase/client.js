import { createClient } from '@supabase/supabase-js'

let cachedClient = null
let cachedSignature = null
let currentCredentials = null

export function configureSupabase(credentials) {
  currentCredentials = credentials || null
  resetSupabaseClient()
}

export function getSupabaseClient() {
  if (!currentCredentials?.url || !currentCredentials?.anonKey) {
    throw new Error('Supabase client not configured. Call configureAuthClient() with supabase credentials before using the Supabase provider.')
  }

  const signature = `${currentCredentials.url}::${currentCredentials.anonKey}`

  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(currentCredentials.url, currentCredentials.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
    cachedSignature = signature
  }

  return cachedClient
}

export function resetSupabaseClient() {
  cachedClient = null
  cachedSignature = null
}

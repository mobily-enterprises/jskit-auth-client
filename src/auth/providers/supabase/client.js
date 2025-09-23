import { createClient } from '@supabase/supabase-js'
import { getAuthClientConfig } from '../../../runtimeConfig.js'
import { resolveSupabaseStorage } from './storage.js'

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

  const authClientConfig = getAuthClientConfig()
  const storagePreference = authClientConfig.security?.tokenStorage || 'memory'
  const storageAdapter = resolveSupabaseStorage(storagePreference)

  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(currentCredentials.url, currentCredentials.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: storageAdapter
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

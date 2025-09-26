import { createClient } from '@supabase/supabase-js'
import { getAuthClientConfig } from '../../../runtimeConfig.js'
import { resolveSupabaseStorage } from './storage.js'

const SUPABASE_STATE_KEY = '__JSKIT_SUPABASE_CLIENT_STATE__'

function getState() {
  const existing = globalThis[SUPABASE_STATE_KEY]
  if (existing) return existing
  const state = {
    cachedClient: null,
    cachedSignature: null,
    currentCredentials: null
  }
  globalThis[SUPABASE_STATE_KEY] = state
  return state
}

const state = getState()

export function configureSupabase(credentials) {
  state.currentCredentials = credentials || null
  resetSupabaseClient()
}

export function getSupabaseClient() {
  const credentials = state.currentCredentials
  if (!credentials?.url || !credentials?.anonKey) {
    throw new Error('Supabase client not configured. Call configureAuthClient() with supabase credentials before using the Supabase provider.')
  }

  const signature = `${credentials.url}::${credentials.anonKey}`

  const authClientConfig = getAuthClientConfig()
  const storagePreference = authClientConfig.security?.tokenStorage || 'memory'
  const storageAdapter = resolveSupabaseStorage(storagePreference)

  if (!state.cachedClient || state.cachedSignature !== signature) {
    state.cachedClient = createClient(credentials.url, credentials.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: storageAdapter
      }
    })
    state.cachedSignature = signature
  }

  return state.cachedClient
}

export function resetSupabaseClient() {
  state.cachedClient = null
  state.cachedSignature = null
}

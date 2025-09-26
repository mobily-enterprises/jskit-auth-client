import axios from 'axios'
import { getSupabaseClient } from './client.js'
import { registerAuthProvider } from '../../authProviders.js'
import { normalizeSupabaseSession } from '../../normalizers/supabase.js'
import { getAuthClientConfig } from '../../../runtimeConfig.js'

function isSupabaseEnabled() {
  const config = getAuthClientConfig() || {}
  const providers = Array.isArray(config.providers) ? config.providers : []
  const supabase = config.supabase || {}
  return providers.includes('supabase') && !!supabase.url && !!supabase.anonKey
}

function ensureSupabaseClient() {
  return getSupabaseClient()
}

function getSupabaseSettings() {
  return getAuthClientConfig().supabase || {}
}

const supabaseAuthProvider = {
  normalizeSession(rawSession) {
    return normalizeSupabaseSession(rawSession)
  },

  async getStoredSession() {
    const supabase = ensureSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },

  async signOut() {
    const supabase = ensureSupabaseClient()
    await supabase.auth.signOut()
  },

  async handleTokenExpiry(userStore, originalRequest) {
    try {
      const supabase = ensureSupabaseClient()
      const { data: { session }, error } = await supabase.auth.refreshSession()

      if (error || !session) {
        console.error('Supabase refresh failed:', error)
        return null
      }

      await userStore.setSession(session, 'supabase')

      originalRequest.headers['Authorization'] = `Bearer ${session.access_token}`
      originalRequest.headers['X-Auth-Provider'] = 'supabase'

      return originalRequest
    } catch (error) {
      console.error('Supabase token refresh error:', error)
      return null
    }
  },

  async convertAnonymousAccount(email, password, metadata) {
    const supabase = ensureSupabaseClient()
    const { data, error } = await supabase.auth.updateUser({
      email,
      password,
      data: metadata
    })

    if (error) throw error
    return data
  },

  onAuthStateChange(callback) {
    const supabase = ensureSupabaseClient()
    return supabase.auth.onAuthStateChange(callback)
  },

  get authClient() {
    return ensureSupabaseClient().auth
  },

  async signIn(email, password) {
    const supabase = ensureSupabaseClient()
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.data?.session) {
      result.data.session._provider = 'supabase'
    }
    return result
  },

  async signUp(email, password, metadata = {}) {
    const supabase = ensureSupabaseClient()
    const result = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata }
    })
    if (result.data?.session) {
      result.data.session._provider = 'supabase'
    }
    return result
  },

  async signInWithProvider(provider, redirectTo) {
    const supabase = ensureSupabaseClient()
    const result = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    })
    if (result.data?.session) {
      result.data.session._provider = 'supabase'
    }
    return result
  },

  async linkAccount(accessToken) {
    const csrfToken = document.cookie
      .split(';')
      .map(c => c.trim().split('='))
      .find(([name]) => name === 'refresh_csrf')?.[1]

    const response = await axios.post('/api/auth/supabase/link', {
      access_token: accessToken
    }, {
      withCredentials: true,
      headers: csrfToken ? { 'X-CSRF-Token': decodeURIComponent(csrfToken) } : undefined
    })

    if (response.status >= 400) {
      throw new Error(response.data?.message || 'Failed to link Supabase account')
    }

    return true
  },

  getMetadata() {
    const settings = getSupabaseSettings()
    const configured = isSupabaseEnabled()

    return {
      name: 'supabase',
      displayName: 'SupaBase',
      icon: 'mdi-email-outline',
      widget: () => import('./SupabaseAuthWidget.vue'),
      requiresDialog: true,
      configured,
      supportsLinking: true,
      oauthProviders: settings.oauthProviders || []
    }
  }
}

registerAuthProvider('supabase', supabaseAuthProvider)

export default supabaseAuthProvider
export const authProvider = supabaseAuthProvider

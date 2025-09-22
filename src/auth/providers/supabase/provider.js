import axios from 'axios'
import { supabase } from './client.js'
import { registerAuthProvider } from '../../authProviders.js'
import { normalizeSupabaseSession } from '../../normalizers/supabase.js'

// Define all provider methods
const supabaseAuthProvider = {
  // Normalize session to standard format
  normalizeSession(rawSession) {
    // Use the shared normalizer
    return normalizeSupabaseSession(rawSession)
  },

  // Get stored session
  async getStoredSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },

  // Sign out
  async signOut() {
    await supabase.auth.signOut()
  },

  // Handle token expiry/refresh
  async handleTokenExpiry(userStore, originalRequest) {
    try {
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
      console.error('Supabase auth refresh error:', error)
      return null
    }
  },

  // Supabase no longer handles anonymous sessions - use local provider instead
  // async startAnonymousSession() {
  //   throw new Error('Supabase provider does not support anonymous sessions. Use local provider.')
  // },

  // Convert anonymous to permanent
  async convertAnonymousAccount(email, password, metadata) {
    const { data, error } = await supabase.auth.updateUser({
      email,
      password,
      data: metadata
    })

    if (error) throw error
    return data
  },

  // Listen for auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  },

  // Direct access to auth client for widget
  get authClient() {
    return supabase.auth
  },

  // Additional methods for widget compatibility
  async signIn(email, password) {
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.data?.session) {
      result.data.session._provider = 'supabase'
    }
    return result
  },

  async signUp(email, password, metadata = {}) {
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
    return {
      name: 'supabase',
      displayName: 'SupaBase',
      icon: 'mdi-email-outline',
      widget: () => import('./SupabaseAuthWidget.vue'),
      requiresDialog: true,  // Needs email/password form in dialog
      configured: !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY,
      supportsLinking: true
    }
  }
}

// Self-register when module loads
registerAuthProvider('supabase', supabaseAuthProvider)

// Export for direct use by widgets
export default supabaseAuthProvider
export const authProvider = supabaseAuthProvider

import { registerAuthProvider, isProviderConfigured } from '../../authProviders.js'
import { v4 as uuidv4 } from 'uuid'

// Local anonymous session provider - no backend required
const localAuthProvider = {
  // Normalize session to standard format
  normalizeSession(rawSession) {
    if (!rawSession) return null

    return {
      access_token: rawSession.access_token || rawSession.token,
      user: rawSession.user || null,
      isAnonymous: true, // Always anonymous for local provider
      provider: 'local',
      expires_at: rawSession.expires_at,
      raw: rawSession
    }
  },

  // Get stored session from localStorage
  async getStoredSession() {
    try {
      const stored = localStorage.getItem('local_anonymous_session')
      if (!stored) return null

      const session = JSON.parse(stored)

      // Check if expired
      if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000)) {
        localStorage.removeItem('local_anonymous_session')
        return null
      }

      return session
    } catch (error) {
      console.error('[Local Provider] Failed to get stored session:', error)
      return null
    }
  },

  // Sign out - just clear local storage
  async signOut() {
    localStorage.removeItem('local_anonymous_session')
  },

  // Start anonymous session - creates a local-only session
  async startAnonymousSession() {
    console.log('[Local Provider] Creating local anonymous session...')

    const userId = uuidv4()
    const token = btoa(`local-anon-${userId}-${Date.now()}`) // Simple local token

    const session = {
      access_token: token,
      token: token,
      provider: 'local',
      provider_id: userId,  // Provider ID at root level
      user: {
        id: userId,
        email: `anon-${userId.substring(0, 8)}@local`,
        is_anonymous: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours in Unix seconds
      _provider: 'local'
    }

    // Store in localStorage
    localStorage.setItem('local_anonymous_session', JSON.stringify(session))

    console.log('[Local Provider] Local anonymous session created:', session.user.id)
    return session
  },

  // Handle token expiry - for local sessions, just extend
  async handleTokenExpiry(userStore, originalRequest) {
    try {
      const stored = localStorage.getItem('local_anonymous_session')
      if (!stored) return null

      const session = JSON.parse(stored)

      // Extend expiry
      session.expires_at = Math.floor(Date.now() / 1000) + 24 * 60 * 60
      localStorage.setItem('local_anonymous_session', JSON.stringify(session))

      await userStore.setSession(session, 'local')

      originalRequest.headers['Authorization'] = `Bearer ${session.access_token}`
      originalRequest.headers['X-Auth-Provider'] = 'local'

      return originalRequest
    } catch (error) {
      console.error('[Local Provider] Token refresh error:', error)
      return null
    }
  },

  // Refresh session - just extend the expiry
  async refreshSession(currentSession) {
    if (!currentSession) return null

    currentSession.expires_at = Math.floor(Date.now() / 1000) + 24 * 60 * 60
    localStorage.setItem('local_anonymous_session', JSON.stringify(currentSession))

    return currentSession
  },

  // Convert anonymous to permanent - not supported for local
  async convertAnonymousAccount(email, password, metadata) {
    throw new Error('Local anonymous sessions cannot be converted. Please create a new account.')
  },

  // Get metadata
  getMetadata() {
    return {
      name: 'local',
      displayName: 'Local Anonymous',
      icon: 'mdi-incognito',
      widget: null, // No widget - this is for anonymous sessions only, not user sign-in
      requiresDialog: false,
      configured: isProviderConfigured('local'),
      supportsAnonymous: true,
      isAnonymousOnly: true // This provider is only for anonymous sessions
    }
  }
}

// Self-register when module loads
registerAuthProvider('local', localAuthProvider)

// Export for direct use
export default localAuthProvider

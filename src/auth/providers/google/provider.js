import axios from 'axios'
import { storeToRefs } from 'pinia'
import { registerAuthProvider } from '../../authProviders.js'
import { normalizeGoogleSession } from '../../normalizers/google.js'

const SESSION_META_KEY = 'google_session_meta'

function getCookieValue(name) {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie ? document.cookie.split(';') : []

  for (const cookie of cookies) {
    const [cookieName, ...rest] = cookie.trim().split('=')
    if (cookieName === name) {
      return decodeURIComponent(rest.join('='))
    }
  }

  return null
}

function getRefreshCsrfToken() {
  return getCookieValue('refresh_csrf')
}

function loadSessionMeta() {
  try {
    const stored = localStorage.getItem(SESSION_META_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch (error) {
    console.warn('[Google Provider] Failed to load session meta:', error)
    localStorage.removeItem(SESSION_META_KEY)
    return null
  }
}

function persistSessionMeta(meta) {
  try {
    localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta))
  } catch (error) {
    console.warn('[Google Provider] Failed to persist session meta:', error)
  }
}

function clearSessionMeta() {
  localStorage.removeItem(SESSION_META_KEY)
}

// Define all provider methods
const googleAuthProvider = {
  // Normalize session to standard format
  normalizeSession(rawSession) {
    // Use the shared normalizer
    return normalizeGoogleSession(rawSession)
  },

  // Get stored session (access tokens now derived from refresh cookie)
  async getStoredSession() {
    let meta = loadSessionMeta()

    try {
      const csrfToken = getRefreshCsrfToken()
      if (!csrfToken) {
        console.warn('[Google Provider] Missing CSRF token; cannot refresh session')
        clearSessionMeta()
        return null
      }

      const { data } = await axios.post('/api/auth/google/refresh', {}, {
        withCredentials: true,
        _skipRetry: true,
        headers: {
          'X-CSRF-Token': csrfToken
        }
      })

      const expiresIn = data.expires_in || 30 * 24 * 60 * 60
      let providerId = meta?.provider_id
      let user = meta?.user || null

      if (!providerId || !user) {
        try {
          const profileResponse = await axios.get('/api/auth/me', {
            withCredentials: true,
            headers: {
              Authorization: `Bearer ${data.access_token}`
            }
          })

          const profileData = profileResponse.data || {}
          const linkedGoogleId = profileData.linked_providers?.google
          if (profileData.provider === 'google' && profileData.provider_id) {
            providerId = profileData.provider_id
          } else if (linkedGoogleId) {
            providerId = linkedGoogleId
          }

          user = profileData.user || user
        } catch (profileError) {
          console.warn('[Google Provider] Failed to fetch profile during session restore:', profileError)
        }

        meta = {
          provider_id: providerId,
          user
        }
      }

      if (!providerId || !user) {
        clearSessionMeta()
        return null
      }

      persistSessionMeta(meta)

      return {
        access_token: data.access_token,
        expires_in: expiresIn,
        expires_at: Math.floor(Date.now() / 1000) + expiresIn,
        token_type: 'Bearer',
        provider: 'google',
        provider_id: providerId,
        user
      }
    } catch (error) {
      console.warn('[Google Provider] Stored session refresh failed:', error)
      clearSessionMeta()
      return null
    }
  },

  cacheSessionMeta(session) {
    persistSessionMeta({
      provider_id: session.provider_id,
      user: session.user || null
    })
  },

  async linkAccount(credential) {
    const csrfToken = getRefreshCsrfToken()

    await axios.post('/api/auth/google/link', {
      credential
    }, {
      withCredentials: true,
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined
    })

    return true
  },

  // Sign out
  async signOut() {
    clearSessionMeta()

    try {
      const csrfToken = getRefreshCsrfToken()
      if (csrfToken) {
        await axios.post('/api/auth/google/logout', {}, {
          withCredentials: true,
          headers: {
            'X-CSRF-Token': csrfToken
          }
        })
      } else {
        console.warn('[Google Provider] CSRF token missing during logout; skipping cookie clear request')
      }
    } catch (error) {
      console.warn('[Google Provider] Failed to clear refresh cookie:', error)
    }

    // Disable Google One-Tap auto-select
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }

    return true
  },

  // Handle token expiry in interceptor
  async handleTokenExpiry(userStore, originalRequest) {
    try {
      const { normalizedSession } = storeToRefs(userStore)
      const currentSession = normalizedSession.value
      if (!currentSession) return null

      const csrfToken = getRefreshCsrfToken()
      if (!csrfToken) {
        console.error('Google token refresh failed: missing CSRF token')
        clearSessionMeta()
        return null
      }

      const { data } = await axios.post('/api/auth/google/refresh', {}, {
        withCredentials: true,
        _skipRetry: true,
        headers: {
          'X-CSRF-Token': csrfToken
        }
      })

      const expiresIn = data.expires_in || 30 * 24 * 60 * 60
      const updatedSession = {
        ...currentSession,
        access_token: data.access_token,
        expires_in: expiresIn,
        expires_at: Math.floor(Date.now() / 1000) + expiresIn
      }

      await userStore.setSession(updatedSession, 'google')

      // Update request
      originalRequest.headers['Authorization'] = `Bearer ${data.access_token}`
      originalRequest.headers['X-Auth-Provider'] = 'google'
      return originalRequest

    } catch (error) {
      console.error('Google token refresh failed:', error)
      clearSessionMeta()
      return null
    }
  },

  // Google doesn't support anonymous sessions
  async startAnonymousSession() {
    throw new Error('Google does not support anonymous sessions')
  },

  // Google doesn't support anonymous conversion
  async convertAnonymousAccount() {
    throw new Error('Google does not support anonymous account conversion')
  },

  // ADD THIS METHOD:
  getMetadata() {
    return {
      name: 'google',
      displayName: 'Google',
      icon: 'mdi-google',
      widget: () => import('./GoogleAuthWidget.vue'),  // Dynamic import
      requiresDialog: false,  // OAuth flow doesn't need a dialog
      configured: !!import.meta.env.VITE_GOOGLE_CLIENT_ID,
      supportsLinking: true
    }
  }
}

// Self-register when module loads
registerAuthProvider('google', googleAuthProvider)

// Only export the provider object
export default googleAuthProvider

import { ref, computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import { authConfig, getTimeout, getErrorMessage, checkRateLimit, circuitBreakers } from '../config/auth.js'
import axios from 'axios'
import { getAuthProvider, getAllProviderNames, callAuthProviderMethod } from '../auth/authProviders.js'

// Provider modules will self-register when imported
import '../auth/providers/supabase/provider.js'
import '../auth/providers/google/provider.js'
import '../auth/providers/local/provider.js'

// Error types for userState operations
const ERROR_TYPES = {
  SESSION_INVALID: 'session_invalid',
  PROFILE_FETCH_FAILED: 'profile_fetch_failed',
  PROVIDER_NOT_FOUND: 'provider_not_found',
  ANONYMOUS_NOT_ALLOWED: 'anonymous_not_allowed',
  ANONYMOUS_CONVERSION_FAILED: 'anonymous_conversion_failed',
  SIGNOUT_FAILED: 'signout_failed',
  INITIALIZATION_FAILED: 'initialization_failed',
  RATE_LIMITED: 'rate_limited',
  NETWORK_ERROR: 'network_error',
  TIMEOUT: 'timeout'
}

export const useUserStateStore = defineStore('userState', () => {
  // State
  const normalizedSession = ref(null) // Normalized session from provider
  const profile = ref(null) // Backend user profile
  const linkedProviders = ref({})
  const profileProvider = ref(null)
  const profileProviderId = ref(null)
  const loading = ref(false)

  // Error state management
  const errorState = reactive({
    hasError: false,
    errorType: null,
    errorMessage: null,
    errorDetails: null,
    retryCount: 0,
    lastErrorTime: null
  })

  // Session health tracking
  const sessionHealth = reactive({
    lastCheck: null,
    isHealthy: true,
    failureCount: 0,
    nextRefreshTime: null
  })

  // Computed
  const isAuthenticated = computed(() => !!normalizedSession.value)
  const isFullyAuthenticated = computed(() => isAuthenticated.value && !normalizedSession.value?.isAnonymous)
  const token = computed(() => normalizedSession.value?.access_token)
  const user = computed(() => normalizedSession.value?.user)
  const currentProvider = computed(() => normalizedSession.value?.provider)
  const isAnonymous = computed(() => normalizedSession.value?.isAnonymous || false)

  // Error handling utilities
  function setError(type, message, details = null) {
    errorState.hasError = true
    errorState.errorType = type
    errorState.errorMessage = message
    errorState.errorDetails = details
    errorState.lastErrorTime = Date.now()

    // Log error if detailed logging enabled
    if (authConfig.errorHandling.enableDetailedLogging) {
      console.error('[UserState] Error:', {
        type,
        message,
        details,
        timestamp: new Date().toISOString()
      })
    }

    // Send to error tracking if configured
    if (authConfig.errorHandling.errorTracking?.enabled) {
      trackError(type, message, details)
    }
  }

  function clearError() {
    errorState.hasError = false
    errorState.errorType = null
    errorState.errorMessage = null
    errorState.errorDetails = null
    errorState.retryCount = 0
  }

  async function trackError(type, message, details) {
    try {
      if (authConfig.errorHandling.errorTracking?.endpoint) {
        await axios.post(authConfig.errorHandling.errorTracking.endpoint, {
          component: 'UserStateStore',
          type,
          message,
          details,
          userContext: {
            isAuthenticated: isAuthenticated.value,
            provider: currentProvider.value,
            isAnonymous: isAnonymous.value
          }
        }, {
          headers: {
            'X-API-Key': authConfig.errorHandling.errorTracking.apiKey
          },
          _noRetry: true // Don't retry error tracking requests
        })
      }
    } catch (err) {
      // Silently fail - don't throw errors from error tracking
      console.warn('[UserState] Failed to track error:', err)
    }
  }

  // Retry wrapper with exponential backoff
  async function withRetry(operation, operationName, maxRetries = authConfig.retry.maxAttempts) {
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        clearError()

        // Use circuit breaker if available
        const circuitBreaker = circuitBreakers[operationName]
        if (circuitBreaker) {
          return await circuitBreaker.execute(operation)
        }

        return await operation()
      } catch (error) {
        lastError = error
        errorState.retryCount = attempt

        // Check if error is retryable
        const isRetryable =
          error.code === 'ECONNABORTED' ||
          error.message?.includes('timeout') ||
          error.response?.status >= 500 ||
          error.response?.status === 429

        if (!isRetryable || attempt === maxRetries) {
          throw error
        }

        // Calculate delay with exponential backoff
        const baseDelay = authConfig.timeouts.retryDelay
        const delay = Math.min(
          baseDelay * Math.pow(authConfig.timeouts.backoffMultiplier, attempt - 1),
          authConfig.timeouts.maxRetryDelay
        )

        // Add jitter
        const jitter = Math.random() * authConfig.retry.jitterRange
        const totalDelay = delay + jitter

        if (authConfig.errorHandling.enableDetailedLogging) {
          console.log(`[UserState] Retrying ${operationName} (attempt ${attempt}/${maxRetries}) after ${totalDelay}ms`)
        }

        await new Promise(resolve => setTimeout(resolve, totalDelay))
      }
    }

    throw lastError
  }

  // Set session with comprehensive error handling
  async function setSession(rawSession, providerName = null) {
    try {
      clearError()

      if (!rawSession) {
        normalizedSession.value = null
        profile.value = null
        linkedProviders.value = {}
        profileProvider.value = null
        profileProviderId.value = null
        delete axios.defaults.headers.common['Authorization']
        sessionHealth.isHealthy = true
        sessionHealth.failureCount = 0
        return true
      }

      // Determine provider
      const provider = providerName || rawSession._provider || authConfig.defaultProvider || 'none'
      const authProvider = getAuthProvider(provider)

      if (!authProvider) {
        setError(
          ERROR_TYPES.PROVIDER_NOT_FOUND,
          getErrorMessage('PROVIDER_NOT_FOUND', `Authentication provider '${provider}' not found`),
          { provider }
        )
        normalizedSession.value = null
        return false
      }

      // Normalize the session
      normalizedSession.value = authProvider.normalizeSession(rawSession)
      console.log('[UserState] Session normalized:', {
        provider,
        hasUser: !!normalizedSession.value?.user,
        user: normalizedSession.value?.user,
        hasProviderId: !!normalizedSession.value?.provider_id,
        providerId: normalizedSession.value?.provider_id
      })

      try {
        await callAuthProviderMethod(provider, 'cacheSessionMeta', normalizedSession.value)
      } catch (metaError) {
        console.warn('[UserState] Failed to cache session metadata:', metaError)
      }

      // Set axios headers from normalized session
      if (normalizedSession.value?.access_token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${normalizedSession.value.access_token}`
        axios.defaults.headers.common['X-Auth-Provider'] = provider
      } else {
        delete axios.defaults.headers.common['Authorization']
        delete axios.defaults.headers.common['X-Auth-Provider']
      }

      // Update session health
      sessionHealth.isHealthy = true
      sessionHealth.failureCount = 0
      sessionHealth.lastCheck = Date.now()

      // Calculate next refresh time if applicable
      if (normalizedSession.value?.expires_at) {
        const rawExpiresAt = normalizedSession.value.expires_at

        let expiresAtMs = null
        if (typeof rawExpiresAt === 'number' || (typeof rawExpiresAt === 'string' && /^\d+$/.test(rawExpiresAt))) {
          expiresAtMs = Number(rawExpiresAt) * 1000
        } else {
          expiresAtMs = new Date(rawExpiresAt).getTime()
        }

        if (!Number.isNaN(expiresAtMs)) {
          const refreshBuffer = 60000 // Refresh 1 minute before expiry
          sessionHealth.nextRefreshTime = expiresAtMs - refreshBuffer
        } else {
          sessionHealth.nextRefreshTime = null
        }
      }

      return true
    } catch (error) {
      setError(
        ERROR_TYPES.SESSION_INVALID,
        getErrorMessage('SESSION_INVALID', 'Failed to set session'),
        { error: error.message }
      )
      return false
    }
  }

  // Fetch user profile with retry and error handling
  async function fetchProfile() {
    if (!token.value || isAnonymous.value) {
      clearError()
      return false
    }

    // Check rate limiting
    if (!checkRateLimit('profile')) {
      setError(
        ERROR_TYPES.RATE_LIMITED,
        getErrorMessage('RATE_LIMIT'),
        { action: 'profile' }
      )
      return false
    }

    try {
      loading.value = true
      clearError()

      const response = await withRetry(
        async () => {
          return await axios.get('/api/auth/me', {
            timeout: getTimeout('profileFetch'),
            _skipRetry: true // Let withRetry handle retries
          })
        },
        'profile'
      )

      // API now returns auth metadata with nested user
      console.log('[UserState] fetchProfile response:', response.data)

      const payload = response.data || {}
      const baseProfile = payload.user || payload

      profile.value = baseProfile || null
      linkedProviders.value = payload.linked_providers || {}
      profileProvider.value = payload.provider ?? normalizedSession.value?.provider ?? null
      profileProviderId.value = payload.provider_id ?? normalizedSession.value?.provider_id ?? null

      console.log('[UserState] profile.value set to:', profile.value)
      console.log('[UserState] linkedProviders set to:', linkedProviders.value)
      sessionHealth.isHealthy = true
      sessionHealth.failureCount = 0

      return true
    } catch (error) {
      sessionHealth.failureCount++

      if (error.response?.status === 401) {
        // JWT validation failed
        setError(
          ERROR_TYPES.SESSION_INVALID,
          getErrorMessage('AUTH_VALIDATION_FAILED'),
          { status: 401 }
        )

        // Sign out after multiple failures
        if (sessionHealth.failureCount >= 3) {
          await signOut()
        }

        return false
      }

      // Other errors
      const errorType = error.code === 'ECONNABORTED' ? ERROR_TYPES.TIMEOUT : ERROR_TYPES.PROFILE_FETCH_FAILED
      setError(
        errorType,
        getErrorMessage(errorType, 'Failed to fetch profile'),
        {
          error: error.message,
          status: error.response?.status,
          failureCount: sessionHealth.failureCount
        }
      )

      // Mark session as unhealthy after multiple failures
      if (sessionHealth.failureCount >= 3) {
        sessionHealth.isHealthy = false
      }

      return false
    } finally {
      loading.value = false
    }
  }

  // Start anonymous session with error handling
  async function startAnonymousSession() {
    if (!authConfig.allowAnonymous) {
      setError(
        ERROR_TYPES.ANONYMOUS_NOT_ALLOWED,
        getErrorMessage('ANONYMOUS_NOT_ALLOWED', 'Anonymous sessions are not allowed')
      )
      throw new Error('Anonymous sessions are not allowed')
    }

    loading.value = true
    clearError()

    try {
      // Try to find a provider that supports anonymous sessions
      const providerNames = getAllProviderNames()

      for (const providerName of providerNames) {
        const provider = getAuthProvider(providerName)
        if (provider?.startAnonymousSession) {
          try {
            const anonSession = await withRetry(
              async () => provider.startAnonymousSession(),
              'anonymous',
              2 // Fewer retries for anonymous
            )

            if (anonSession) {
              const success = await setSession(anonSession, providerName)
              if (success) {
                return true
              }
            }
          } catch (error) {
            // This provider doesn't support anonymous, try next
            if (authConfig.errorHandling.enableDetailedLogging) {
              console.log(`[UserState] Provider ${providerName} failed for anonymous:`, error.message)
            }
          }
        }
      }

      setError(
        ERROR_TYPES.ANONYMOUS_NOT_ALLOWED,
        getErrorMessage('ANONYMOUS_NOT_ALLOWED', 'No provider supports anonymous sessions')
      )
      throw new Error('No provider supports anonymous sessions')
    } finally {
      loading.value = false
    }
  }

  // Convert anonymous account with error handling
  async function convertAnonymousAccount(email, password, name) {
    if (!isAnonymous.value) {
      setError(
        ERROR_TYPES.ANONYMOUS_CONVERSION_FAILED,
        'Not an anonymous session'
      )
      throw new Error('Not an anonymous session')
    }

    // Check rate limiting
    if (!checkRateLimit('signup')) {
      setError(
        ERROR_TYPES.RATE_LIMITED,
        getErrorMessage('RATE_LIMIT'),
        { action: 'signup' }
      )
      throw new Error('Rate limited')
    }

    loading.value = true
    clearError()

    try {
      const result = await withRetry(
        async () => {
          return await callAuthProviderMethod(
            normalizedSession.value?.provider,
            'convertAnonymousAccount',
            email,
            password,
            { name }
          )
        },
        'auth'
      )

      if (result) {
        // Re-normalize the session after conversion
        const success = await setSession(result, normalizedSession.value?.provider)
        if (success) {
          await fetchProfile()
        }
        return result
      }

      throw new Error('Conversion failed')
    } catch (error) {
      setError(
        ERROR_TYPES.ANONYMOUS_CONVERSION_FAILED,
        getErrorMessage('ANONYMOUS_CONVERSION_FAILED', error.message),
        { error: error.message }
      )
      throw error
    } finally {
      loading.value = false
    }
  }

  // Sign out with error handling
  async function signOut() {
    loading.value = true
    clearError()

    try {
      const provider = normalizedSession.value?.provider

      if (provider) {
        try {
          await withRetry(
            async () => callAuthProviderMethod(provider, 'signOut'),
            'auth',
            1 // Only one retry for signout
          )
        } catch (error) {
          // Log but don't fail signout
          console.warn('[UserState] Provider signout failed:', error)
        }
      }

      // Clear local state regardless of provider signout result
      normalizedSession.value = null
      profile.value = null
      linkedProviders.value = {}
      profileProvider.value = null
      profileProviderId.value = null
      delete axios.defaults.headers.common['Authorization']
      delete axios.defaults.headers.common['X-Auth-Provider']

      // Reset session health
      sessionHealth.isHealthy = true
      sessionHealth.failureCount = 0
      sessionHealth.lastCheck = null
      sessionHealth.nextRefreshTime = null

      // Reset circuit breakers
      Object.values(circuitBreakers).forEach(cb => cb.reset())

      return true
    } catch (error) {
      setError(
        ERROR_TYPES.SIGNOUT_FAILED,
        getErrorMessage('SIGNOUT_FAILED', 'Failed to sign out'),
        { error: error.message }
      )
      // Still clear local state even if signout failed
      normalizedSession.value = null
      profile.value = null
      linkedProviders.value = {}
      profileProvider.value = null
      profileProviderId.value = null
      return false
    } finally {
      loading.value = false
    }
  }

  // Initialize auth state with comprehensive error recovery
  async function initialize() {
    loading.value = true
    clearError()

    try {
      // Check each registered provider for stored sessions
      const providerNames = getAllProviderNames()

      for (const providerName of providerNames) {
        try {
          const restoredSession = await withRetry(
            async () => callAuthProviderMethod(providerName, 'getStoredSession'),
            'auth',
            1 // Only one retry for initialization
          )

          if (restoredSession) {
            const success = await setSession(restoredSession, providerName)

            if (success && !normalizedSession.value?.isAnonymous) {
              const profileSuccess = await fetchProfile()
              if (!profileSuccess && sessionHealth.failureCount >= 3) {
                // Session is invalid, continue checking other providers
                await signOut()
                continue
              }
            }

            if (success) {
              return // Found a valid session
            }
          }
        } catch (error) {
          // Log but continue checking other providers
          if (authConfig.errorHandling.enableDetailedLogging) {
            console.log(`[UserState] Provider ${providerName} initialization failed:`, error.message)
          }
        }
      }

      // Auto-start anonymous if configured and no session found
      if (!normalizedSession.value && authConfig.autoStartAnonymous) {
        try {
          await startAnonymousSession()
        } catch (error) {
          // Anonymous session failed, but that's okay
          if (authConfig.errorHandling.enableDetailedLogging) {
            console.log('[UserState] Auto-start anonymous failed:', error.message)
          }
        }
      }
    } catch (error) {
      setError(
        ERROR_TYPES.INITIALIZATION_FAILED,
        getErrorMessage('INITIALIZATION_FAILED', 'Failed to initialize authentication'),
        { error: error.message }
      )
    } finally {
      loading.value = false
    }
  }

  // Session health check
  async function checkSessionHealth() {
    if (!isAuthenticated.value) return true

    const now = Date.now()

    // Check if session needs refresh
    if (sessionHealth.nextRefreshTime && now >= sessionHealth.nextRefreshTime) {
      try {
        const provider = normalizedSession.value?.provider
        if (provider) {
          const refreshed = await callAuthProviderMethod(
            provider,
            'refreshSession',
            normalizedSession.value
          )
          if (refreshed) {
            await setSession(refreshed, provider)
          }
        }
      } catch (error) {
        sessionHealth.isHealthy = false
        sessionHealth.failureCount++
        return false
      }
    }

    // Periodic validation
    if (!sessionHealth.lastCheck ||
        now - sessionHealth.lastCheck > authConfig.security.validateSessionInterval) {
      try {
        await fetchProfile()
        sessionHealth.lastCheck = now
        return sessionHealth.isHealthy
      } catch (error) {
        return false
      }
    }

    return sessionHealth.isHealthy
  }

  // Set up automatic session health checks
  if (authConfig.security.validateSessionOnFocus) {
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', checkSessionHealth)
    }
  }

  return {
    // State
    normalizedSession,
    profile,
    loading,
    errorState,
    sessionHealth,
    linkedProviders,
    profileProvider,
    profileProviderId,

    // Computed
    isAuthenticated,
    isFullyAuthenticated,
    token,
    user,
    currentProvider,
    isAnonymous,

    // Actions
    setSession,
    fetchProfile,
    startAnonymousSession,
    convertAnonymousAccount,
    signOut,
    initialize,
    checkSessionHealth,

    // Error management
    clearError,
    setError
  }
})

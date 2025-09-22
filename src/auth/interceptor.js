/**
 * interceptor.js - Axios Request/Response Interceptor for Authentication
 *
 * WHAT IT DOES:
 * - Adds authentication headers to all outgoing requests
 * - Handles 401 errors by refreshing expired tokens
 * - Implements smart retry logic for failed requests
 * - Provides detailed error categorization and logging
 *
 * WHY THE COMPLEXITY:
 * - Token Management: Prevents auth loops when tokens expire mid-session
 * - Request Queuing: Multiple requests during token refresh are queued, not failed
 * - Smart Retries: Different error types need different retry strategies
 * - Network Resilience: Handles flaky connections with exponential backoff
 * - Rate Limiting: Respects server rate limits with Retry-After headers
 * - Debugging: Detailed logging helps diagnose production issues
 *
 * KEY FEATURES:
 * - Token refresh queue (lines 105-162): Prevents token refresh race conditions
 * - Error categorization (lines 33-55): Routes errors to appropriate handlers
 * - Exponential backoff with jitter (lines 58-61): Prevents retry storms
 * - Rate limit handling (lines 203-216): Respects server throttling
 * - Request tracking (lines 234): Traces requests across retries
 * - User-friendly messages (lines 346-369): Converts technical errors to helpful text
 *
 * CRITICAL FLOWS:
 * 1. Token Expiry: 401 → Queue request → Refresh token → Retry with new token
 * 2. Network Error: Fail → Calculate delay → Retry up to limit → Final error
 * 3. Rate Limit: 429 → Check Retry-After → Wait specified time → Retry
 */
import axios from 'axios'
import { useUserStateStore } from '../stores/userState.js'
import { callAuthProviderMethod } from './authProviders.js'

let routerRef = null

export function setAuthRouter(router) {
  routerRef = router
}

// WHY: Production APIs are flaky - this config handles common failures gracefully
const INTERCEPTOR_CONFIG = {
  maxRetries: 3,                // Enough to handle transient issues
  retryDelay: 1000,             // Start with 1 second
  backoffMultiplier: 2,         // Double delay each retry
  retryableStatusCodes: [408, 429, 500, 502, 503, 504], // Server errors worth retrying
  networkErrorRetries: 2,       // Network issues get fewer retries
  tokenRefreshTimeout: 10000,   // Don't wait forever for token refresh
  enableDetailedLogging: true   // Essential for debugging production issues
}

// WHY: Prevents duplicate token refreshes when multiple requests fail simultaneously
// All 401 responses queue up and wait for ONE refresh to complete
let isRefreshing = false
let refreshSubscribers = []

// Error categorization
const ERROR_CATEGORIES = {
  NETWORK: 'network_error',
  AUTH: 'auth_error',
  SERVER: 'server_error',
  CLIENT: 'client_error',
  TIMEOUT: 'timeout_error',
  RATE_LIMIT: 'rate_limit_error',
  UNKNOWN: 'unknown_error'
}

// WHY: Different error types need different retry strategies
// Network errors are retryable, auth errors are not
function categorizeError(error) {
  if (!error.response) {
    // Network error or timeout
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return ERROR_CATEGORIES.TIMEOUT
    }
    return ERROR_CATEGORIES.NETWORK
  }

  const status = error.response.status

  if (status === 401 || status === 403) {
    return ERROR_CATEGORIES.AUTH
  } else if (status === 429) {
    return ERROR_CATEGORIES.RATE_LIMIT
  } else if (status >= 400 && status < 500) {
    return ERROR_CATEGORIES.CLIENT
  } else if (status >= 500) {
    return ERROR_CATEGORIES.SERVER
  }

  return ERROR_CATEGORIES.UNKNOWN
}

// WHY: Exponential backoff prevents retry storms that can DDoS your own servers
// Jitter prevents all clients from retrying at exactly the same time
function calculateRetryDelay(retryCount, baseDelay = INTERCEPTOR_CONFIG.retryDelay) {
  const jitter = Math.random() * 200 // Add 0-200ms jitter
  return baseDelay * Math.pow(INTERCEPTOR_CONFIG.backoffMultiplier, retryCount - 1) + jitter
}

// Log error details for debugging
function logError(error, context = {}) {
  if (!INTERCEPTOR_CONFIG.enableDetailedLogging) return

  const errorInfo = {
    timestamp: new Date().toISOString(),
    category: categorizeError(error),
    url: error.config?.url,
    method: error.config?.method,
    status: error.response?.status,
    statusText: error.response?.statusText,
    message: error.message,
    data: error.response?.data,
    context,
    headers: error.config?.headers
  }

  // Remove sensitive information
  if (errorInfo.headers?.Authorization) {
    errorInfo.headers.Authorization = '[REDACTED]'
  }

  console.error('[Auth Interceptor] Request failed:', errorInfo)

  // Send to error tracking service if configured
  if (window.__errorTracker?.logError) {
    window.__errorTracker.logError('auth_interceptor', errorInfo)
  }
}

// Subscribe to token refresh completion
function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback)
}

// Notify all subscribers when token is refreshed
function onTokenRefreshed(token) {
  refreshSubscribers.forEach(callback => callback(token))
  refreshSubscribers = []
}

// WHY: Multiple requests can fail with 401 simultaneously - this prevents
// multiple token refreshes and ensures all requests use the new token
async function handleTokenRefresh(userStore, originalRequest) {
  // If already refreshing, queue this request
  if (isRefreshing) {
    return new Promise((resolve) => {
      subscribeTokenRefresh((token) => {
        originalRequest.headers['Authorization'] = `Bearer ${token}`
        resolve(axios.request(originalRequest))
      })
    })
  }

  isRefreshing = true

  try {
    // Set a timeout for token refresh
    const refreshPromise = callAuthProviderMethod(
      userStore.currentProvider,
      'handleTokenExpiry',
      userStore,
      originalRequest
    )

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Token refresh timeout')), INTERCEPTOR_CONFIG.tokenRefreshTimeout)
    })

    const refreshResult = await Promise.race([refreshPromise, timeoutPromise])

    if (refreshResult) {
      // Token refreshed successfully
      const newToken = userStore.token
      onTokenRefreshed(newToken)
      isRefreshing = false
      return axios.request(refreshResult)
    }

    throw new Error('Token refresh failed')
  } catch (error) {
    logError(error, { operation: 'token_refresh' })
    isRefreshing = false
    refreshSubscribers = []

    // Sign out user and redirect to login
    if (typeof userStore.signOut === 'function') {
      await userStore.signOut()
    }

    if (routerRef?.currentRoute?.value?.name !== 'login') {
      routerRef?.push?.({
        name: 'login',
        query: {
          redirect: routerRef?.currentRoute?.value?.fullPath,
          error: 'session_expired'
        }
      })
    }

    throw error
  }
}

// WHY: Not all errors are worth retrying - this prevents wasting resources
// on permanent failures while recovering from transient ones
function shouldRetry(error, retryCount) {
  // Don't retry if max retries exceeded
  if (retryCount >= INTERCEPTOR_CONFIG.maxRetries) {
    return false
  }

  // Don't retry if explicitly told not to
  if (error.config?._noRetry) {
    return false
  }

  const category = categorizeError(error)

  switch (category) {
    case ERROR_CATEGORIES.NETWORK:
      return retryCount < INTERCEPTOR_CONFIG.networkErrorRetries

    case ERROR_CATEGORIES.TIMEOUT:
      return true

    case ERROR_CATEGORIES.SERVER:
      return INTERCEPTOR_CONFIG.retryableStatusCodes.includes(error.response?.status)

    case ERROR_CATEGORIES.RATE_LIMIT:
      return true // Will retry with longer delay

    case ERROR_CATEGORIES.AUTH:
    case ERROR_CATEGORIES.CLIENT:
    case ERROR_CATEGORIES.UNKNOWN:
    default:
      return false
  }
}

// Get retry delay based on error type
function getRetryDelay(error, retryCount) {
  const category = categorizeError(error)

  if (category === ERROR_CATEGORIES.RATE_LIMIT) {
    // WHY: Servers tell us exactly when to retry via Retry-After header
    // Respecting this prevents getting banned
    const retryAfter = error.response?.headers['retry-after']
    if (retryAfter) {
      // Convert to milliseconds
      const delay = isNaN(retryAfter)
        ? new Date(retryAfter).getTime() - Date.now()
        : parseInt(retryAfter) * 1000

      return Math.min(delay, 60000) // Cap at 60 seconds
    }
    // Default rate limit delay
    return 5000 * retryCount
  }

  return calculateRetryDelay(retryCount)
}

export function setupAuthInterceptor(router) {
  if (router) {
    routerRef = router
  }
  // Request interceptor
  axios.interceptors.request.use(
    config => {
      const userStore = useUserStateStore()

      // Add auth headers
      if (userStore.token) {
        config.headers['Authorization'] = `Bearer ${userStore.token}`
        config.headers['X-Auth-Provider'] = userStore.currentProvider || 'none'
      }

      // WHY: Request IDs help trace issues across retries and backend logs
      config.headers['X-Request-ID'] = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Add retry count header if this is a retry
      if (config._retryCount) {
        config.headers['X-Retry-Count'] = config._retryCount
      }

      // Log outgoing request if detailed logging enabled
      if (INTERCEPTOR_CONFIG.enableDetailedLogging) {
        console.log('[Auth Interceptor] Request:', {
          url: config.url,
          method: config.method,
          requestId: config.headers['X-Request-ID'],
          hasAuthHeader: !!config.headers['Authorization'],
          authHeaderLength: config.headers['Authorization']?.length
        })
      }

      return config
    },
    error => {
      logError(error, { phase: 'request_interceptor' })
      return Promise.reject(error)
    }
  )

  // Response interceptor with comprehensive error handling and retry logic
  axios.interceptors.response.use(
    response => {
      // Log successful response if detailed logging enabled
      if (INTERCEPTOR_CONFIG.enableDetailedLogging && response.config.headers['X-Retry-Count']) {
        console.log('[Auth Interceptor] Request succeeded after retry:', {
          url: response.config.url,
          retryCount: response.config.headers['X-Retry-Count']
        })
      }
      return response
    },
    async error => {
      const userStore = useUserStateStore()
      const originalRequest = error.config

      // Initialize retry count
      if (!originalRequest._retryCount) {
        originalRequest._retryCount = 0
      }

      // WHY: 401 usually means token expired - refresh and retry instead of failing
      if (error.response?.status === 401 && userStore.token && !originalRequest._skipAuth) {
        // WHY: /auth/me failure means JWT secret mismatch - unrecoverable
        if (originalRequest.url?.includes('/auth/me')) {
          logError(error, {
            endpoint: '/auth/me',
            message: 'Auth validation failed - likely JWT secret mismatch'
          })

          if (typeof userStore.signOut === 'function') {
            await userStore.signOut()
          }

          if (routerRef?.currentRoute?.value?.name !== 'login') {
            routerRef?.push?.({
              name: 'login',
              query: {
                redirect: routerRef?.currentRoute?.value?.fullPath,
                error: 'auth_validation_failed'
              }
            })
          }

          return Promise.reject(error)
        }

        // Attempt token refresh
        try {
          return await handleTokenRefresh(userStore, originalRequest)
        } catch (refreshError) {
          return Promise.reject(refreshError)
        }
      }

      // WHY: Smart retry logic - only retry errors that might succeed next time
      if (shouldRetry(error, originalRequest._retryCount)) {
        originalRequest._retryCount++

        const delay = getRetryDelay(error, originalRequest._retryCount)

        logError(error, {
          phase: 'retry_attempt',
          retryCount: originalRequest._retryCount,
          maxRetries: INTERCEPTOR_CONFIG.maxRetries,
          retryDelay: delay
        })

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay))

        // Retry the request
        return axios.request(originalRequest)
      }

      // Final error handling - no more retries
      logError(error, {
        phase: 'final_error',
        retryCount: originalRequest._retryCount,
        category: categorizeError(error)
      })

      // Enhance error with additional information
      error.category = categorizeError(error)
      error.retryCount = originalRequest._retryCount
      error.requestId = originalRequest.headers?.['X-Request-ID']

      // WHY: Convert technical errors to user-friendly messages they can act on
      switch (error.category) {
        case ERROR_CATEGORIES.NETWORK:
          error.userMessage = 'Network connection failed. Please check your internet connection.'
          break

        case ERROR_CATEGORIES.TIMEOUT:
          error.userMessage = 'Request timed out. Please try again.'
          break

        case ERROR_CATEGORIES.RATE_LIMIT:
          error.userMessage = 'Too many requests. Please wait a moment before trying again.'
          break

        case ERROR_CATEGORIES.SERVER:
          error.userMessage = 'Server error occurred. Please try again later.'
          break

        case ERROR_CATEGORIES.AUTH:
          error.userMessage = 'Authentication failed. Please sign in again.'
          break

        default:
          error.userMessage = error.response?.data?.message || 'An error occurred. Please try again.'
      }

      return Promise.reject(error)
    }
  )
}

// Export configuration for external modification if needed
export const interceptorConfig = INTERCEPTOR_CONFIG

// Export utility functions for testing
export const __testing = {
  categorizeError,
  calculateRetryDelay,
  shouldRetry,
  getRetryDelay
}

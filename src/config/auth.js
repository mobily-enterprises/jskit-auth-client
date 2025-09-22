const DEFAULT_AUTH_CONFIG = {
  providers: ['local'],
  defaultProvider: 'local',
  anonymousProvider: 'local',

  // Anonymous session settings
  allowAnonymous: false,
  autoStartAnonymous: false,
  anonymousSessionDuration: 24 * 60 * 60 * 1000,

  // Password settings
  showPasswordReset: true,
  passwordMinLength: 8,
  requireStrongPassword: true,

  // Session management
  sessionCheckInterval: 5 * 60 * 1000,
  sessionWarningTime: 5 * 60 * 1000,
  autoRefreshToken: true,
  persistSession: true,

  // Timeout configuration (all in milliseconds)
  timeouts: {
    authRequest: 15000,
    tokenRefresh: 10000,
    profileFetch: 8000,
    sdkLoad: 5000,
    redirectDelay: 500,
    errorDisplayDuration: 5000,
    loadingTimeout: 30000,
    retryDelay: 1000,
    maxRetryDelay: 30000,
    backoffMultiplier: 2,
  },

  retry: {
    maxAttempts: 3,
    retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR', 'RATE_LIMIT'],
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    networkErrorRetries: 2,
    exponentialBackoff: true,
    jitterRange: 200,
  },

  errorHandling: {
    enableDetailedLogging: false,
    logToConsole: true,
    logSensitiveData: false,
    errorTracking: {
      enabled: false,
      endpoint: null,
      apiKey: null,
      sampleRate: 1.0,
      includeStackTrace: true,
      includeUserContext: true,
      excludePatterns: [
        /ResizeObserver loop limit exceeded/,
        /Non-Error promise rejection captured/
      ]
    },
    messages: {
      NETWORK_ERROR: 'Unable to connect. Please check your internet connection.',
      TIMEOUT: 'The request took too long. Please try again.',
      RATE_LIMIT: 'Too many requests. Please wait a moment before trying again.',
      INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
      EMAIL_NOT_CONFIRMED: 'Please confirm your email address before signing in.',
      EMAIL_EXISTS: 'This email is already registered. Please sign in or use a different email.',
      WEAK_PASSWORD: 'Password is too weak. Please use a stronger password.',
      SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
      TOKEN_REFRESH_FAILED: 'Unable to refresh your session. Please sign in again.',
      AUTH_VALIDATION_FAILED: 'Authentication validation failed. Please sign in again.',
      GOOGLE_SDK_LOAD_FAILED: 'Unable to load Google Sign-In. Please try again or use another method.',
      GOOGLE_SDK_INIT_FAILED: 'Google Sign-In initialization failed. Please refresh the page.',
      SUPABASE_CONNECTION_FAILED: 'Unable to connect to authentication service.',
      UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
      SERVER_ERROR: 'Server error. Please try again later.',
      CLIENT_ERROR: 'Invalid request. Please check your input and try again.',
      LOGIN_SUCCESS: 'Welcome back!',
      SIGNUP_SUCCESS: 'Account created successfully!',
      LOGOUT_SUCCESS: 'You have been signed out.',
      PASSWORD_RESET_SENT: 'Password reset link has been sent to your email.',
      EMAIL_CONFIRMED: 'Email confirmed successfully!',
      PROFILE_UPDATED: 'Profile updated successfully.',
    },
    recovery: {
      autoRecover: {
        NETWORK_ERROR: true,
        TIMEOUT: true,
        TOKEN_EXPIRED: true,
        RATE_LIMIT: true,
      },
      fallbacks: {
        GOOGLE_SDK_FAILED: 'oauth_redirect',
        TOKEN_REFRESH_FAILED: 'relogin',
        PROFILE_FETCH_FAILED: 'continue',
      },
      circuitBreaker: {
        enabled: true,
        threshold: 5,
        timeout: 60000,
        halfOpenRequests: 3,
      }
    }
  },

  rateLimiting: {
    enabled: true,
    requests: {
      login: { max: 5, window: 300000 },
      signup: { max: 3, window: 600000 },
      passwordReset: { max: 3, window: 3600000 },
      tokenRefresh: { max: 10, window: 60000 },
    },
    storage: 'localStorage',
  },

  security: {
    csrfEnabled: true,
    csrfTokenHeader: 'X-CSRF-Token',
    signRequests: false,
    signatureHeader: 'X-Request-Signature',
    tokenStorage: 'localStorage',
    secureCookies: true,
    sameSiteCookies: 'strict',
    validateSessionOnFocus: true,
    validateSessionInterval: 60000,
  },

  ui: {
    showLoadingStates: true,
    showErrorDetails: false,
    autoFocusFirstField: true,
    persistFormData: true,
    locale: 'en',
    animations: {
      enabled: true,
      duration: 300,
      easing: 'ease-in-out',
    }
  },

  debug: {
    enabled: false,
    logRequests: true,
    logResponses: true,
    logErrors: true,
    mockLatency: 0,
    failureRate: 0,
  }
}

export const AUTH_CONFIG_DEFAULTS = JSON.parse(JSON.stringify(DEFAULT_AUTH_CONFIG))

export const authConfig = JSON.parse(JSON.stringify(DEFAULT_AUTH_CONFIG))

function mergeInto(target, source) {
  if (!source || typeof source !== 'object') {
    return
  }

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue

    if (Array.isArray(value)) {
      target[key] = [...value]
    } else if (value && typeof value === 'object') {
      if (typeof target[key] !== 'object' || target[key] === null || Array.isArray(target[key])) {
        target[key] = {}
      }
      mergeInto(target[key], value)
    } else {
      target[key] = value
    }
  }
}

export function resetAuthConfig() {
  for (const key of Object.keys(authConfig)) {
    delete authConfig[key]
  }
  mergeInto(authConfig, AUTH_CONFIG_DEFAULTS)
}

export function applyAuthConfig(overrides = {}) {
  if (!overrides || typeof overrides !== 'object') return

  if (overrides.providers) {
    authConfig.providers = [...overrides.providers]
  }

  mergeInto(authConfig, overrides)
}

export function getTimeout(key, fallback = 10000) {
  return authConfig.timeouts?.[key] ?? fallback
}

export function getErrorMessage(code, fallback = null) {
  return authConfig.errorHandling?.messages?.[code] ||
         fallback ||
         authConfig.errorHandling?.messages?.UNKNOWN_ERROR
}

export function shouldRetryError(errorCode, statusCode) {
  const retryConfig = authConfig.retry || {}

  if (retryConfig.retryableErrors?.includes(errorCode)) {
    return true
  }
  if (statusCode && retryConfig.retryableStatusCodes?.includes(statusCode)) {
    return true
  }
  return false
}

export function checkRateLimit(action) {
  const rateConfig = authConfig.rateLimiting
  if (!rateConfig?.enabled) return true

  const limits = rateConfig.requests?.[action]
  if (!limits) return true

  const storageName = rateConfig.storage || 'localStorage'
  const storage = typeof window !== 'undefined' ? window[storageName] : null
  if (!storage) return true

  const key = `rate_limit_${action}`
  const now = Date.now()

  try {
    const data = JSON.parse(storage.getItem(key) || '[]')
    const recent = data.filter(time => now - time < limits.window)

    if (recent.length >= limits.max) {
      return false
    }

    recent.push(now)
    storage.setItem(key, JSON.stringify(recent))
    return true
  } catch (error) {
    console.error('Rate limit check failed:', error)
    return true
  }
}

class CircuitBreaker {
  constructor(name, config = authConfig.errorHandling.recovery.circuitBreaker) {
    this.name = name
    this.config = config
    this.state = 'closed'
    this.failures = 0
    this.lastFailureTime = null
    this.successCount = 0
  }

  async execute(fn) {
    if (!this.config?.enabled) {
      return fn()
    }

    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime
      if (elapsed > this.config.timeout) {
        this.state = 'half-open'
        this.successCount = 0
      } else {
        throw new Error(`Circuit breaker is open for ${this.name}`)
      }
    }

    try {
      const result = await fn()

      if (this.state === 'half-open') {
        this.successCount++
        if (this.successCount >= this.config.halfOpenRequests) {
          this.state = 'closed'
          this.failures = 0
        }
      } else if (this.state === 'closed') {
        this.failures = Math.max(0, this.failures - 1)
      }

      return result
    } catch (error) {
      this.failures++
      this.lastFailureTime = Date.now()

      if (this.failures >= this.config.threshold) {
        this.state = 'open'
      }

      throw error
    }
  }

  reset() {
    this.state = 'closed'
    this.failures = 0
    this.lastFailureTime = null
    this.successCount = 0
  }
}

export const circuitBreakers = {
  auth: new CircuitBreaker('auth'),
  tokenRefresh: new CircuitBreaker('tokenRefresh'),
  profile: new CircuitBreaker('profile'),
}

export default authConfig

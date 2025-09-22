// Centralized authentication configuration with comprehensive error handling settings
export const authConfig = {
  // Provider configuration
  // NOTE: This list includes authentication system names, not OAuth provider names
  // 'local' = frontend-only anonymous sessions
  // 'supabase' = Supabase auth system (email/password + OAuth)
  // 'google' = Direct Google OAuth (not through Supabase)
  providers: ['local', 'supabase', 'google'],
  defaultProvider: import.meta.env.VITE_DEFAULT_AUTH_PROVIDER || 'supabase',
  anonymousProvider: 'local', // Always use local for anonymous

  // Anonymous session settings
  allowAnonymous: import.meta.env.VITE_ALLOW_ANONYMOUS === 'true' || import.meta.env.VITE_ALLOW_ANONYMOUS === true,
  autoStartAnonymous: import.meta.env.VITE_AUTO_START_ANONYMOUS === 'true' || import.meta.env.VITE_AUTO_START_ANONYMOUS === true,
  anonymousSessionDuration: 24 * 60 * 60 * 1000, // 24 hours

  // Password settings
  showPasswordReset: true,
  passwordMinLength: 8,
  requireStrongPassword: true,

  // Session management
  sessionCheckInterval: 5 * 60 * 1000, // Check every 5 minutes
  sessionWarningTime: 5 * 60 * 1000, // Warn 5 minutes before expiry
  autoRefreshToken: true,
  persistSession: true,

  // Timeout configuration (all in milliseconds)
  timeouts: {
    // Network timeouts
    authRequest: 15000,           // 15 seconds for auth requests
    tokenRefresh: 10000,          // 10 seconds for token refresh
    profileFetch: 8000,           // 8 seconds for profile fetch
    sdkLoad: 5000,               // 5 seconds for SDK loading

    // UI timeouts
    redirectDelay: 500,          // Delay before redirect after auth
    errorDisplayDuration: 5000,  // How long to show error messages
    loadingTimeout: 30000,       // Maximum loading state duration

    // Retry timeouts
    retryDelay: 1000,           // Initial retry delay
    maxRetryDelay: 30000,       // Maximum retry delay
    backoffMultiplier: 2,       // Exponential backoff multiplier
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,              // Maximum retry attempts
    retryableErrors: [           // Error codes that trigger retry
      'NETWORK_ERROR',
      'TIMEOUT',
      'SERVER_ERROR',
      'RATE_LIMIT'
    ],
    retryableStatusCodes: [      // HTTP status codes that trigger retry
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504  // Gateway Timeout
    ],
    networkErrorRetries: 2,      // Specific retries for network errors
    exponentialBackoff: true,    // Use exponential backoff
    jitterRange: 200,            // Random jitter 0-200ms
  },

  // Error handling configuration
  errorHandling: {
    // Logging settings
    enableDetailedLogging: import.meta.env.DEV, // Detailed logs in dev only
    logToConsole: true,
    logSensitiveData: false,     // Never log tokens, passwords, etc.

    // Error tracking service (optional)
    errorTracking: {
      enabled: import.meta.env.VITE_ERROR_TRACKING_ENABLED === 'true',
      endpoint: import.meta.env.VITE_ERROR_TRACKING_ENDPOINT,
      apiKey: import.meta.env.VITE_ERROR_TRACKING_API_KEY,
      sampleRate: 1.0,           // Percentage of errors to track (0.0 to 1.0)
      includeStackTrace: true,
      includeUserContext: true,
      excludePatterns: [         // Don't track these error patterns
        /ResizeObserver loop limit exceeded/,
        /Non-Error promise rejection captured/
      ]
    },

    // User-facing error messages
    messages: {
      // Network errors
      NETWORK_ERROR: 'Unable to connect. Please check your internet connection.',
      TIMEOUT: 'The request took too long. Please try again.',
      RATE_LIMIT: 'Too many requests. Please wait a moment before trying again.',

      // Authentication errors
      INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
      EMAIL_NOT_CONFIRMED: 'Please confirm your email address before signing in.',
      EMAIL_EXISTS: 'This email is already registered. Please sign in or use a different email.',
      WEAK_PASSWORD: 'Password is too weak. Please use a stronger password.',

      // Session errors
      SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
      TOKEN_REFRESH_FAILED: 'Unable to refresh your session. Please sign in again.',
      AUTH_VALIDATION_FAILED: 'Authentication validation failed. Please sign in again.',

      // Provider-specific errors
      GOOGLE_SDK_LOAD_FAILED: 'Unable to load Google Sign-In. Please try again or use another method.',
      GOOGLE_SDK_INIT_FAILED: 'Google Sign-In initialization failed. Please refresh the page.',
      SUPABASE_CONNECTION_FAILED: 'Unable to connect to authentication service.',

      // Generic errors
      UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
      SERVER_ERROR: 'Server error. Please try again later.',
      CLIENT_ERROR: 'Invalid request. Please check your input and try again.',

      // Success messages
      LOGIN_SUCCESS: 'Welcome back!',
      SIGNUP_SUCCESS: 'Account created successfully!',
      LOGOUT_SUCCESS: 'You have been signed out.',
      PASSWORD_RESET_SENT: 'Password reset link has been sent to your email.',
      EMAIL_CONFIRMED: 'Email confirmed successfully!',
      PROFILE_UPDATED: 'Profile updated successfully.',
    },

    // Error recovery strategies
    recovery: {
      // Auto-recovery for specific errors
      autoRecover: {
        NETWORK_ERROR: true,      // Auto-retry on network errors
        TIMEOUT: true,            // Auto-retry on timeout
        TOKEN_EXPIRED: true,      // Auto-refresh token
        RATE_LIMIT: true,        // Auto-retry after delay
      },

      // Fallback strategies
      fallbacks: {
        GOOGLE_SDK_FAILED: 'oauth_redirect',  // Use OAuth redirect if SDK fails
        TOKEN_REFRESH_FAILED: 'relogin',      // Force re-login if refresh fails
        PROFILE_FETCH_FAILED: 'continue',     // Continue without profile
      },

      // Circuit breaker configuration
      circuitBreaker: {
        enabled: true,
        threshold: 5,             // Failures before opening circuit
        timeout: 60000,          // Time before trying again (1 minute)
        halfOpenRequests: 3,     // Requests to test in half-open state
      }
    }
  },

  // Rate limiting configuration
  rateLimiting: {
    enabled: true,
    requests: {
      login: { max: 5, window: 300000 },        // 5 attempts per 5 minutes
      signup: { max: 3, window: 600000 },       // 3 attempts per 10 minutes
      passwordReset: { max: 3, window: 3600000 }, // 3 attempts per hour
      tokenRefresh: { max: 10, window: 60000 },  // 10 attempts per minute
    },
    storage: 'localStorage',     // Where to store rate limit counters
  },

  // Security settings
  security: {
    // CSRF protection
    csrfEnabled: true,
    csrfTokenHeader: 'X-CSRF-Token',

    // Request signing
    signRequests: false,
    signatureHeader: 'X-Request-Signature',

    // Token storage
    tokenStorage: 'localStorage', // 'localStorage', 'sessionStorage', 'memory', 'cookie'
    secureCookies: true,         // Use secure flag for cookies
    sameSiteCookies: 'strict',   // SameSite cookie attribute

    // Session validation
    validateSessionOnFocus: true, // Check session when window gains focus
    validateSessionInterval: 60000, // Check session every minute
  },

  // UI/UX settings
  ui: {
    showLoadingStates: true,
    showErrorDetails: import.meta.env.DEV, // Show detailed errors in dev only
    autoFocusFirstField: true,
    persistFormData: true,       // Remember form data on error
    locale: 'en',                // Default locale for messages

    // Animation settings
    animations: {
      enabled: true,
      duration: 300,              // Default animation duration
      easing: 'ease-in-out',
    }
  },

  // Development/debugging settings
  debug: {
    enabled: import.meta.env.DEV,
    logRequests: true,
    logResponses: true,
    logErrors: true,
    mockLatency: 0,              // Add artificial latency for testing
    failureRate: 0,              // Simulate random failures (0.0 to 1.0)
  }
}

// Helper function to get timeout value with fallback
export function getTimeout(key, fallback = 10000) {
  return authConfig.timeouts[key] || fallback
}

// Helper function to get error message
export function getErrorMessage(code, fallback = null) {
  return authConfig.errorHandling.messages[code] ||
         fallback ||
         authConfig.errorHandling.messages.UNKNOWN_ERROR
}

// Helper function to determine if error should be retried
export function shouldRetryError(errorCode, statusCode) {
  if (authConfig.retry.retryableErrors.includes(errorCode)) {
    return true
  }
  if (statusCode && authConfig.retry.retryableStatusCodes.includes(statusCode)) {
    return true
  }
  return false
}

// Helper function for rate limiting check
export function checkRateLimit(action) {
  if (!authConfig.rateLimiting.enabled) return true

  const limits = authConfig.rateLimiting.requests[action]
  if (!limits) return true

  const storage = window[authConfig.rateLimiting.storage]
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
    return true // Allow on error
  }
}

// Helper function for circuit breaker
class CircuitBreaker {
  constructor(name, config = authConfig.errorHandling.recovery.circuitBreaker) {
    this.name = name
    this.config = config
    this.state = 'closed' // closed, open, half-open
    this.failures = 0
    this.lastFailureTime = null
    this.successCount = 0
  }

  async execute(fn) {
    if (!this.config.enabled) {
      return fn()
    }

    // Check if circuit should be half-open
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

      // Success - update state
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
      // Failure - update state
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

// Export circuit breaker instances for different services
export const circuitBreakers = {
  auth: new CircuitBreaker('auth'),
  tokenRefresh: new CircuitBreaker('tokenRefresh'),
  profile: new CircuitBreaker('profile'),
}

// Export the config for modification if needed
export default authConfig
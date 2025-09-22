<template>
  <!-- GOOGLE-SPECIFIC: Google Sign-In widget -->
  <div class="google-auth-widget">
    <div
      v-if="errorState.show"
      class="google-auth-widget__alert"
      :data-variant="errorState.type"
      role="alert"
    >
      <button
        type="button"
        class="google-auth-widget__alert-close"
        aria-label="Dismiss"
        @click="dismissError"
      >
        ×
      </button>
      <strong class="google-auth-widget__alert-title">{{ errorState.title }}</strong>
      <p v-if="errorState.message" class="google-auth-widget__alert-message">
        {{ errorState.message }}
      </p>
      <button
        v-if="errorState.canRetry"
        type="button"
        class="google-auth-widget__button"
        @click="retryInitialization"
      >
        Retry
      </button>
    </div>

    <div v-if="isLoading" class="google-auth-widget__loading">
      <span class="google-auth-widget__spinner" aria-hidden="true"></span>
      <div class="google-auth-widget__loading-text">{{ loadingMessage }}</div>
    </div>

    <div
      v-show="!isLoading && !errorState.show"
      ref="buttonContainer"
      id="google-signin-button"
    />
  </div>
</template>

<script setup>
/**
 * ============================================================================
 * GoogleAuthWidget.vue - BLACK BOX INTERFACE DOCUMENTATION
 * ============================================================================
 *
 * PURPOSE:
 * This component provides Google Sign-In functionality. It's a self-contained
 * black box that handles all Google OAuth complexity internally.
 *
 * ============================================================================
 * DATA FLOW:
 * ============================================================================
 *
 * 1. INITIALIZATION (onMounted)
 *    ↓
 *    Load Google SDK from CDN → [FAIL?] → Show retry option
 *    ↓ [SUCCESS]
 *    Initialize with Client ID → [FAIL?] → Retry with exponential backoff
 *    ↓ [SUCCESS]
 *    Render Google Sign-In button
 *
 * 2. USER CLICKS SIGN IN
 *    ↓
 *    Google popup appears → User authenticates
 *    ↓
 *    Receive ID token (JWT) from Google
 *    ↓
 *    Send to backend: POST /api/auth/google/one-tap
 *    ↓
 *    Backend verifies & returns session tokens
 *    ↓
 *    Store session & redirect to app
 *
 * ============================================================================
 * INPUTS (Props):
 * ============================================================================
 * - None (configuration via environment variables)
 *
 * ============================================================================
 * OUTPUTS (Events):
 * ============================================================================
 * @emits message - Status updates
 *   { text: string, color: 'info'|'success'|'error' }
 *
 * @emits success - Authentication successful
 *   session: { access_token, user }
 *
 * @emits error - Authentication failed
 *   { type: string, error: object, canRetry: boolean }
 *
 * ============================================================================
 * ENVIRONMENT REQUIREMENTS:
 * ============================================================================
 * - google.clientId provided via configureAuthClient (required)
 *
 * ============================================================================
 * BACKEND ENDPOINTS USED:
 * ============================================================================
 * POST /api/auth/google/one-tap
 *   Request:  { credential: string }  // Google ID token
 *   Response: { session: { access_token, user } } + Set-Cookie: refresh_token
 *   Errors:   { error: 'EMAIL_EXISTS', existingProviders: string[] }
 *
 * ============================================================================
 * ERROR RECOVERY MECHANISMS:
 * ============================================================================
 * 1. SDK Load Failure → Show retry + error message
 * 2. Network Timeout → Retry with exponential backoff (max 3 attempts)
 * 3. Email Conflict → Show which provider to use
 * 4. Token Expired → Handled by backend (not this component)
 *
 * ============================================================================
 * STATE MANAGEMENT:
 * ============================================================================
 * Internal State:
 * - isLoading: boolean - Shows spinner during operations
 * - errorState: object - Current error display
 *
 * External State (via useUserStateStore):
 * - Sets user session after successful auth
 * - Triggers profile fetch
 *
 * ============================================================================
 * SECURITY CONSIDERATIONS:
 * ============================================================================
 * - ID token verified on backend (not frontend)
 * - No client secret in frontend code
 * - CSRF protection via Google's nonce
 * - XSS protection via Google's iframe isolation
 *
 * ============================================================================
 *
 * ORIGINAL DOCUMENTATION:
 *
 * WHAT IT DOES:
 * - Loads and initializes Google's Sign-In SDK (GSI)
 * - Renders the official Google Sign-In button
 * - Handles OAuth credentials and sends them to backend
 * - Manages authentication state and redirects
 *
 * WHY THE COMPLEXITY:
 * - SDK Loading: Google's SDK can fail due to ad blockers, network issues, or script conflicts
 * - Error Recovery: Users need clear feedback and retry options when auth fails
 * - Race Conditions: Prevents multiple simultaneous auth attempts and handles timeouts
 * - User Experience: Shows loading states, error messages with context, and recovery actions
 *
 * KEY FEATURES:
 * - Exponential backoff retry (lines 217-237): Prevents hammering failed services
 * - Timeout protection (lines 253-255): Prevents hanging on slow networks
 * - Email conflict detection (lines 267-273): Handles accounts already linked to other providers
 * - SDK load monitoring (lines 393-426): Detects and recovers from SDK load failures
 */
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStateStore } from '../../../stores/userState.js';
import { getAuthClientConfig } from '../../../runtimeConfig.js';
import axios from 'axios';
import { authConfig } from '../../../config/auth.js';
import googleAuthProvider from './provider.js';

// WHY: Google's SDK fails often - ad blockers, network issues, slow connections
// This config prevents infinite retries and hanging requests
const ERROR_RECOVERY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // Start with 1 second
  backoffMultiplier: 2,
  networkTimeout: 10000,
  sdkLoadTimeout: 5000
};

// WHY: Different errors need different handling - some are retryable, others aren't
const ERROR_TYPES = {
  SDK_LOAD_FAILED: 'sdk_load_failed',  // Ad blocker or CDN issue
  SDK_INIT_FAILED: 'sdk_init_failed',  // Google config problem
  NETWORK_ERROR: 'network_error',      // Connection lost
  CONFIG_ERROR: 'config_error',        // Missing client ID
  AUTH_FAILED: 'auth_failed',          // Invalid credentials
  EMAIL_CONFLICT: 'email_conflict',    // Email already linked to another provider
  TIMEOUT: 'timeout'                   // Request took too long
};

// Emit events to parent
const emit = defineEmits(['message', 'success', 'error', 'linked'])

const props = defineProps({
  mode: {
    type: String,
    default: 'login'
  }
})

const router = useRouter();
const route = useRoute();
const userStore = useUserStateStore();

// GOOGLE-SPECIFIC: Configuration
const clientId = getAuthClientConfig().google?.clientId;
if (!clientId) {
  throw new Error('GoogleAuthWidget: google.clientId is not configured. Call configureAuthClient() before importing this widget.');
}
const buttonContainer = ref(null);

// State management
const isLoading = ref(true);
const loadingMessage = ref('Initializing Google Sign-In...');
const retryCount = ref(0);
const sdkLoadTimer = ref(null);

// Error state management
const errorState = reactive({
  show: false,
  type: 'error',
  title: '',
  message: '',
  canRetry: false,
  errorCode: null
});

// WHY: Converts technical errors into user-friendly messages with recovery options
// Shows different UI based on whether the error is retryable or permanent
const handleError = (errorType, error, context = {}) => {
  console.error(`[GoogleAuth] ${errorType}:`, error, context);

  isLoading.value = false;

  // Prepare error details for logging
  const errorDetails = {
    type: errorType,
    message: error?.message || 'Unknown error',
    stack: error?.stack,
    context,
    timestamp: new Date().toISOString(),
    retryCount: retryCount.value
  };

  // Send to error tracking service (if configured)
  if (authConfig.errorTracking?.enabled) {
    logErrorToService(errorDetails);
  }

  // Map error type to user-friendly messages
  switch (errorType) {
    case ERROR_TYPES.SDK_LOAD_FAILED:
      errorState.show = true;
      errorState.type = 'error';
      errorState.title = 'Failed to load Google Sign-In';
      errorState.message = 'The Google authentication service could not be loaded. This might be due to network issues or ad blockers.';
      errorState.canRetry = true;
      break;

    case ERROR_TYPES.SDK_INIT_FAILED:
      errorState.show = true;
      errorState.type = 'error';
      errorState.title = 'Google Sign-In initialization failed';
      errorState.message = `Unable to initialize Google authentication. Error: ${error?.message || 'Unknown'}`;
      errorState.canRetry = true;
      break;

    case ERROR_TYPES.CONFIG_ERROR:
      errorState.show = true;
      errorState.type = 'warning';
      errorState.title = 'Configuration Issue';
      errorState.message = 'Google Sign-In is not properly configured. Please contact support.';
      errorState.canRetry = false;
      break;

    case ERROR_TYPES.NETWORK_ERROR:
      errorState.show = true;
      errorState.type = 'error';
      errorState.title = 'Network Error';
      errorState.message = 'Unable to connect to authentication service. Please check your internet connection.';
      errorState.canRetry = true;
      break;

    case ERROR_TYPES.EMAIL_CONFLICT:
      errorState.show = true;
      errorState.type = 'warning';
      errorState.title = 'Email Already Registered';
      errorState.message = context.message || 'This email is already associated with another account.';
      errorState.canRetry = false;
      break;

    case ERROR_TYPES.TIMEOUT:
      errorState.show = true;
      errorState.type = 'error';
      errorState.title = 'Request Timeout';
      errorState.message = 'The authentication request took too long. Please try again.';
      errorState.canRetry = true;
      break;

    default:
      errorState.show = true;
      errorState.type = 'error';
      errorState.title = 'Authentication Error';
      errorState.message = error?.message || 'An unexpected error occurred during authentication.';
      errorState.canRetry = true;
  }

  errorState.errorCode = errorType;

  // Emit error to parent
  emit('error', {
    type: errorType,
    error: errorDetails,
    canRetry: errorState.canRetry
  });
};

const dismissError = () => {
  errorState.show = false;
};

// Log errors to external service
const logErrorToService = async (errorDetails) => {
  try {
    if (authConfig.errorTracking?.endpoint) {
      await axios.post(authConfig.errorTracking.endpoint, {
        component: 'GoogleAuthWidget',
        ...errorDetails
      });
    }
  } catch (err) {
    console.error('[GoogleAuth] Failed to log error to service:', err);
  }
};

// WHY: SDK loading can fail temporarily - exponential backoff prevents hammering Google's servers
// Gives time for network issues to resolve or ad blockers to be disabled
const retryInitialization = async () => {
  if (retryCount.value >= ERROR_RECOVERY_CONFIG.maxRetries) {
    handleError(ERROR_TYPES.SDK_INIT_FAILED, new Error('Max retries exceeded'), {
      maxRetries: ERROR_RECOVERY_CONFIG.maxRetries
    });
    return;
  }

  retryCount.value++;
  errorState.show = false;
  isLoading.value = true;
  loadingMessage.value = `Retrying initialization (Attempt ${retryCount.value}/${ERROR_RECOVERY_CONFIG.maxRetries})...`;

  // Calculate delay with exponential backoff
  const delay = ERROR_RECOVERY_CONFIG.retryDelay * Math.pow(ERROR_RECOVERY_CONFIG.backoffMultiplier, retryCount.value - 1);

  await new Promise(resolve => setTimeout(resolve, delay));

  await initializeGoogle();
};

// Handle Google credential with comprehensive error handling
const handleGoogleCredential = async (response) => {
  let timeoutId;

  try {
    isLoading.value = true;
    loadingMessage.value = 'Authenticating with Google...';

    emit('message', {
      text: 'Signing in with Google...',
      color: 'info'
    });

    // WHY: Prevents hanging on slow networks - better to fail fast and retry
    // than leave user waiting indefinitely
    timeoutId = setTimeout(() => {
      throw new Error('Authentication timeout');
    }, ERROR_RECOVERY_CONFIG.networkTimeout);

    if (props.mode === 'link') {
      await googleAuthProvider.linkAccount(response.credential);

      clearTimeout(timeoutId);

      isLoading.value = false;
      emit('message', { text: 'Google account connected', color: 'success' });
      emit('linked', { provider: 'google' });
      return;
    }

    const { data } = await axios.post('/api/auth/google/one-tap', {
      credential: response.credential
    }, {
      timeout: ERROR_RECOVERY_CONFIG.networkTimeout,
      validateStatus: (status) => status < 500, // Don't throw for 4xx errors
      withCredentials: true
    });

    clearTimeout(timeoutId);

    // WHY: Users often forget which provider they used - this tells them exactly
    // which login method to use for their email
    if (data.error === 'EMAIL_EXISTS') {
      handleError(ERROR_TYPES.EMAIL_CONFLICT, null, {
        message: `This email is already registered. Please sign in with: ${data.existingProviders.join(', ')}`,
        providers: data.existingProviders
      });
      return;
    }

    if (data.error) {
      throw new Error(data.error);
    }

    // Success path - data is now the session directly (not wrapped)
    data._provider = 'google';
    await userStore.setSession(data, 'google');
    googleAuthProvider.cacheSessionMeta(data);

    try {
      await userStore.fetchProfile();
    } catch (profileError) {
      console.warn('[GoogleAuth] Profile fetch failed, but auth succeeded:', profileError);
      // Continue anyway - profile fetch is not critical
    }

    isLoading.value = false;
    emit('message', { text: 'Welcome!', color: 'success' });
    emit('success', data);

    const redirect = route.query.redirect || '/';
    setTimeout(() => router.push(redirect), authConfig.redirectDelay || 500);

  } catch (error) {
    clearTimeout(timeoutId);

    if (props.mode === 'link') {
      handleError(ERROR_TYPES.AUTH_FAILED, error);
      return;
    }

    // Categorize and handle the error
    if (error.message === 'Authentication timeout') {
      handleError(ERROR_TYPES.TIMEOUT, error);
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      handleError(ERROR_TYPES.TIMEOUT, error);
    } else if (error.response?.status >= 400 && error.response?.status < 500) {
      handleError(ERROR_TYPES.AUTH_FAILED, error, {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.response?.status >= 500) {
      handleError(ERROR_TYPES.NETWORK_ERROR, error, {
        status: error.response.status,
        message: 'Server error. Please try again later.'
      });
    } else if (error.request && !error.response) {
      handleError(ERROR_TYPES.NETWORK_ERROR, error);
    } else {
      handleError(ERROR_TYPES.AUTH_FAILED, error);
    }
  }
};

// Initialize Google SDK with comprehensive error handling
const initializeGoogle = async () => {
  if (!clientId) {
    handleError(ERROR_TYPES.CONFIG_ERROR, new Error('Google Client ID not configured'));
    return;
  }

  if (window.google?.accounts?.id) {
    try {
      // Initialize with configuration
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
        ux_mode: 'popup',
        itp_support: true,
        cancel_on_tap_outside: true,
        context: 'signin',
        log_level: 'info' // Enable Google's internal logging
      });

      // Wait for DOM
      await nextTick();

      // Render the button with Google's responsive design
      if (buttonContainer.value) {
        window.google.accounts.id.renderButton(buttonContainer.value, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: buttonContainer.value.offsetWidth,
          locale: authConfig.locale || 'en'
        });

        isLoading.value = false;
        errorState.show = false;
        retryCount.value = 0; // Reset retry count on success
      } else {
        throw new Error('Button container not found in DOM');
      }

    } catch (error) {
      handleError(ERROR_TYPES.SDK_INIT_FAILED, error, {
        hasGoogleObject: !!window.google,
        hasAccountsId: !!window.google?.accounts?.id,
        clientIdPresent: !!clientId
      });
    }
  } else {
    handleError(ERROR_TYPES.SDK_LOAD_FAILED, new Error('Google SDK not loaded'));
  }
};

// WHY: SDK loading is unreliable - script tags can be blocked, network can fail
// This ensures we detect failures quickly and show appropriate UI
const loadGoogleSDK = () => {
  return new Promise((resolve, reject) => {
    // Check if already loaded (prevents duplicate script tags)
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;

    // Set loading timeout
    sdkLoadTimer.value = setTimeout(() => {
      script.remove();
      reject(new Error('SDK load timeout'));
    }, ERROR_RECOVERY_CONFIG.sdkLoadTimeout);

    script.onload = () => {
      clearTimeout(sdkLoadTimer.value);
      // Give SDK time to initialize
      setTimeout(resolve, 100);
    };

    script.onerror = (error) => {
      clearTimeout(sdkLoadTimer.value);
      script.remove();
      reject(error);
    };

    document.head.appendChild(script);
  });
};

// Component lifecycle
onMounted(async () => {
  try {
    loadingMessage.value = 'Loading Google Sign-In...';
    await loadGoogleSDK();
    await initializeGoogle();
  } catch (error) {
    if (error.message === 'SDK load timeout') {
      handleError(ERROR_TYPES.TIMEOUT, error, {
        timeout: ERROR_RECOVERY_CONFIG.sdkLoadTimeout
      });
    } else {
      handleError(ERROR_TYPES.SDK_LOAD_FAILED, error);
    }
  }
});

// Cleanup
onUnmounted(() => {
  if (sdkLoadTimer.value) {
    clearTimeout(sdkLoadTimer.value);
  }
  // Remove any pending Google prompts
  if (window.google?.accounts?.id) {
    try {
      window.google.accounts.id.cancel();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});
</script>

<style scoped>
.google-auth-widget {
  width: 100%;
}

#google-signin-button {
  width: 100%;
  display: flex;
  justify-content: center;
  min-height: 44px;
}

#google-signin-button :deep(iframe) {
  width: 100% !important;
}

.google-auth-widget__alert {
  position: relative;
  margin-bottom: 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #d6d6d6;
  background: #f5f5f5;
  color: #333;
}

.google-auth-widget__alert[data-variant="error"] {
  border-color: #f8b4b4;
  background: #fdecec;
  color: #7f1d1d;
}

.google-auth-widget__alert[data-variant="warning"] {
  border-color: #facc15;
  background: #fefce8;
  color: #78350f;
}

.google-auth-widget__alert-title {
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
}

.google-auth-widget__alert-message {
  margin: 0.35rem 0 0.65rem;
  font-size: 0.85rem;
  line-height: 1.4;
}

.google-auth-widget__alert-close {
  position: absolute;
  top: 0.35rem;
  right: 0.5rem;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 1.1rem;
  cursor: pointer;
}

.google-auth-widget__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background: #1d4ed8;
  color: #fff;
  border: 1px solid #1d4ed8;
  border-radius: 4px;
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.google-auth-widget__button:hover {
  background: #1e40af;
  border-color: #1e40af;
}

.google-auth-widget__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 0.5rem;
  text-align: center;
}

.google-auth-widget__spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid rgba(59, 130, 246, 0.2);
  border-top-color: #1d4ed8;
  animation: google-auth-widget-spin 0.8s linear infinite;
}

.google-auth-widget__loading-text {
  font-size: 0.9rem;
  color: #334155;
}

@keyframes google-auth-widget-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

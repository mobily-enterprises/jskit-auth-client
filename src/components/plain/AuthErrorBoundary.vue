<template>
  <ErrorBoundary
    :title="title"
    :fallback="fallback"
    :reset-text="resetText"
    :show-reset="showReset"
    :on-error="handleAuthError"
    :use-toast="useToast"
    :toast-only="toastOnly"
    :snackbar-timeout="snackbarTimeout"
    @error="$emit('error', $event)"
    @reset="$emit('reset')"
  >
    <slot />
  </ErrorBoundary>
</template>

<script setup>
import ErrorBoundary from './ErrorBoundary.vue'
import { useRouter } from 'vue-router'
import { useUserStateStore } from '@remindjs/auth-client-vue/stores/userState.js'

const router = useRouter()
const userStore = useUserStateStore()

const props = defineProps({
  title: {
    type: String,
    default: 'Authentication Error'
  },
  fallback: {
    type: String,
    default: 'Unable to load authentication component. Please refresh the page.'
  },
  resetText: {
    type: String,
    default: 'Reload'
  },
  showReset: {
    type: Boolean,
    default: true
  },
  redirectOnError: {
    type: Boolean,
    default: false
  },
  // For auth components, usually we want toast-only behavior
  // since we don't want to replace the login form with an error
  toastOnly: {
    type: Boolean,
    default: true
  },
  useToast: {
    type: Boolean,
    default: true
  },
  snackbarTimeout: {
    type: Number,
    default: 6000
  }
})

const emit = defineEmits(['error', 'reset'])

const handleAuthError = (err, instance, info) => {
  // Log auth-specific error details
  console.error('Auth component error:', {
    error: err,
    provider: userStore.currentProvider,
    isAuthenticated: userStore.isAuthenticated,
    errorInfo: info
  })

  // Handle specific auth error types
  if (err.message?.includes('network') || err.message?.includes('fetch')) {
    // Network errors - might want to retry
    console.error('Network error in auth component')
  } else if (err.message?.includes('token') || err.message?.includes('session')) {
    // Session/token errors - might need re-auth
    console.error('Session error in auth component')

    if (err.message?.includes('invalid') || err.message?.includes('expired')) {
      userStore.signOut?.()
    }
  }

  // Optionally redirect to login on critical errors
  if (props.redirectOnError && !router.currentRoute.value.path.includes('/login')) {
    setTimeout(() => {
      router.push({
        name: 'login',
        query: { error: 'auth_component_error' }
      })
    }, 3000)
  }
}
</script>

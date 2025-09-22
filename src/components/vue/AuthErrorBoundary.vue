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

function handleAuthError(err, instance, info) {
  if (import.meta.env.DEV) {
    console.error('[AuthErrorBoundary] caught:', err)
  }

  if (props.redirectOnError && router.currentRoute.value.name !== 'login') {
    router.push({ name: 'login', query: { error: 'auth_component_error' } })
  }

  if (err?.message?.includes('invalid') || err?.message?.includes('expired')) {
    userStore.signOut?.()
  }

  emit('error', { error: err, instance, info })
}
</script>

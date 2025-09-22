<template>
  <div class="remind-auth-error-boundary">
    <slot v-if="!hasError" />

    <div v-else class="remind-auth-error-boundary__fallback" role="alert">
      <h3 class="remind-auth-error-boundary__title">{{ title }}</h3>
      <p class="remind-auth-error-boundary__message">{{ errorMessage }}</p>
      <button
        v-if="showReset"
        type="button"
        class="remind-auth-error-boundary__button"
        @click="reset"
      >
        {{ resetText }}
      </button>
    </div>

    <div
      v-if="showToast"
      class="remind-auth-error-boundary__toast"
      role="status"
    >
      <span>{{ toastMessage }}</span>
      <button type="button" class="remind-auth-error-boundary__toast-close" @click="showToast = false">
        Close
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue'

const props = defineProps({
  fallback: {
    type: String,
    default: 'Component failed to load. Please refresh the page.'
  },
  title: {
    type: String,
    default: 'Component Error'
  },
  resetText: {
    type: String,
    default: 'Try Again'
  },
  showReset: {
    type: Boolean,
    default: true
  },
  onError: {
    type: Function
  },
  useToast: {
    type: Boolean,
    default: true
  },
  toastOnly: {
    type: Boolean,
    default: false
  },
  snackbarTimeout: {
    type: Number,
    default: 6000
  }
})

const emit = defineEmits(['error', 'reset'])

const hasError = ref(false)
const errorMessage = ref('')
const showToast = ref(false)
const toastMessage = ref('')
let toastTimer = null

onErrorCaptured((err, instance, info) => {
  const message = err?.message || props.fallback

  if (import.meta.env.DEV) {
    console.error('[AuthErrorBoundary] Caught error:', err)
    console.error('Component:', instance)
    console.error('Details:', info)
  }

  if (props.onError) {
    props.onError(err, instance, info)
  }

  emit('error', { error: err, instance, info })

  const shouldShowToast = props.useToast && !isCritical(err)

  if (!props.toastOnly && !shouldShowToast) {
    hasError.value = true
    errorMessage.value = message
  }

  if (props.useToast) {
    toastMessage.value = shouldShowToast ? message : `Critical: ${message}`
    showToast.value = true
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      showToast.value = false
    }, props.snackbarTimeout)
  }

  return false
})

function isCritical(err) {
  if (!err) return false
  return err.critical === true ||
    /Cannot read|undefined|Failed to fetch|Network Error/i.test(err.message || '')
}

function reset() {
  hasError.value = false
  errorMessage.value = ''
  showToast.value = false
  toastMessage.value = ''
  emit('reset')
}
</script>

<style scoped>
.remind-auth-error-boundary {
  position: relative;
}

.remind-auth-error-boundary__fallback {
  border: 1px solid #f5c2c7;
  background: #f8d7da;
  color: #842029;
  padding: 1rem;
  border-radius: 6px;
}

.remind-auth-error-boundary__title {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 600;
}

.remind-auth-error-boundary__message {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
}

.remind-auth-error-boundary__button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  border: 1px solid #842029;
  background: #842029;
  color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}

.remind-auth-error-boundary__button:hover {
  opacity: 0.9;
}

.remind-auth-error-boundary__toast {
  position: fixed;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 9999;
  background: #1f2933;
  color: #fff;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.remind-auth-error-boundary__toast-close {
  background: transparent;
  border: none;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
</style>

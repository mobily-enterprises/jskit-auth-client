<template>
  <div class="error-boundary-wrapper">
    <slot v-if="!hasError" />

    <div v-else class="error-fallback">
      <v-alert type="error" variant="outlined">
        <v-alert-title>{{ title }}</v-alert-title>
        <div>{{ errorMessage }}</div>
        <v-btn
          v-if="showReset"
          @click="reset"
          class="mt-3"
          size="small"
          variant="tonal"
        >
          {{ resetText }}
        </v-btn>
      </v-alert>
    </div>

    <v-snackbar
      v-model="showSnackbar"
      :color="snackbarColor"
      :timeout="snackbarTimeout"
      location="top"
    >
      {{ snackbarMessage }}
      <template #actions>
        <v-btn variant="text" @click="showSnackbar = false">Close</v-btn>
      </template>
    </v-snackbar>
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
  },
  snackbarColor: {
    type: String,
    default: 'error'
  }
})

const emit = defineEmits(['error', 'reset'])

const hasError = ref(false)
const errorMessage = ref('')
const showSnackbar = ref(false)
const snackbarMessage = ref('')

onErrorCaptured((err, instance, info) => {
  const message = err.message || props.fallback

  if (import.meta.env.DEV) {
    console.error('ErrorBoundary caught:', err)
    console.error('Component:', instance)
    console.error('Error info:', info)
  }

  if (props.onError) {
    props.onError(err, instance, info)
  }

  emit('error', { error: err, instance, info })

  if (props.toastOnly || (props.useToast && !isCriticalError(err))) {
    snackbarMessage.value = message
    showSnackbar.value = true
  } else {
    hasError.value = true
    errorMessage.value = message

    if (props.useToast) {
      snackbarMessage.value = `Critical error: ${message}`
      showSnackbar.value = true
    }
  }

  return false
})

function isCriticalError(err) {
  return err?.critical === true ||
         err?.message?.includes('Cannot read') ||
         err?.message?.includes('undefined') ||
         err?.message?.includes('Failed to fetch')
}

function reset() {
  hasError.value = false
  errorMessage.value = ''
  showSnackbar.value = false
  snackbarMessage.value = ''
  emit('reset')
}
</script>

<style scoped>
.error-boundary-wrapper {
  width: 100%;
}

.error-fallback {
  padding: 16px;
}
</style>

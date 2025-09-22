<template>
  <div class="remind-auth-login">

    <button
      v-if="showAnonymousOption"
      type="button"
      class="remind-auth-login__anonymous"
      @click="continueAnonymously"
    >
      Continue without account
    </button>

    <div
      v-if="showAnonymousOption && availableProviders.length > 0"
      class="remind-auth-login__divider"
      role="separator"
    >
      <span>or</span>
    </div>

    <div
      v-for="(provider, index) in availableProviders"
      :key="provider.name"
      class="remind-auth-login__provider"
    >
      <ErrorBoundary
        :title="`${provider.displayName} Error`"
        :fallback="`Unable to load ${provider.displayName} login. Please try another method.`"
        :toast-only="true"
        :snackbar-timeout="4000"
      >
        <component
          :is="provider.widgetComponent"
          @message="handleMessage"
          @success="handleSuccess"
          @error="handleError"
        />
      </ErrorBoundary>

      <div
        v-if="index < availableProviders.length - 1"
        class="remind-auth-login__divider remind-auth-login__divider--inline"
        role="separator"
      >
        <span>or</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { authConfig } from '@remindjs/auth-client-vue/config/auth.js'
import { useUserStateStore } from '@remindjs/auth-client-vue/stores/userState.js'
import { getAllProviderMetadata } from '@remindjs/auth-client-vue/auth/authProviders.js'
import ErrorBoundary from './ErrorBoundary.vue'

const userStore = useUserStateStore()

// Get ALL registered providers dynamically
const availableProviders = computed(() => {
  return getAllProviderMetadata()
    .filter(p =>
      p.name !== 'local' &&
      p.configured &&
      p.widget &&
      typeof p.widget === 'function' &&
      !p.isAnonymousOnly
    )
    .map(p => ({
      ...p,
      widgetComponent: defineAsyncComponent(p.widget)
    }))
})

const showAnonymousOption = computed(() => authConfig.allowAnonymous)

// Event handlers
const emit = defineEmits(['message', 'success', 'error'])

const handleMessage = (msg) => {
  emit('message', msg)
}

const handleSuccess = (session) => {
  emit('success', session)
}

const handleError = (err) => {
  emit('error', err)
}

const continueAnonymously = async () => {
  try {
    await userStore.startAnonymousSession()
    emit('success')
  } catch (error) {
    emit('message', {
      text: 'Failed to start anonymous session',
      color: 'error'
    })
  }
}
</script>

<style scoped>
.remind-auth-login {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
}

.remind-auth-login__anonymous {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  border: 1px solid #475569;
  background: transparent;
  color: #1f2933;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s; 
}

.remind-auth-login__anonymous:hover {
  background: rgba(71, 85, 105, 0.08);
}

.remind-auth-login__divider {
  position: relative;
  text-align: center;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: #64748b;
  letter-spacing: 0.12em;
}

.remind-auth-login__divider::before,
.remind-auth-login__divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 42%;
  border-top: 1px solid #cbd5f5;
}

.remind-auth-login__divider::before {
  left: 0;
}

.remind-auth-login__divider::after {
  right: 0;
}

.remind-auth-login__divider--inline {
  margin-top: 1.25rem;
}

.remind-auth-login__provider {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.remind-auth-login__divider--inline::before,
.remind-auth-login__divider--inline::after {
  width: 35%;
}
</style>

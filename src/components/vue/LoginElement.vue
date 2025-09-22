<template>
  <div class="login-element">
    <v-btn
      v-if="showAnonymousOption"
      block
      variant="outlined"
      size="large"
      prepend-icon="mdi-incognito"
      @click="continueAnonymously"
    >
      Continue without account
    </v-btn>

    <v-divider v-if="showAnonymousOption && availableProviders.length > 0" class="my-4">
      or
    </v-divider>

    <div v-for="(provider, index) in availableProviders" :key="provider.name">
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
      <v-divider v-if="index < availableProviders.length - 1" class="my-4">
        or
      </v-divider>
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

const emit = defineEmits(['message', 'success', 'error'])

function handleMessage(msg) {
  emit('message', msg)
}

function handleSuccess(session) {
  emit('success', session)
}

function handleError(err) {
  emit('error', err)
}

async function continueAnonymously() {
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
.login-element {
  width: 100%;
}
</style>

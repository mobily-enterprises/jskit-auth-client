<template>
  <section class="remind-auth-account">
    <header class="remind-auth-account__header">
      <h2>Authentication Methods</h2>
      <p>Manage how you sign in to your account.</p>
    </header>

    <ul class="remind-auth-account__list">
      <li
        v-for="provider in providers"
        :key="provider.name"
        class="remind-auth-account__item"
        :class="{ 'remind-auth-account__item--disabled': isProcessing }"
      >
        <div class="remind-auth-account__avatar" :data-status="statusFor(provider.name)">
          {{ initialFor(provider) }}
        </div>

        <div class="remind-auth-account__details">
          <strong>{{ provider.displayName }}</strong>
          <small>{{ statusLabel(provider.name) }}</small>
        </div>

        <div class="remind-auth-account__actions">
          <span v-if="isCurrentProvider(provider.name)" class="remind-auth-account__badge">
            Active
          </span>

          <template v-else-if="isLinked(provider.name)">
            <button
              v-if="linkedCount > 1"
              type="button"
              class="remind-auth-account__button remind-auth-account__button--danger"
              :disabled="isProcessing"
              @click="unlinkProvider(provider.name)"
            >
              Disconnect
            </button>
            <span v-else class="remind-auth-account__badge">Required</span>
          </template>

          <template v-else>
            <button
              v-if="provider.supportsLinking !== false"
              type="button"
              class="remind-auth-account__button"
              :disabled="isProcessing"
              @click="startLink(provider)"
            >
              Connect
            </button>
            <span v-else class="remind-auth-account__badge">Unavailable</span>
          </template>
        </div>
      </li>
    </ul>

    <p v-if="!providers.length" class="remind-auth-account__empty">
      No providers are currently configured.
    </p>

    <div
      v-if="snackbar"
      class="remind-auth-account__toast"
      :data-variant="snackbarVariant"
      role="status"
    >
      <span>{{ snackbarText }}</span>
      <button type="button" @click="snackbar = false">Close</button>
    </div>

    <div
      v-if="linkDialogOpen"
      class="remind-auth-account__overlay"
      role="dialog"
      aria-modal="true"
      @click.self="closeLinkDialog"
    >
      <div class="remind-auth-account__dialog">
        <header class="remind-auth-account__dialog-header">
          <h3>Connect {{ linkingProvider?.displayName }}</h3>
          <button type="button" aria-label="Close" @click="closeLinkDialog">✕</button>
        </header>
        <div class="remind-auth-account__dialog-body">
          <ErrorBoundary
            v-if="linkingComponent"
            :title="`${linkingProvider?.displayName} Error`"
            :fallback="`Unable to link ${linkingProvider?.displayName}. Please try again.`"
            :toast-only="true"
            :snackbar-timeout="4000"
          >
            <component
              :is="linkingComponent"
              mode="link"
              @linked="handleLinkSuccess"
              @message="showMessage"
              @error="handleLinkError"
            />
          </ErrorBoundary>
        </div>
        <footer class="remind-auth-account__dialog-footer">
          <button type="button" @click="closeLinkDialog">Cancel</button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import axios from 'axios'
import { useUserStateStore } from '@remindjs/auth-client-vue/stores/userState.js'
import { getAllProviderMetadata } from '@remindjs/auth-client-vue/auth/authProviders.js'
import { createLinkingSessionSnapshot, restoreLinkingSessionSnapshot } from '@remindjs/auth-client-vue/linking/sessionSnapshot.js'
import ErrorBoundary from './ErrorBoundary.vue'

const userStore = useUserStateStore()

const providers = ref([])
const profile = computed(() => userStore.profile || {})
const linkedProviders = computed(() => userStore.linkedProviders || {})
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarVariant = ref('info')
const isProcessing = ref(false)
const linkDialogOpen = ref(false)
const linkingProvider = ref(null)
const linkSnapshot = ref(null)

const linkingComponent = computed(() => {
  if (!linkingProvider.value?.widget) return null
  return defineAsyncComponent(linkingProvider.value.widget)
})

const linkedCount = computed(() => providers.value.filter(p => isLinked(p.name)).length)
const currentProvider = computed(() => userStore.currentProvider)

function initialFor(provider) {
  return (provider.displayName?.charAt(0) || provider.name.charAt(0)).toUpperCase()
}

function isLinked(providerName) {
  return !!linkedProviders.value?.[providerName]
}

function isCurrentProvider(providerName) {
  return currentProvider.value === providerName
}

function statusFor(providerName) {
  if (isCurrentProvider(providerName)) return 'active'
  if (isLinked(providerName)) return 'linked'
  return 'default'
}

function statusLabel(providerName) {
  if (isCurrentProvider(providerName)) return 'Currently logged in'
  if (isLinked(providerName)) return 'Connected'
  return 'Not connected'
}

function startLink(provider) {
  linkSnapshot.value = createLinkingSessionSnapshot(userStore)
  linkingProvider.value = provider
  linkDialogOpen.value = true
}

function closeLinkDialog() {
  linkDialogOpen.value = false
  linkingProvider.value = null
  linkSnapshot.value = null
}

async function handleLinkSuccess() {
  const providerName = linkingProvider.value?.displayName || 'Provider'
  let restored = false
  if (linkSnapshot.value) {
    restored = await restoreLinkingSessionSnapshot(
      userStore,
      linkSnapshot.value,
      linkingProvider.value?.name
    )
  }
  if (!restored) {
    await fetchProfile()
  }
  showMessage(`${providerName} connected successfully`, 'success')
  closeLinkDialog()
}

function handleLinkError(error) {
  const message = error?.message || error?.data?.message || 'Failed to link provider'
  showMessage(message, 'error')
}

async function unlinkProvider(providerName) {
  if (linkedCount.value <= 1) {
    showMessage('Cannot remove your last authentication method', 'warning')
    return
  }

  if (isCurrentProvider(providerName)) {
    showMessage('Cannot disconnect your currently active authentication method', 'warning')
    return
  }

  isProcessing.value = true

  try {
    const providerIdField = `${providerName}_id`
    const patchData = {
      data: {
        type: 'users',
        id: profile.value.id,
        attributes: {
          [providerIdField]: null
        }
      }
    }

    await axios.patch(`/api/users/${profile.value.id}`, patchData)

    await fetchProfile()
    showMessage(`${providerName} disconnected successfully`, 'success')
  } catch (error) {
    const message = error.response?.data?.error ||
                    error.response?.data?.message ||
                    'Failed to disconnect authentication method'
    showMessage(message, 'error')
  } finally {
    isProcessing.value = false
  }
}

function showMessage(text, variant = 'info') {
  snackbarText.value = text
  snackbarVariant.value = variant
  snackbar.value = true
  if (typeof window !== 'undefined') {
    window.clearTimeout(showMessage._timer)
    showMessage._timer = window.setTimeout(() => {
      snackbar.value = false
    }, 5000)
  }
}

async function fetchProfile() {
  try {
    if (!userStore.isAuthenticated) {
      profile.value = {}
      return
    }

    const success = await userStore.fetchProfile()
    if (!success) {
      showMessage('Failed to load profile information', 'error')
      return
    }

  } catch (error) {
    showMessage('Failed to load profile information', 'error')
  }
}

onMounted(async () => {
  providers.value = getAllProviderMetadata().filter(p => {
    if (p.name === 'local') return false
    if (!p.widget) return false
    if (p.isAnonymousOnly) return false
    return true
  })

  await fetchProfile()
})
</script>

<style scoped>
.remind-auth-account {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.remind-auth-account__header h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.remind-auth-account__header p {
  margin: 0.25rem 0 0;
  color: #475569;
  font-size: 0.9rem;
}

.remind-auth-account__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.remind-auth-account__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.remind-auth-account__item--disabled {
  opacity: 0.6;
}

.remind-auth-account__avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  text-transform: uppercase;
  background: #e2e8f0;
  color: #1f2933;
}

.remind-auth-account__avatar[data-status="active"] {
  background: #dcfce7;
  color: #166534;
}

.remind-auth-account__avatar[data-status="linked"] {
  background: #dbeafe;
  color: #1d4ed8;
}

.remind-auth-account__details strong {
  display: block;
  font-size: 0.95rem;
}

.remind-auth-account__details small {
  color: #64748b;
  font-size: 0.8rem;
}

.remind-auth-account__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.remind-auth-account__button {
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
  font-size: 0.8rem;
  cursor: pointer;
}

.remind-auth-account__button:hover {
  opacity: 0.9;
}

.remind-auth-account__button--danger {
  border-color: #dc2626;
  background: #dc2626;
}

.remind-auth-account__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-size: 0.75rem;
}

.remind-auth-account__toast {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: #1f2933;
  color: #fff;
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  display: flex;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.remind-auth-account__toast[data-variant="success"] {
  background: #15803d;
}

.remind-auth-account__toast[data-variant="warning"] {
  background: #b45309;
}

.remind-auth-account__toast[data-variant="error"] {
  background: #b91c1c;
}

.remind-auth-account__toast button {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.remind-auth-account__overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 1000;
}

.remind-auth-account__dialog {
  background: #fff;
  border-radius: 8px;
  width: min(420px, 100%);
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.remind-auth-account__dialog-header,
.remind-auth-account__dialog-footer {
  padding: 1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.remind-auth-account__dialog-body {
  padding: 0 1.25rem 1.25rem;
  overflow-y: auto;
  max-height: 60vh;
}

.remind-auth-account__dialog-header h3 {
  margin: 0;
  font-size: 1.05rem;
}

.remind-auth-account__dialog-header button,
.remind-auth-account__dialog-footer button {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.9rem;
  color: #2563eb;
}

.remind-auth-account__empty {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}
</style>

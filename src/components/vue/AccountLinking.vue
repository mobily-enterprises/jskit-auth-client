<template>
  <v-card>
    <v-card-title>
      <v-icon start>mdi-shield-account</v-icon>
      Authentication Methods
    </v-card-title>

    <v-card-subtitle>
      Manage how you sign in to your account
    </v-card-subtitle>

    <v-card-text>
      <v-list>
        <v-list-item
          v-for="provider in providers"
          :key="provider.name"
          :disabled="isProcessing"
        >
          <template #prepend>
            <v-avatar :color="isLinked(provider.name) ? 'success' : 'grey'" size="40">
              <v-icon :icon="provider.icon" />
            </v-avatar>
          </template>

          <v-list-item-title>{{ provider.displayName }}</v-list-item-title>
          <v-list-item-subtitle>
            <span v-if="isCurrentProvider(provider.name)">(Currently logged in)</span>
            <span v-else-if="isLinked(provider.name)">Connected</span>
            <span v-else>Not connected</span>
          </v-list-item-subtitle>

          <template #append>
            <div v-if="isCurrentProvider(provider.name)" class="d-flex align-center ga-2">
              <v-chip color="primary" size="small" variant="tonal">
                <v-icon start size="small">mdi-account-check</v-icon>
                Active
              </v-chip>
              <v-tooltip location="top">
                <template #activator="{ props }">
                  <v-icon v-bind="props" size="small" color="grey">
                    mdi-lock
                  </v-icon>
                </template>
                Currently logged in with this provider
              </v-tooltip>
            </div>
            <div v-else-if="isLinked(provider.name)" class="d-flex align-center ga-2">
              <v-chip color="success" size="small" variant="tonal">
                <v-icon start size="small">mdi-check-circle</v-icon>
                Connected
              </v-chip>
              <v-btn
                v-if="linkedCount > 1"
                icon="mdi-close"
                size="small"
                variant="text"
                color="error"
                @click="unlinkProvider(provider.name)"
                :loading="isProcessing"
              />
              <v-tooltip v-else-if="linkedCount === 1" location="top">
                <template #activator="{ props }">
                  <v-icon v-bind="props" size="small" color="grey">
                    mdi-lock
                  </v-icon>
                </template>
                Cannot remove last authentication method
              </v-tooltip>
            </div>
            <div v-else class="d-flex align-center ga-2">
              <v-btn
                v-if="provider.supportsLinking !== false"
                size="small"
                variant="outlined"
                color="primary"
                prepend-icon="mdi-link-variant"
                @click="startLink(provider)"
              >
                Connect
              </v-btn>
              <v-chip v-else color="grey" size="small" variant="tonal">
                Not connected
              </v-chip>
            </div>
          </template>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>

  <v-dialog v-model="linkDialogOpen" max-width="420">
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>Connect {{ linkingProvider?.displayName }}</span>
        <v-btn icon="mdi-close" variant="text" @click="closeLinkDialog" />
      </v-card-title>
      <v-card-text>
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
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="closeLinkDialog">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="5000">
    {{ snackbarText }}
    <template #actions>
      <v-btn variant="text" @click="snackbar = false">Close</v-btn>
    </template>
  </v-snackbar>
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
const snackbarColor = ref('info')
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

function isLinked(providerName) {
  return !!linkedProviders.value?.[providerName]
}

function isCurrentProvider(providerName) {
  return currentProvider.value === providerName
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

function showMessage(text, color = 'info') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
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

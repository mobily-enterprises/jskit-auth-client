<template>
  <v-menu v-if="userStore.isAuthenticated" offset-y>
    <template #activator="{ props }">
      <v-btn v-bind="props" icon>
        <v-avatar size="32" :color="!avatarUrl ? 'primary' : undefined">
          <v-img v-if="avatarUrl" :src="avatarUrl" :alt="userName" />
          <v-icon v-else-if="!showInitials">mdi-account-circle</v-icon>
          <span v-else class="text-white">{{ userInitials }}</span>
        </v-avatar>
      </v-btn>
    </template>

    <v-list>
      <v-list-item>
        <v-list-item-title>{{ userName }}</v-list-item-title>
        <v-list-item-subtitle>{{ userEmail }}</v-list-item-subtitle>
        <template #append>
          <v-chip size="x-small" :color="providerChipColor">
            <v-icon start size="x-small">{{ providerIcon }}</v-icon>
            {{ providerLabel }}
          </v-chip>
        </template>
      </v-list-item>

      <v-divider />

      <v-list-item v-if="userStore.isAnonymous" :to="{ name: 'login', query: { upgrade: 'true' } }">
        <template #prepend>
          <v-icon>mdi-account-arrow-up</v-icon>
        </template>
        <v-list-item-title>Create Account</v-list-item-title>
      </v-list-item>

      <v-list-item @click="handleSignOut">
        <template #prepend>
          <v-icon>mdi-logout</v-icon>
        </template>
        <v-list-item-title>{{ signOutLabel }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStateStore } from '../../stores/userState.js'

const router = useRouter()
const userStore = useUserStateStore()

const providerConfigs = {
  google: { icon: 'mdi-google', color: 'blue', label: 'Google' },
  supabase: { icon: 'mdi-email', color: 'green', label: 'Email' },
  anonymous: { icon: 'mdi-incognito', color: 'grey', label: 'Guest' }
}

const userName = computed(() => {
  if (userStore.isAnonymous) return 'Guest User'
  return userStore.profile?.name || userStore.user?.name || 'User'
})

const userEmail = computed(() => {
  if (userStore.isAnonymous) return 'Anonymous session'
  return userStore.profile?.email || userStore.user?.email || ''
})

const avatarUrl = computed(() => {
  return userStore.profile?.avatar_url ||
         userStore.profile?.google_picture ||
         userStore.user?.picture ||
         userStore.user?.user_metadata?.avatar_url ||
         null
})

const showInitials = computed(() => userStore.currentProvider !== 'google' && !avatarUrl.value)

const userInitials = computed(() => {
  if (userStore.isAnonymous) return 'G'
  const name = userName.value
  if (!name || name === 'User') return 'U'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
})

const providerConfig = computed(() => {
  if (userStore.isAnonymous) return providerConfigs.anonymous
  return providerConfigs[userStore.currentProvider] || { icon: 'mdi-account', color: 'primary', label: 'User' }
})

const providerIcon = computed(() => providerConfig.value.icon)
const providerChipColor = computed(() => providerConfig.value.color)
const providerLabel = computed(() => providerConfig.value.label)

const signOutLabel = computed(() => userStore.isAnonymous ? 'End Session' : 'Sign Out')

async function handleSignOut() {
  await userStore.signOut()
  router.push('/login')
}
</script>

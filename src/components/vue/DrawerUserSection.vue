<template>
  <div>
    <SignInPrompt v-if="!userStore.isAuthenticated" />
    <UserMenu v-else />
  </div>
</template>

<script setup>
import { useUserStateStore } from 'jskit-auth-client/stores/userState.js'
import UserMenu from './UserMenu.vue'
import SignInPrompt from './SignInPrompt.vue'

const userStore = useUserStateStore()
</script>

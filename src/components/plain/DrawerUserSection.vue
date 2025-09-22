<template>
  <div class="remind-auth-drawer">
    <SignInPrompt v-if="!userStore.isAuthenticated" />
    <UserMenu v-else />
  </div>
</template>

<script setup>
import { useUserStateStore } from '@remindjs/auth-client-vue/stores/userState.js'
import UserMenu from './UserMenu.vue'
import SignInPrompt from './SignInPrompt.vue'

const userStore = useUserStateStore()
</script>

<style scoped>
.remind-auth-drawer {
  padding: 0.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>

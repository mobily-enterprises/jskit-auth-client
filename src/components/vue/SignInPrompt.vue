<template>
  <div class="pa-3">
    <v-btn block color="primary" variant="elevated" @click="goToLogin">
      Sign In
    </v-btn>
    <v-divider class="my-2" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function goToLogin() {
  router.push('/login')
}
</script>

<template>
  <div class="remind-auth-signin">
    <button type="button" class="remind-auth-signin__button" @click="goToLogin">
      Sign In
    </button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function goToLogin() {
  router.push('/login')
}
</script>

<style scoped>
.remind-auth-signin {
  padding: 0.5rem 0;
}

.remind-auth-signin__button {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.remind-auth-signin__button:hover {
  opacity: 0.92;
}
</style>

<template>
  <div v-if="userStore.isAuthenticated" class="remind-auth-user-menu" ref="root">
    <button type="button" class="remind-auth-user-menu__trigger" @click="toggleMenu">
      <span class="remind-auth-user-menu__avatar">
        <img v-if="avatarUrl" :src="avatarUrl" :alt="userName" />
        <span v-else>{{ userInitials }}</span>
      </span>
      <span class="remind-auth-user-menu__name">{{ userName }}</span>
    </button>

    <div v-if="menuOpen" class="remind-auth-user-menu__panel" role="menu">
      <div class="remind-auth-user-menu__summary">
        <div>
          <strong>{{ userName }}</strong>
          <small>{{ userEmail }}</small>
        </div>
        <span class="remind-auth-user-menu__provider">{{ providerLabel }}</span>
      </div>

      <button
        v-if="userStore.isAnonymous"
        type="button"
        class="remind-auth-user-menu__link"
        @click="goToUpgrade"
      >
        Upgrade to full account
      </button>

      <button
        type="button"
        class="remind-auth-user-menu__link remind-auth-user-menu__link--danger"
        @click="handleSignOut"
      >
        {{ signOutLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStateStore } from '../../stores/userState.js'

const router = useRouter()
const userStore = useUserStateStore()
const menuOpen = ref(false)
const root = ref(null)

const userName = computed(() => {
  if (userStore.isAnonymous) return 'Guest User'
  return (
    userStore.profile?.name ||
    userStore.profile?.google_name ||
    userStore.user?.name ||
    userStore.user?.user_metadata?.name ||
    'User'
  )
})

const userEmail = computed(() =>
  userStore.isAnonymous ? 'Anonymous session' : (userStore.profile?.email || userStore.user?.email || '')
)

const avatarUrl = computed(() =>
  userStore.profile?.avatar_url ||
  userStore.profile?.google_picture ||
  userStore.user?.picture ||
  userStore.user?.user_metadata?.avatar_url ||
  null
)

const userInitials = computed(() => {
  if (userStore.isAnonymous) return 'G'
  const name = userName.value
  return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'
})

const providerLabel = computed(() => {
  if (userStore.isAnonymous) return 'Guest'
  if (userStore.currentProvider === 'google') return 'Google'
  if (userStore.currentProvider === 'supabase') return 'Email'
  return 'User'
})

const signOutLabel = computed(() => (userStore.isAnonymous ? 'End Session' : 'Sign Out'))

async function handleSignOut() {
  await userStore.signOut()
  router.push('/login')
  menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function goToUpgrade() {
  router.push({ name: 'login', query: { upgrade: 'true' } })
  menuOpen.value = false
}

function handleDocumentClick(event) {
  if (!menuOpen.value) return
  const el = root.value
  if (el && !el.contains(event.target)) {
    menuOpen.value = false
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('click', handleDocumentClick)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', handleDocumentClick)
  }
})
</script>

<style scoped>
.remind-auth-user-menu {
  position: relative;
  display: inline-block;
}

.remind-auth-user-menu__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.remind-auth-user-menu__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #1f2933;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  overflow: hidden;
  font-size: 0.85rem;
}

.remind-auth-user-menu__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remind-auth-user-menu__name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1f2933;
}

.remind-auth-user-menu__panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 220px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  z-index: 1000;
}

.remind-auth-user-menu__summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.remind-auth-user-menu__summary strong {
  display: block;
  margin-bottom: 0.15rem;
}

.remind-auth-user-menu__summary small {
  color: #64748b;
  font-size: 0.75rem;
}

.remind-auth-user-menu__provider {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
}

.remind-auth-user-menu__link {
  border: none;
  background: #f1f5f9;
  color: #1f2933;
  border-radius: 6px;
  padding: 0.45rem 0.75rem;
  text-align: left;
  cursor: pointer;
  font-size: 0.85rem;
}

.remind-auth-user-menu__link:hover {
  background: #e2e8f0;
}

.remind-auth-user-menu__link--danger {
  background: #fee2e2;
  color: #b91c1c;
}

.remind-auth-user-menu__link--danger:hover {
  background: #fecaca;
}
</style>

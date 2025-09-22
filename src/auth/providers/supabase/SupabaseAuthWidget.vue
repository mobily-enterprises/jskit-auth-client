<template>
  <!-- Supabase Auth UI Component - Email/Password and configured OAuth providers -->
  <Auth
    :supabaseClient="supabase"
    :appearance="authAppearance"
    :providers="oauthProviders"
    :redirectTo="redirectUrl"
    :showLinks="authConfig.showPasswordReset"
    :view="view"
    :onlyThirdPartyProviders="oauthOnly"
    :magicLink="magicLinkEnabled"
  />
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStateStore } from '../../../stores/userState.js'
import { Auth } from '@supa-kit/auth-ui-vue'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from './client'
import { authConfig } from '../../../config/auth.js'
import supabaseAuthProvider from './provider.js'

const router = useRouter()
const route = useRoute()
const userStore = useUserStateStore()

// Parse OAuth providers from environment variable
const oauthProviders = computed(() => {
  const providersEnv = import.meta.env.VITE_SUPABASE_OAUTH_PROVIDERS || ''

  if (!providersEnv) {
    return [] // No OAuth providers, only email/password
  }

  // Split by comma, trim whitespace, and filter empty strings
  return providersEnv
    .split(',')
    .map(p => p.trim())
    .filter(p => p)
})

// Check if we should only show OAuth providers (hide email/password)
const oauthOnly = computed(() => {
  return import.meta.env.VITE_SUPABASE_OAUTH_ONLY === 'true' ||
         import.meta.env.VITE_SUPABASE_OAUTH_ONLY === true
})

// Check if magic link authentication should be enabled
const magicLinkEnabled = computed(() => {
  return import.meta.env.VITE_SUPABASE_MAGIC_LINK === 'true' ||
         import.meta.env.VITE_SUPABASE_MAGIC_LINK === true
})

// Props
const props = defineProps({
  view: {
    type: String,
    default: 'sign_in'
  },
  mode: {
    type: String,
    default: 'login'
  }
})

// Emits
const emit = defineEmits(['message', 'success', 'error', 'linked'])

// Computed
const redirectUrl = `${window.location.origin}/auth/callback`

// Theme configuration for Supabase Auth UI
const authAppearance = {
  theme: ThemeSupa,
  style: {
    button: { borderRadius: '8px' },
    input: { borderRadius: '8px' },
    container: { gap: '16px' }
  },
  variables: {
    default: {
      colors: {
        brand: '#1976d2',
        brandAccent: '#1565c0',
        brandButtonText: 'white'
      }
    }
  }
}

// Listen for auth state changes
onMounted(() => {
  // Check for existing session
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session && !userStore.isAnonymous) {
      handleSuccessfulAuth(session)
    }
  })

  // Listen for auth changes
  const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await handleSuccessfulAuth(session)
    } else if (event === 'SIGNED_OUT' && props.mode !== 'link') {
      emit('message', { text: 'Signed out successfully', color: 'success' })
    }
  })

  // Cleanup
  return () => {
    authListener?.subscription.unsubscribe()
  }
})

async function handleSuccessfulAuth(session) {
  if (!session) return

  try {
    if (props.mode === 'link') {
      const accessToken = session?.access_token
      if (!accessToken) {
        emit('error', { message: 'Unable to link Supabase account: missing access token' })
        return
      }

      try {
        await supabaseAuthProvider.linkAccount(accessToken)
        emit('linked', { provider: 'supabase' })
      } catch (error) {
        emit('error', { message: error.message || 'Failed to link Supabase account' })
      } finally {
        try {
          await supabase.auth.signOut()
        } catch (signOutError) {
          console.warn('[SupabaseAuthWidget] Failed to clear temporary session:', signOutError)
        }
      }
      return
    }

    await userStore.setSession(session, 'supabase')
    await userStore.fetchProfile()

    emit('success', session)

    router.push(route.query.redirect || '/')
  } catch (error) {
    emit('error', error)
    emit('message', {
      text: error.response?.data?.message || 'Failed to process authentication',
      color: 'error'
    })
  }
}
</script>

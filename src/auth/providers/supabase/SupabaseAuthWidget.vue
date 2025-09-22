<template>
  <Auth
    :supabaseClient="supabaseClient"
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
import { onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStateStore } from '../../../stores/userState.js'
import { Auth } from '@supa-kit/auth-ui-vue'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { getSupabaseClient } from './client.js'
import { authConfig } from '../../../config/auth.js'
import { getAuthClientConfig } from '../../../runtimeConfig.js'
import supabaseAuthProvider from './provider.js'

const router = useRouter()
const route = useRoute()
const userStore = useUserStateStore()

const supabaseClient = computed(() => getSupabaseClient())

const supabaseSettings = computed(() => getAuthClientConfig().supabase || {})

const oauthProviders = computed(() => supabaseSettings.value.oauthProviders || [])
const oauthOnly = computed(() => !!supabaseSettings.value.oauthOnly)
const magicLinkEnabled = computed(() => !!supabaseSettings.value.magicLink)

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

const emit = defineEmits(['message', 'success', 'error', 'linked'])

const redirectUrl = computed(() => {
  return supabaseSettings.value.redirectUrl || `${window.location.origin}/auth/callback`
})

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

onMounted(() => {
  supabaseClient.value.auth.getSession().then(({ data: { session } }) => {
    if (session && !userStore.isAnonymous) {
      handleSuccessfulAuth(session)
    }
  })

  const { data: authListener } = supabaseClient.value.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await handleSuccessfulAuth(session)
    } else if (event === 'SIGNED_OUT' && props.mode !== 'link') {
      emit('message', { text: 'Signed out successfully', color: 'success' })
    }
  })

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
        await supabaseClient.value.auth.signOut()
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

<style scoped>
</style>

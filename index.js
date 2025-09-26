import {
  configureAuthClient as configure,
  getAuthClientConfig as getConfig,
  resetAuthClientConfig as resetConfig
} from './src/runtimeConfig.js'
import {
  authConfig,
  authConfig as defaultAuthConfig,
  getTimeout,
  getErrorMessage,
  checkRateLimit,
  circuitBreakers
} from './src/config/auth.js'
import { useUserStateStore } from './src/stores/userState.js'
import { setupAuthInterceptor, setAuthRouter } from './src/auth/interceptor.js'
import {
  registerAuthProvider,
  getAuthProvider,
  hasAuthProvider,
  getAllProviderNames,
  callAuthProviderMethod,
  getAllProviderMetadata
} from './src/auth/authProviders.js'
import googleAuthProvider from './src/auth/providers/google/provider.js'
import supabaseAuthProvider from './src/auth/providers/supabase/provider.js'
import localAuthProvider from './src/auth/providers/local/provider.js'
import {
  createLinkingSessionSnapshot,
  restoreLinkingSessionSnapshot
} from './src/linking/sessionSnapshot.js'

import PlainLoginElement from './src/components/plain/LoginElement.vue'
import PlainAccountLinking from './src/components/plain/AccountLinking.vue'
import PlainAuthErrorBoundary from './src/components/plain/AuthErrorBoundary.vue'
import PlainDrawerUserSection from './src/components/plain/DrawerUserSection.vue'
import PlainUserMenu from './src/components/plain/UserMenu.vue'
import PlainSignInPrompt from './src/components/plain/SignInPrompt.vue'
import PlainErrorBoundary from './src/components/plain/ErrorBoundary.vue'

import VuetifyLoginElement from './src/components/vue/LoginElement.vue'
import VuetifyAccountLinking from './src/components/vue/AccountLinking.vue'
import VuetifyAuthErrorBoundary from './src/components/vue/AuthErrorBoundary.vue'
import VuetifyDrawerUserSection from './src/components/vue/DrawerUserSection.vue'
import VuetifyUserMenu from './src/components/vue/UserMenu.vue'
import VuetifySignInPrompt from './src/components/vue/SignInPrompt.vue'
import VuetifyErrorBoundary from './src/components/vue/ErrorBoundary.vue'

const components = Object.freeze({
  plain: Object.freeze({
    LoginElement: PlainLoginElement,
    AccountLinking: PlainAccountLinking,
    AuthErrorBoundary: PlainAuthErrorBoundary,
    DrawerUserSection: PlainDrawerUserSection,
    UserMenu: PlainUserMenu,
    SignInPrompt: PlainSignInPrompt,
    ErrorBoundary: PlainErrorBoundary
  }),
  vuetify: Object.freeze({
    LoginElement: VuetifyLoginElement,
    AccountLinking: VuetifyAccountLinking,
    AuthErrorBoundary: VuetifyAuthErrorBoundary,
    DrawerUserSection: VuetifyDrawerUserSection,
    UserMenu: VuetifyUserMenu,
    SignInPrompt: VuetifySignInPrompt,
    ErrorBoundary: VuetifyErrorBoundary
  })
})

const providers = Object.freeze({
  register: registerAuthProvider,
  get: getAuthProvider,
  has: hasAuthProvider,
  list: getAllProviderNames,
  call: callAuthProviderMethod,
  metadata: getAllProviderMetadata,
  google: googleAuthProvider,
  supabase: supabaseAuthProvider,
  local: localAuthProvider
})

const linking = Object.freeze({
  createSnapshot: createLinkingSessionSnapshot,
  restoreSnapshot: restoreLinkingSessionSnapshot
})

const interceptor = Object.freeze({
  setup: setupAuthInterceptor,
  setRouter: setAuthRouter
})

const stores = Object.freeze({
  useUserStateStore
})

const auth = Object.freeze({
  configure,
  getConfig,
  resetConfig,
  runtime: authConfig,
  defaults: defaultAuthConfig,
  getTimeout,
  getErrorMessage,
  checkRateLimit,
  circuitBreakers
})

const AuthClient = Object.freeze({
  configure,
  getConfig,
  resetConfig,
  auth,
  stores,
  interceptor,
  providers,
  linking,
  components
})

export default AuthClient

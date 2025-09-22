# @remindjs/auth-client-vue

Reusable Vue 3 authentication client for RemindJS auth backends.

## Install

```bash
npm install @remindjs/auth-client-vue
```

## Quick start

```js
// main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { setupAuthInterceptor, useUserStateStore } from '@remindjs/auth-client-vue'

const app = createApp(App)
app.use(createPinia())
setupAuthInterceptor(router)

const userStore = useUserStateStore()
await userStore.initialize()

app.use(router)
app.mount('#app')
```

Use the exported helpers anywhere:

```js
import { useUserStateStore, getAllProviderMetadata, authConfig } from '@remindjs/auth-client-vue'
```

- `useUserStateStore()` – Pinia store with session/profile helpers
- `getAllProviderMetadata()` – provider list for login/linking UIs
- `authConfig` – exposes base path, anonymous policy, timeouts, etc.
- `setupAuthInterceptor(router)` – wires axios for auth headers & refresh

Provider widgets are bundled and self-register; render them via metadata (e.g. Google One Tap form).

### Stock UI components

Two flavours are provided:

- **Plain** (no framework, minimal CSS):

  ```js
  import {
    PlainLoginElement,
    PlainAccountLinking,
    PlainAuthErrorBoundary,
    PlainDrawerUserSection
  } from '@remindjs/auth-client-vue'
  ```

- **Vuetify** (ready-made Material design):

  ```js
  import {
    VuetifyLoginElement,
    VuetifyAccountLinking,
    VuetifyAuthErrorBoundary,
    VuetifyDrawerUserSection
  } from '@remindjs/auth-client-vue'

  // Stock* aliases point to Plain* by default
  import { StockLoginElement } from '@remindjs/auth-client-vue'
  ```

  These components assume Vuetify 3 (and its icon plugin) is installed.

`Stock*` aliases in the package default to the plain versions for quick upgrades. You can also import individual files (e.g. `@remindjs/auth-client-vue/components/plain/LoginElement.vue`) to copy/paste and customise.

# jskit-auth-client

Reusable Vue 3 authentication client for RemindJS auth backends.

## Install

```bash
npm install jskit-auth-client
```

Requires Vue 3 with Pinia 2 or 3.

## Quick start

```js
// main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { setupAuthInterceptor, useUserStateStore } from 'jskit-auth-client'

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
import { useUserStateStore, getAllProviderMetadata, authConfig } from 'jskit-auth-client'
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
  } from 'jskit-auth-client'
  ```

- **Vuetify** (ready-made Material design):

  ```js
  import {
    VuetifyLoginElement,
    VuetifyAccountLinking,
    VuetifyAuthErrorBoundary,
    VuetifyDrawerUserSection
  } from 'jskit-auth-client'

  // Stock* aliases point to Plain* by default
  import { StockLoginElement } from 'jskit-auth-client'
  ```

  These components assume Vuetify 3 (and its icon plugin) is installed.

`Stock*` aliases in the package default to the plain versions for quick upgrades. You can also import individual files (e.g. `jskit-auth-client/components/plain/LoginElement.vue`) to copy/paste and customise.

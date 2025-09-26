/**
 * Central registry for authentication providers
 * Providers self-register when their modules are imported
 *
 * Provider Interface:
 * - normalizeSession(rawSession): Normalize provider session to standard format
 *   Returns: {
 *     access_token: string (required) - JWT token for authorization
 *     user: object (required) - User object
 *     isAnonymous: boolean (required) - Whether session is anonymous
 *     provider: string (required) - Provider identifier
 *     raw: object (optional) - Original session for provider-specific needs
 *   }
 * - getStoredSession(): Get stored session from provider storage
 * - signOut(): Sign out and clear session
 * - handleTokenExpiry(userStore, originalRequest): Handle token refresh
 * - startAnonymousSession(): Start anonymous session (optional)
 * - convertAnonymousAccount(email, password, metadata): Convert anonymous to permanent (optional)
 */
const authProviders = {}
const providerConfigurationStatus = Object.create(null)

export function registerAuthProvider(name, provider) {
  authProviders[name] = provider
  if (!(name in providerConfigurationStatus)) {
    providerConfigurationStatus[name] = false
  }
}

export function getAuthProvider(name) {
  return authProviders[name]
}

export function hasAuthProvider(name) {
  return name in authProviders
}

export function getAllProviderNames() {
  return Object.keys(authProviders)
}

export async function callAuthProviderMethod(providerName, methodName, ...args) {
  const provider = authProviders[providerName]
  const method = provider?.[methodName]
  if (typeof method === 'function') {
    return await method(...args)
  }
  return null
}

export function setProviderConfigured(name, configured) {
  providerConfigurationStatus[name] = !!configured
}

export function isProviderConfigured(name) {
  return !!providerConfigurationStatus[name]
}

/**
 * Get metadata for all configured providers
 * Used by UI components to dynamically render provider options
 */
export function getAllProviderMetadata() {
  const metadata = []

  for (const name of getAllProviderNames()) {
    const provider = getAuthProvider(name)
    if (provider?.getMetadata) {
      const meta = provider.getMetadata()
      const configured = isProviderConfigured(name)
      if (meta) {
        meta.configured = configured
      }
      if (configured && meta) {
        metadata.push(meta)
      }
    }
  }

  return metadata
}

export default authProviders

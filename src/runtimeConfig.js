import { applyAuthConfig, resetAuthConfig } from './config/auth.js'
import { configureSupabase } from './auth/providers/supabase/client.js'

const DEFAULT_AUTH_CLIENT_CONFIG = Object.freeze({
  providers: ['local'],
  defaultProvider: 'local',
  anonymousProvider: 'local',
  allowAnonymous: false,
  autoStartAnonymous: false,
  supabase: null,
  google: null,
})

let currentConfig = clone(DEFAULT_AUTH_CLIENT_CONFIG)

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    Object.values(value).forEach(freezeDeep)
  }
  return value
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on'])
const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off'])

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue
  if (typeof value === 'boolean') return value
  const str = String(value).trim().toLowerCase()
  if (TRUE_VALUES.has(str)) return true
  if (FALSE_VALUES.has(str)) return false
  return defaultValue
}

function normalizeString(value) {
  if (value === undefined || value === null) return undefined
  const str = String(value).trim()
  if (!str.length) return undefined
  if (str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null') return undefined
  return str
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item))
      .filter(Boolean)
  }
  const str = normalizeString(value)
  if (!str) return []
  return str
    .split(',')
    .map((item) => normalizeString(item))
    .filter(Boolean)
}

function normalizeProviders(value, defaults, supabaseConfigured, googleConfigured) {
  if (value !== undefined) {
    const source = Array.isArray(value) ? value : normalizeList(value)
    const normalized = (Array.isArray(source) ? source : normalizeList(source))
      .map((item) => normalizeString(item))
      .filter(Boolean)
    return normalized.length ? Array.from(new Set(normalized)) : [...defaults]
  }

  const computed = new Set(defaults)
  if (supabaseConfigured) computed.add('supabase')
  if (googleConfigured) computed.add('google')
  if (!computed.size) {
    computed.add('local')
  }
  return Array.from(computed)
}

function normalizeProviderName(value, fallback, providers) {
  const candidate = normalizeString(value)
  if (candidate && providers.includes(candidate)) {
    return candidate
  }
  const fallbackCandidate = normalizeString(fallback)
  if (fallbackCandidate && providers.includes(fallbackCandidate)) {
    return fallbackCandidate
  }
  return providers[0]
}

function normalizeSupabaseConfig(raw = {}) {
  if (!raw) return null

  const url = normalizeString(raw.url)
  const anonKey = normalizeString(raw.anonKey)

  if (!url || !anonKey) {
    return null
  }

  return {
    url,
    anonKey,
    oauthProviders: normalizeList(raw.oauthProviders),
    oauthOnly: normalizeBoolean(raw.oauthOnly, false),
    magicLink: normalizeBoolean(raw.magicLink, true),
    redirectUrl: normalizeString(raw.redirectUrl)
  }
}

function normalizeGoogleConfig(raw = {}) {
  if (!raw) return null

  const clientId = normalizeString(raw.clientId)
  if (!clientId) {
    return null
  }
  return { clientId }
}

function normalizeAuthClientConfig(partial = {}) {
  const normalized = clone(DEFAULT_AUTH_CLIENT_CONFIG)

  const normalizedSupabase = normalizeSupabaseConfig(partial.supabase)
  const normalizedGoogle = normalizeGoogleConfig(partial.google)

  normalized.supabase = normalizedSupabase
  normalized.google = normalizedGoogle

  normalized.providers = normalizeProviders(
    partial.providers,
    DEFAULT_AUTH_CLIENT_CONFIG.providers,
    !!normalizedSupabase,
    !!normalizedGoogle
  )

  normalized.defaultProvider = normalizeProviderName(
    partial.defaultProvider,
    DEFAULT_AUTH_CLIENT_CONFIG.defaultProvider,
    normalized.providers
  )

  normalized.anonymousProvider = normalizeProviderName(
    partial.anonymousProvider,
    DEFAULT_AUTH_CLIENT_CONFIG.anonymousProvider,
    normalized.providers
  )

  normalized.allowAnonymous = normalizeBoolean(partial.allowAnonymous, DEFAULT_AUTH_CLIENT_CONFIG.allowAnonymous)
  normalized.autoStartAnonymous = normalizeBoolean(partial.autoStartAnonymous, DEFAULT_AUTH_CLIENT_CONFIG.autoStartAnonymous)

  const skippedKeys = new Set([
    'providers',
    'defaultProvider',
    'anonymousProvider',
    'allowAnonymous',
    'autoStartAnonymous',
    'supabase',
    'google'
  ])

  for (const [key, value] of Object.entries(partial)) {
    if (skippedKeys.has(key) || value === undefined) continue
    if (Array.isArray(value)) {
      normalized[key] = value.map((item) => clone(item))
    } else if (value && typeof value === 'object') {
      normalized[key] = clone(value)
    } else {
      normalized[key] = value
    }
  }

  return normalized
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new TypeError('configureAuthClient: configuration object is required')
  }

  const providers = config.providers ?? []
  const supabase = config.supabase
  const google = config.google

  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error('configureAuthClient: providers must be a non-empty array')
  }

  if (!providers.includes(config.defaultProvider)) {
    throw new Error('configureAuthClient: defaultProvider must be included in providers array')
  }

  if (providers.includes('supabase')) {
    if (!supabase?.url || !supabase?.anonKey) {
      throw new Error('configureAuthClient: supabase.url and supabase.anonKey are required when enabling the supabase provider')
    }
  }

  if (providers.includes('google')) {
    if (!google?.clientId) {
      throw new Error('configureAuthClient: google.clientId is required when enabling the google provider')
    }
  }
}

export function configureAuthClient(partialConfig = {}) {
  const normalized = normalizeAuthClientConfig(partialConfig)
  validateConfig(normalized)

  currentConfig = freezeDeep(normalized)

  resetAuthConfig()
  applyAuthConfig(currentConfig)

  configureSupabase(currentConfig.supabase || null)

  return currentConfig
}

export function getAuthClientConfig() {
  return currentConfig
}

export function resetAuthClientConfig() {
  currentConfig = freezeDeep(clone(DEFAULT_AUTH_CLIENT_CONFIG))
  resetAuthConfig()
  applyAuthConfig(currentConfig)
  configureSupabase(currentConfig.supabase || null)
}

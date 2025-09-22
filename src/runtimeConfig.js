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

let currentConfig = cloneConfig(DEFAULT_AUTH_CLIENT_CONFIG)

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value))
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    Object.values(value).forEach(freezeDeep)
  }
  return value
}

function mergeConfig(target, source) {
  if (!source || typeof source !== 'object') {
    return target
  }

  const result = Array.isArray(target) ? [...target] : { ...target }

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue

    if (Array.isArray(value)) {
      result[key] = [...value]
    } else if (value && typeof value === 'object') {
      const base = Object.prototype.hasOwnProperty.call(result, key)
        ? result[key]
        : {}
      result[key] = mergeConfig(base && typeof base === 'object' ? base : {}, value)
    } else {
      result[key] = value
    }
  }

  return result
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
  const merged = mergeConfig(cloneConfig(DEFAULT_AUTH_CLIENT_CONFIG), partialConfig)
  validateConfig(merged)

  currentConfig = freezeDeep(merged)

  resetAuthConfig()
  applyAuthConfig({
    providers: currentConfig.providers,
    defaultProvider: currentConfig.defaultProvider,
    anonymousProvider: currentConfig.anonymousProvider,
    allowAnonymous: currentConfig.allowAnonymous,
    autoStartAnonymous: currentConfig.autoStartAnonymous,
    supabase: currentConfig.supabase,
    google: currentConfig.google,
  })

  configureSupabase(currentConfig.supabase || null)

  return currentConfig
}

export function getAuthClientConfig() {
  return currentConfig
}

export function resetAuthClientConfig() {
  currentConfig = freezeDeep(cloneConfig(DEFAULT_AUTH_CLIENT_CONFIG))
  resetAuthConfig()
  applyAuthConfig({
    providers: currentConfig.providers,
    defaultProvider: currentConfig.defaultProvider,
    anonymousProvider: currentConfig.anonymousProvider,
    allowAnonymous: currentConfig.allowAnonymous,
    autoStartAnonymous: currentConfig.autoStartAnonymous,
    supabase: currentConfig.supabase,
    google: currentConfig.google,
  })
  configureSupabase(currentConfig.supabase || null)
}

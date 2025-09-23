const memoryStore = new Map()

function normalizeValue(value) {
  if (value === undefined || value === null) return null
  return String(value)
}

function createAdapter(getStorage) {
  return {
    getItem(key) {
      try {
        const storage = getStorage()
        return storage ? storage.getItem(key) : null
      } catch (error) {
        console.warn('[SupabaseStorage] getItem failed:', error)
        return null
      }
    },

    setItem(key, value) {
      try {
        const storage = getStorage()
        if (!storage) return
        storage.setItem(key, normalizeValue(value))
      } catch (error) {
        console.warn('[SupabaseStorage] setItem failed:', error)
      }
    },

    removeItem(key) {
      try {
        const storage = getStorage()
        if (!storage) return
        storage.removeItem(key)
      } catch (error) {
        console.warn('[SupabaseStorage] removeItem failed:', error)
      }
    }
  }
}

const memoryStorageAdapter = {
  getItem(key) {
    return memoryStore.has(key) ? memoryStore.get(key) : null
  },
  setItem(key, value) {
    if (value === undefined || value === null) {
      memoryStore.delete(key)
      return
    }
    memoryStore.set(key, String(value))
  },
  removeItem(key) {
    memoryStore.delete(key)
  }
}

let sessionStorageAdapter = null

function getSessionStorageAdapter() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null
  }

  if (sessionStorageAdapter) {
    return sessionStorageAdapter
  }

  try {
    const testKey = '__supabase_storage_test__'
    window.sessionStorage.setItem(testKey, '1')
    window.sessionStorage.removeItem(testKey)
    sessionStorageAdapter = createAdapter(() => window.sessionStorage)
    return sessionStorageAdapter
  } catch (error) {
    console.warn('[SupabaseStorage] sessionStorage unavailable:', error)
    sessionStorageAdapter = null
    return null
  }
}

export function resolveSupabaseStorage(preference = 'memory') {
  const originalPreference = preference
  const normalized = typeof preference === 'string'
    ? preference.trim().toLowerCase()
    : 'memory'

  switch (normalized) {
    case 'session':
    case 'sessionstorage': {
      const adapter = getSessionStorageAdapter()
      if (adapter) return adapter
      return memoryStorageAdapter
    }
    case 'memory':
    case 'in-memory':
    case 'inmemory':
      return memoryStorageAdapter
    case 'local':
    case 'localstorage':
      console.warn('[SupabaseStorage] localStorage is not permitted; falling back to sessionStorage')
      return resolveSupabaseStorage('sessionStorage')
    default:
      console.warn('[SupabaseStorage] Unknown storage preference:', originalPreference, '- falling back to memory')
      return memoryStorageAdapter
  }
}

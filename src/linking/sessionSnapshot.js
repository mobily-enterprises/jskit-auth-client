const CLONE_ERROR_MESSAGE = '[Linking] Failed to clone session snapshot:'

function cloneSession(session) {
  if (!session) return null
  try {
    return JSON.parse(JSON.stringify(session))
  } catch (error) {
    console.warn(CLONE_ERROR_MESSAGE, error)
    return null
  }
}

export function createLinkingSessionSnapshot(store) {
  const currentProvider = store.currentProvider || null
  const currentSession = typeof store.normalizedSession === 'undefined'
    ? null
    : store.normalizedSession

  return {
    session: cloneSession(currentSession),
    provider: currentProvider
  }
}

export async function restoreLinkingSessionSnapshot(store, snapshot, linkedProviderName = null) {
  if (!snapshot || !snapshot.session || !snapshot.provider) {
    return false
  }

  if (linkedProviderName && snapshot.provider === linkedProviderName) {
    try {
      await store.fetchProfile()
    } catch (error) {
      console.warn('[Linking] Failed to refresh profile after linking:', error)
    }
    return false
  }

  try {
    await store.setSession(snapshot.session, snapshot.provider)
  } catch (error) {
    console.warn('[Linking] Failed to restore session snapshot:', error)
    return false
  }

  try {
    await store.fetchProfile()
  } catch (error) {
    console.warn('[Linking] Failed to refresh profile after restoring session:', error)
  }

  return true
}

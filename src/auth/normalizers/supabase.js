export function normalizeSupabaseToken(decodedToken) {
  if (!decodedToken) {
    return null
  }

  const metadata = decodedToken.raw_user_meta_data || decodedToken.user_metadata || {}

  return {
    email: decodedToken.email || null,
    email_verified: decodedToken.email_verified || false,
    name: metadata.full_name ||
          metadata.name ||
          metadata.display_name ||
          decodedToken.name ||
          (decodedToken.email ? decodedToken.email.split('@')[0] : 'User'),
    avatar_url: metadata.avatar_url ||
                metadata.picture ||
                metadata.profile_picture ||
                decodedToken.picture ||
                null,
    phone: decodedToken.phone || null,
    is_anonymous: decodedToken.is_anonymous || false,
    role: decodedToken.role || 'authenticated',
    raw_metadata: metadata
  }
}

export function normalizeSupabaseSession(session) {
  if (!session) {
    return null
  }

  let decodedToken = null
  try {
    const base64Payload = session.access_token.split('.')[1]
    const payload = atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/'))
    decodedToken = JSON.parse(payload)
  } catch (error) {
    console.error('[Supabase] Failed to decode token:', error)
  }

  let normalizedUser

  if (decodedToken) {
    normalizedUser = normalizeSupabaseToken(decodedToken)
  } else if (session.user) {
    const user = session.user
    const metadata = user.user_metadata || {}

    normalizedUser = {
      email: user.email,
      email_verified: user.email_verified || false,
      name: metadata.full_name || metadata.name || user.email?.split('@')[0] || 'User',
      avatar_url: metadata.avatar_url || metadata.picture || null,
      is_anonymous: user.is_anonymous || false,
      phone: user.phone || null,
      role: user.role || 'authenticated',
      created_at: user.created_at,
      updated_at: user.updated_at
    }
  }

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type || 'Bearer',
    provider: 'supabase',
    provider_id: decodedToken?.sub || session.user?.id,
    user: normalizedUser,
    is_anonymous: normalizedUser?.is_anonymous || false
  }
}

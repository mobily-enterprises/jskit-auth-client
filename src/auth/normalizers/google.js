export function normalizeGoogleToken(decodedToken) {
  if (!decodedToken) {
    return null
  }

  const isGoogleIdToken = decodedToken.iss?.includes('accounts.google.com')

  if (isGoogleIdToken) {
    return {
      provider_id: decodedToken.sub,
      email: decodedToken.email || null,
      email_verified: decodedToken.email_verified || false,
      name: decodedToken.name ||
            (decodedToken.given_name && decodedToken.family_name ?
              `${decodedToken.given_name} ${decodedToken.family_name}` :
              decodedToken.given_name ||
              decodedToken.family_name ||
              decodedToken.email?.split('@')[0] ||
              'User'),
      avatar_url: decodedToken.picture || null,
      given_name: decodedToken.given_name || null,
      family_name: decodedToken.family_name || null,
      provider: 'google',
      is_anonymous: false,
      raw_metadata: {
        given_name: decodedToken.given_name,
        family_name: decodedToken.family_name,
        locale: decodedToken.locale,
        hd: decodedToken.hd
      }
    }
  }

  return {
    provider_id: decodedToken.userId || decodedToken.sub,
    email: decodedToken.email || null,
    email_verified: true,
    name: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
    avatar_url: decodedToken.picture || null,
    provider: decodedToken.provider || 'google',
    is_anonymous: false,
    raw_metadata: {}
  }
}

export function normalizeGoogleSession(session) {
  return session
}

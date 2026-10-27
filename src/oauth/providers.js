/**
 * "Sign in with …" providers. Each is a plain object, so adding your own is just
 * oauth2({ ... }) or oidc({ ... }):
 *
 *   import { github, google } from 'slauthjs/providers'
 *   slauth({ ..., providers: [github({ clientId, clientSecret }), google({ clientId, clientSecret })] })
 *
 * The callback URL to register with each provider is <your site>/auth/oauth/<id>/callback.
 *
 * A provider's `profile(tokens, fetch)` returns { id, email, emailVerified, name, image }.
 * slauth only signs someone in by email when the provider says the email is verified,
 * so nobody can claim your account by making a provider account with your address.
 */

/**
 * Any OAuth 2.0 provider.
 *
 * @param {{
 *   id: string, name: string, clientId: string, clientSecret?: string,
 *   authorization: string, token: string, scope?: string, params?: Record<string, string>,
 *   pkce?: boolean, tokenAuth?: 'post' | 'basic',
 *   profile(tokens: Record<string, any>, fetch: typeof fetch): Promise<{ id: string, email?: string | null, emailVerified?: boolean, name?: string | null, image?: string | null }>,
 *   trustEmail?: boolean, keepTokens?: boolean,
 * }} options
 */
export function oauth2(options) {
  for (const key of ['id', 'clientId', 'authorization', 'token', 'profile']) {
    if (!options?.[key]) throw new Error(`slauth: the ${options?.id ?? 'OAuth'} provider needs \`${key}\`.`)
  }
  if (!/^[a-z0-9-]+$/.test(options.id)) throw new Error(`slauth: provider ids are lower-case letters, digits and dashes, not "${options.id}".`)
  return { type: 'oauth2', name: options.id, pkce: true, tokenAuth: 'post', scope: '', params: {}, ...options }
}

/**
 * Any OpenID Connect provider, found from its issuer's discovery document. The profile
 * comes from the userinfo endpoint, using the access token we just got over TLS.
 *
 * @param {{ id: string, name: string, issuer: string, clientId: string, clientSecret?: string, scope?: string, params?: Record<string, string>, trustEmail?: boolean, keepTokens?: boolean, tokenAuth?: 'post' | 'basic' }} options
 */
export function oidc({ issuer, scope = 'openid email profile', ...options }) {
  if (!issuer) throw new Error(`slauth: the ${options.id ?? 'OIDC'} provider needs \`issuer\`.`)
  let discovered = null
  const discover = (doFetch) =>
    (discovered ??= doFetch(`${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`)
      .then((res) => {
        if (!res.ok) throw new Error(`slauth: couldn't read ${issuer}'s OpenID configuration (${res.status}).`)
        return res.json()
      })
      .catch((error) => {
        discovered = null
        throw error
      }))
  return oauth2({
    // Filled in from discovery when the flow starts (see flow.js).
    authorization: 'discover',
    token: 'discover',
    discover,
    scope,
    async profile(tokens, doFetch) {
      const config = await discover(doFetch)
      const info = await getJson(doFetch, config.userinfo_endpoint, tokens.access_token)
      return { id: String(info.sub), email: info.email ?? null, emailVerified: info.email_verified === true || info.email_verified === 'true', name: info.name ?? null, image: info.picture ?? null }
    },
    ...options,
  })
}

/** GitHub. Make an OAuth app at github.com/settings/developers. */
export function github({ clientId, clientSecret, scope = 'read:user user:email', ...rest }) {
  return oauth2({
    id: 'github',
    name: 'GitHub',
    clientId,
    clientSecret,
    scope,
    authorization: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    async profile(tokens, doFetch) {
      const me = await getJson(doFetch, 'https://api.github.com/user', tokens.access_token)
      // The profile email can be hidden or unverified; /user/emails says which is which.
      const emails = await getJson(doFetch, 'https://api.github.com/user/emails', tokens.access_token).catch(() => [])
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified)
      return { id: String(me.id), email: primary?.email ?? null, emailVerified: Boolean(primary), name: me.name || me.login, image: me.avatar_url ?? null }
    },
    ...rest,
  })
}

/** Google. Make an OAuth client at console.cloud.google.com/apis/credentials. */
export function google({ clientId, clientSecret, scope = 'openid email profile', ...rest }) {
  return oauth2({
    id: 'google',
    name: 'Google',
    clientId,
    clientSecret,
    scope,
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    params: { prompt: 'select_account' },
    async profile(tokens, doFetch) {
      const info = await getJson(doFetch, 'https://openidconnect.googleapis.com/v1/userinfo', tokens.access_token)
      return { id: String(info.sub), email: info.email ?? null, emailVerified: info.email_verified === true, name: info.name ?? null, image: info.picture ?? null }
    },
    ...rest,
  })
}

/** Discord. Make an application at discord.com/developers/applications. */
export function discord({ clientId, clientSecret, scope = 'identify email', ...rest }) {
  return oauth2({
    id: 'discord',
    name: 'Discord',
    clientId,
    clientSecret,
    scope,
    authorization: 'https://discord.com/oauth2/authorize',
    token: 'https://discord.com/api/oauth2/token',
    async profile(tokens, doFetch) {
      const me = await getJson(doFetch, 'https://discord.com/api/users/@me', tokens.access_token)
      const image = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null
      return { id: String(me.id), email: me.email ?? null, emailVerified: me.verified === true, name: me.global_name ?? me.username, image }
    },
    ...rest,
  })
}

/** GitLab (gitlab.com, or your own with `baseUrl`). */
export function gitlab({ clientId, clientSecret, baseUrl = 'https://gitlab.com', ...rest }) {
  return oidc({ id: 'gitlab', name: 'GitLab', issuer: baseUrl, clientId, clientSecret, scope: 'openid email profile', ...rest })
}

/**
 * Microsoft (personal accounts, and work or school accounts with `tenant`). Microsoft
 * doesn't promise a work account's email belongs to the person, so by default only
 * personal accounts' emails count as verified. With a single `tenant` you control,
 * set trustEmail: true.
 */
export function microsoft({ clientId, clientSecret, tenant = 'common', ...rest }) {
  const CONSUMERS = '9188040d-6c67-4c5b-b112-36a304b66dad'
  return oauth2({
    id: 'microsoft',
    name: 'Microsoft',
    clientId,
    clientSecret,
    scope: 'openid email profile User.Read',
    authorization: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    async profile(tokens, doFetch) {
      const info = await getJson(doFetch, 'https://graph.microsoft.com/oidc/userinfo', tokens.access_token)
      const claims = decodeJwtPayload(tokens.id_token)
      return { id: String(info.sub), email: info.email ?? null, emailVerified: claims?.tid === CONSUMERS, name: info.name ?? null, image: null }
    },
    ...rest,
  })
}

async function getJson(doFetch, url, accessToken) {
  const res = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'slauth' } })
  if (!res.ok) throw new Error(`slauth: ${new URL(url).host} said ${res.status} when asked for the profile.`)
  return res.json()
}

/** Reads (doesn't check) a JWT's claims; only for tokens we got straight from the provider. */
function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)))
  } catch {
    return null
  }
}

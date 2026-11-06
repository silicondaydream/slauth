import { base64Url, randomToken, readCookie, serializeCookie, sha256 } from '../util.js'

const STATE_SECONDS = 10 * 60
const COOKIE = 'slauth_oauth'

/**
 * The OAuth 2.0 authorization-code flow with PKCE (RFC 7636) and a `state` that's tied
 * to this browser by a short-lived cookie, so nobody can finish a sign-in someone else
 * started (login CSRF).
 *
 *   oauth:<state>  { provider, verifier, redirect, returnTo, linkUserId }   (lives 10 minutes)
 *
 * @param {{ store: import('../index.js').Store, fetch?: typeof fetch }} options
 */
export function createOAuthFlow({ store, fetch: doFetch = (...args) => fetch(...args) }) {
  async function endpoints(provider) {
    if (!provider.discover) return { authorization: provider.authorization, token: provider.token }
    const config = await provider.discover(doFetch)
    return { authorization: config.authorization_endpoint, token: config.token_endpoint }
  }

  return {
    fetch: doFetch,

    /** Where to send the browser, and the cookie that ties the flow to it. */
    async start(provider, { callbackUrl, redirect, returnTo, linkUserId = null, secure }) {
      const state = randomToken()
      const verifier = randomToken()
      await store.put(`oauth:${state}`, { provider: provider.id, verifier, redirect, returnTo, linkUserId }, { ttl: STATE_SECONDS })
      const url = new URL((await endpoints(provider)).authorization)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', provider.clientId)
      url.searchParams.set('redirect_uri', callbackUrl)
      url.searchParams.set('state', state)
      if (provider.scope) url.searchParams.set('scope', provider.scope)
      if (provider.pkce) {
        url.searchParams.set('code_challenge', base64Url(await sha256(verifier)))
        url.searchParams.set('code_challenge_method', 'S256')
      }
      for (const [key, value] of Object.entries(provider.params ?? {})) url.searchParams.set(key, value)
      return { location: url.toString(), cookie: serializeCookie(COOKIE, state, { maxAge: STATE_SECONDS, secure }) }
    },

    /**
     * Finishes the flow: checks state, swaps the code for tokens, reads the profile.
     * @returns {Promise<{ ok: true, profile: object, tokens: object, state: object } | { ok: false, code: string, state?: object }>}
     */
    async finish(provider, request, { callbackUrl }) {
      const url = new URL(request.url)
      const state = url.searchParams.get('state')
      const fromCookie = readCookie(request.headers.get('cookie'), COOKIE)
      const saved = state ? await store.get(`oauth:${state}`) : null
      if (state) await store.delete(`oauth:${state}`)
      if (!saved || saved.provider !== provider.id || !fromCookie || fromCookie !== state) return { ok: false, code: 'oauth-state' }
      if (url.searchParams.get('error')) return { ok: false, code: url.searchParams.get('error') === 'access_denied' ? 'oauth-cancelled' : 'oauth-failed', state: saved }
      const code = url.searchParams.get('code')
      if (!code) return { ok: false, code: 'oauth-failed', state: saved }

      const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl })
      if (provider.pkce) body.set('code_verifier', saved.verifier)
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
      if (provider.tokenAuth === 'basic') headers.Authorization = `Basic ${btoa(`${encodeURIComponent(provider.clientId)}:${encodeURIComponent(provider.clientSecret ?? '')}`)}`
      else {
        body.set('client_id', provider.clientId)
        if (provider.clientSecret) body.set('client_secret', provider.clientSecret)
      }
      const res = await doFetch((await endpoints(provider)).token, { method: 'POST', headers, body })
      const tokens = await res.json().catch(() => ({}))
      if (!res.ok || !tokens.access_token) {
        console.error(`slauth: ${provider.id} wouldn't swap the code for a token:`, res.status, tokens.error ?? '')
        return { ok: false, code: 'oauth-failed', state: saved }
      }
      const profile = await provider.profile(tokens, doFetch)
      if (!profile?.id) return { ok: false, code: 'oauth-failed', state: saved }
      if (provider.trustEmail && profile.email) profile.emailVerified = true
      return { ok: true, profile, tokens, state: saved }
    },

    clearCookie: (secure) => serializeCookie(COOKIE, '', { maxAge: 0, secure }),
  }
}

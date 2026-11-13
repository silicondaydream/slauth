/**
 * The browser side: tiny helpers around the /auth routes, including the WebAuthn
 * plumbing passkeys need.
 *
 *   import { createClient } from 'slauthjs/client'
 *   const auth = createClient()                 // or createClient({ basePath: '/api/auth' })
 *   await auth.email.start('me@example.com')
 *   const { user } = await auth.email.verify('me@example.com', '123456')
 */

/** Thrown for any answer that isn't a success; `code` says which (see the docs' error list). */
export class SlauthError extends Error {
  constructor(message, code, status, details = {}) {
    super(message)
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

export function createClient({ basePath = '/auth', fetch: doFetch = (...args) => fetch(...args), token: bearer } = {}) {
  const base = basePath.replace(/\/+$/, '')
  // Apps that can't keep cookies (React Native, CLIs) pass `token: { get, set }` and get bearer tokens instead.
  const extra = () => {
    if (!bearer) return {}
    const value = bearer.get()
    return { 'X-Slauth-Transport': 'bearer', ...(value ? { Authorization: `Bearer ${value}` } : {}) }
  }

  async function call(path, body) {
    const init =
      body === undefined
        ? { credentials: 'same-origin', headers: extra() }
        : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...extra() }, body: JSON.stringify(body) }
    let res
    try {
      res = await doFetch(`${base}/${path}`, init)
    } catch {
      throw new SlauthError("Couldn't reach the server.", 'offline', 0)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const { error, code, ...rest } = data
      throw new SlauthError(error ?? `HTTP ${res.status}`, code ?? 'server-error', res.status, rest)
    }
    if (bearer && typeof data.token === 'string' && path !== 'token') await bearer.set(data.token)
    if (bearer && path === 'signout') await bearer.set(null)
    return data
  }

  /** Remembers the pending two-factor sign-in for bearer apps. */
  let pendingToken = null
  const signIn = async (path, body) => {
    const data = await call(path, body)
    if (data.pendingToken) pendingToken = data.pendingToken
    return data
  }

  let cachedToken = null

  const passkey = {
    /** True when this browser can use passkeys. */
    supported: () => typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function',

    /** Adds a passkey for the signed-in person. */
    async register(name) {
      const options = await call('passkey/register/options', {})
      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: bytes(options.challenge),
          user: { ...options.user, id: bytes(options.user.id) },
          excludeCredentials: options.excludeCredentials.map((c) => ({ ...c, id: bytes(c.id) })),
        },
      })
      return call('passkey/register/verify', { credential: serialize(credential), name })
    },

    /** Signs in with a passkey; the browser lets the person pick one. */
    async signIn() {
      const options = await call('passkey/login/options', {})
      const credential = await navigator.credentials.get({
        publicKey: { ...options, challenge: bytes(options.challenge), allowCredentials: [] },
      })
      return call('passkey/login/verify', { credential: serialize(credential) })
    },

    list: () => call('passkeys'),
    rename: (id, name) => call('passkey/rename', { id, name }),
    remove: (id) => call('passkey/delete', { id }),
  }

  const go = (url) => {
    if (typeof window !== 'undefined') window.location.assign(url)
    return url
  }
  const providerUrl = (id, params) => `${base}/oauth/${encodeURIComponent(id)}?${new URLSearchParams(params)}`

  return {
    /** `{ user }` (null when signed out), `twoFactor: 'pending'` mid sign-in, and `lock` when the app lock is on. */
    session: () => call('session'),
    /** What this app offers: providers, passwords, magic links, two-factor, organizations. */
    config: () => call('config'),
    email: {
      start: (email, options = {}) => call('email/start', { email, ...options }),
      verify: (email, code) => signIn('email/verify', { email, code }),
      /** Finishes a magic link (the page the link opens does this for you). */
      link: (token) => signIn('email/link', { token }),
      change: {
        start: (email) => call('email/change/start', { email }),
        verify: (email, code) => call('email/change/verify', { email, code }),
      },
    },
    password: {
      signIn: (email, password, options = {}) => signIn('password/signin', { email, password, ...options }),
      /** Emails a code; once it's used (email.verify) the password is saved. */
      signUp: (email, password, options = {}) => call('password/signup', { email, password, ...options }),
      set: (password, current) => call('password/set', { password, current }),
      remove: () => call('password/remove', {}),
    },
    /** "Sign in with …": goes to the provider and comes back to `redirect`. */
    oauth: {
      signIn: (provider, { redirect } = {}) => go(providerUrl(provider, redirect ? { redirect } : {})),
      link: (provider, { redirect } = {}) => go(providerUrl(provider, { link: '1', ...(redirect ? { redirect } : {}) })),
      url: (provider, { redirect } = {}) => providerUrl(provider, redirect ? { redirect } : {}),
    },
    twoFactor: {
      /** The second step of signing in. Pass { recoveryCode } instead of a code if the phone is lost. */
      verify: (code) => call('two-factor/verify', { ...(typeof code === 'string' ? { code } : code), ...(pendingToken ? { pendingToken } : {}) }),
      setup: () => call('two-factor/setup', {}),
      enable: (code) => call('two-factor/enable', { code }),
      disable: (code) => call('two-factor/disable', typeof code === 'string' ? { code } : code),
      recoveryCodes: (code) => call('two-factor/recovery-codes', { code }),
    },
    passkey,
    signOut: async () => {
      cachedToken = null
      return call('signout', {})
    },
    user: {
      update: (patch) => call('user', patch),
      delete: () => call('user/delete', {}),
    },
    sessions: {
      list: () => call('sessions'),
      revoke: (id) => call('sessions/revoke', { id }),
      revokeOthers: () => call('sessions/revoke-others', {}),
    },
    accounts: {
      list: () => call('accounts'),
      unlink: (provider) => call('accounts/unlink', { provider }),
    },
    /** A JWT for your other services, reused until a minute before it expires. */
    async getToken() {
      if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token
      cachedToken = await call('token')
      return cachedToken.token
    },
    orgs: {
      list: () => call('orgs'),
      /** Works in this organization for the rest of the session (null for none). Returns { org }. */
      async setActive(id) {
        const out = await call('orgs/active', { orgId: id })
        // A cached JWT still names the old organization.
        cachedToken = null
        return out
      },
      create: (name) => call('orgs', { name }),
      get: (id) => call(`orgs/${encodeURIComponent(id)}`),
      rename: (id, name) => call(`orgs/${encodeURIComponent(id)}`, { name }),
      delete: (id) => call(`orgs/${encodeURIComponent(id)}/delete`, {}),
      invite: (id, email, role) => call(`orgs/${encodeURIComponent(id)}/invite`, { email, role }),
      revokeInvite: (id, inviteId) => call(`orgs/${encodeURIComponent(id)}/invites/revoke`, { id: inviteId }),
      setRole: (id, userId, role) => call(`orgs/${encodeURIComponent(id)}/members/role`, { userId, role }),
      removeMember: (id, userId) => call(`orgs/${encodeURIComponent(id)}/members/remove`, { userId }),
      invites: () => call('invites'),
      accept: (inviteId) => call('invites/accept', { id: inviteId }),
      decline: (inviteId) => call('invites/decline', { id: inviteId }),
    },
    lock: {
      unlock: (pin) => call('lock/login', { pin }),
      setup: (pin, policy) => call('lock/setup', { pin, policy }),
      skip: () => call('lock/setup', { policy: 'never' }),
      changePin: (current, next) => call('lock/pin', { current, next }),
      setPolicy: (policy, pin) => call('lock/policy', { policy, pin }),
      lockNow: () => call('lock/logout', {}),
    },
  }
}

function bytes(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function text(buffer) {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A PublicKeyCredential as JSON with base64url fields, the shape the server reads. */
function serialize(credential) {
  if (typeof credential.toJSON === 'function') return credential.toJSON()
  const r = credential.response
  const response = { clientDataJSON: text(r.clientDataJSON) }
  if (r.attestationObject) {
    response.attestationObject = text(r.attestationObject)
    response.transports = r.getTransports?.() ?? []
  }
  if (r.authenticatorData) {
    response.authenticatorData = text(r.authenticatorData)
    response.signature = text(r.signature)
    response.userHandle = r.userHandle ? text(r.userHandle) : null
  }
  return { id: credential.id, rawId: text(credential.rawId), type: credential.type, response }
}

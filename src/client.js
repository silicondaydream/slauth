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

export function createClient({ basePath = '/auth', fetch: doFetch = (...args) => fetch(...args) } = {}) {
  const base = basePath.replace(/\/+$/, '')

  async function call(path, body) {
    const init = body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
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
    return data
  }

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
    remove: (id) => call('passkey/delete', { id }),
  }

  return {
    /** `{ user }` (null when signed out), plus `lock` when the app lock is on. */
    session: () => call('session'),
    email: {
      start: (email) => call('email/start', { email }),
      verify: (email, code) => call('email/verify', { email, code }),
    },
    passkey,
    signOut: () => call('signout', {}),
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

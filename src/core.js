import { createAccess } from './access.js'
import { createEmailCodes } from './email-code.js'
import { consoleEmail } from './email/console.js'
import { createLock } from './lock.js'
import { PasskeyError, readChallenge, verifyAuthentication, verifyRegistration } from './passkey/webauthn.js'
import { createSessions } from './session.js'
import { createUsers, normalizeEmail, validEmail } from './users.js'
import { base64Url, json } from './util.js'

const CHALLENGE_SECONDS = 5 * 60
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
let warned = false

/**
 * slauth: sign-in for side projects.
 *
 *   const auth = slauth({ secret, store })
 *   if (url.pathname.startsWith('/auth/')) return auth.handle(request)
 *   const user = await auth.user(request)
 *
 * @param {import('./index.js').SlauthConfig} config
 */
export function slauth(config) {
  const {
    secret,
    store,
    appName = 'your app',
    basePath = '/auth',
    cookie = 'slauth_session',
    sessionDays = 30,
    allow,
    passkeys = {},
    origins,
  } = config ?? {}

  if (!store || typeof store.get !== 'function') {
    throw new Error("slauth: pass a store, e.g. store: memory() from 'slauthjs/stores/memory'.")
  }
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('slauth: `secret` must be a random string of at least 16 characters. Make one with: openssl rand -base64 32')
  }

  const sender = config.email ?? consoleEmail()
  if (!config.email && !warned) {
    warned = true
    console.warn('slauth: no `email` sender set, so sign-in codes are printed to the console.')
  }

  const users = createUsers(store, allow)
  const sessions = createSessions({ store, cookie, days: sessionDays })
  const codes = createEmailCodes({ store, secret, sender, appName })
  const access = config.access ? createAccess({ teamDomain: config.access.team, audience: config.access.aud, devUser: config.access.devUser, fetch: config.access.fetch }) : null
  const lock = config.lock
    ? createLock(
        { get: (userId) => store.get(`lock:${userId}`), put: (userId, doc) => store.put(`lock:${userId}`, doc) },
        { cookie: config.lock === true ? 'slauth_lock' : (config.lock.cookie ?? 'slauth_lock'), defaultPolicy: config.lock === true ? 'never' : (config.lock.default ?? 'never') },
      )
    : null

  const prefix = basePath.replace(/\/+$/, '')

  /** The signed-in person, or null. Doesn't look at the app lock; see requireUser. */
  async function user(request) {
    const session = await sessions.read(request)
    if (session) {
      const found = await users.byId(session.userId)
      // Taking someone off the allow list signs them out everywhere.
      if (found && (await users.allowed(found.email))) return publicUser(found)
    }
    if (access) {
      const fromAccess = await access.getUser(request)
      if (fromAccess) {
        const found = await users.signIn(fromAccess.email)
        if (found) return publicUser(found)
      }
    }
    return null
  }

  /**
   * The signed-in, unlocked person, or a 401 Response to send back as it is:
   *
   *   const user = await auth.requireUser(request)
   *   if (user instanceof Response) return user
   */
  async function requireUser(request) {
    const found = await user(request)
    if (!found) return json({ error: 'Please sign in.', code: 'signed-out' }, 401)
    if (lock && !(await lock.isUnlocked(lockUser(found), request.headers.get('cookie')))) {
      return json({ error: 'Please enter your PIN.', code: 'locked' }, 401)
    }
    return found
  }

  /** Every route under basePath. Returns a 404 for anything else, so it's safe to call for any request. */
  async function handle(request) {
    const url = new URL(request.url)
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return json({ error: 'Not found.', code: 'not-found' }, 404)
    const route = url.pathname.slice(prefix.length + 1)
    const method = request.method

    if (UNSAFE.has(method)) {
      const refused = checkSameSite(request, url, origins)
      if (refused) return refused
    }

    try {
      return await routeRequest(route, method, request, url)
    } catch (error) {
      if (error instanceof PasskeyError) return json({ error: error.message, code: 'passkey-failed' }, 400)
      console.error('slauth:', error)
      return json({ error: 'Something went wrong.', code: 'server-error' }, 500)
    }
  }

  async function routeRequest(route, method, request, url) {
    const body = async () => {
      try {
        return (await request.json()) ?? {}
      } catch {
        return {}
      }
    }

    if (route === 'session' && method === 'GET') {
      const session = await sessions.read(request)
      const found = await user(request)
      const headers = {}
      if (session && found) {
        const refreshed = await sessions.refresh(session, request)
        if (refreshed) headers['Set-Cookie'] = refreshed
      }
      const out = { user: found }
      if (lock && found) out.lock = (await lock.handle('session', 'GET', body, lockUser(found), request.headers.get('cookie'), url.protocol === 'https:')).body
      return json(out, 200, headers)
    }

    if (route === 'email/start' && method === 'POST') {
      const email = normalizeEmail((await body()).email)
      if (!validEmail(email)) return json({ error: "That doesn't look like an email address.", code: 'bad-email' }, 400)
      if (!(await users.allowed(email))) return json({ error: "That email isn't on the list for this app.", code: 'not-allowed' }, 403)
      const sent = await codes.start(email)
      if (!sent.ok) return json({ error: `Please wait ${sent.retryAfter}s before asking for another code.`, code: sent.code, retryAfter: sent.retryAfter }, 429)
      return json({ ok: true })
    }

    if (route === 'email/verify' && method === 'POST') {
      const input = await body()
      const email = normalizeEmail(input.email)
      if (!validEmail(email)) return json({ error: "That doesn't look like an email address.", code: 'bad-email' }, 400)
      const result = await codes.verify(email, input.code)
      if (!result.ok) {
        const messages = { expired: 'That code has expired. Ask for a new one.', 'too-many-tries': 'Too many tries. Ask for a new code.', 'bad-code': 'That code is wrong.' }
        return json({ error: messages[result.code], code: result.code, triesLeft: result.triesLeft }, result.code === 'bad-code' ? 400 : 410)
      }
      const found = await users.signIn(email)
      if (!found) return json({ error: "That email isn't on the list for this app.", code: 'not-allowed' }, 403)
      return json({ user: publicUser(found) }, 200, { 'Set-Cookie': await sessions.create(found.id, request) })
    }

    if (route === 'signout' && method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': await sessions.destroy(request) })
    }

    if (route.startsWith('passkey') || route === 'passkeys') {
      if (passkeys === false) return json({ error: 'Passkeys are turned off.', code: 'not-found' }, 404)
      return passkeyRoute(route, method, request, url, body)
    }

    if (route.startsWith('lock/') && lock) {
      const found = await user(request)
      if (!found) return json({ error: 'Please sign in.', code: 'signed-out' }, 401)
      const reply = await lock.handle(route.slice(5), method, body, lockUser(found), request.headers.get('cookie'), url.protocol === 'https:')
      if (reply) return json(reply.body, reply.status, reply.cookie ? { 'Set-Cookie': reply.cookie } : {})
    }

    return json({ error: 'Not found.', code: 'not-found' }, 404)
  }

  /* ---------- passkeys ---------- */

  const expect = (url, challenge) => ({
    rpId: passkeys.rpId ?? url.hostname,
    origin: passkeys.origin ?? origins ?? url.origin,
    challenge,
    requireUserVerification: passkeys.userVerification === 'required',
  })

  async function takeChallenge(clientDataJSON, type) {
    const challenge = readChallenge(clientDataJSON)
    if (!challenge) throw new PasskeyError('The response has no challenge.')
    const stored = await store.get(`challenge:${challenge}`)
    // Single use, whatever happens next.
    await store.delete(`challenge:${challenge}`)
    if (!stored || stored.type !== type) throw new PasskeyError('That passkey request expired. Try again.')
    return { challenge, stored }
  }

  async function newChallenge(value) {
    const challenge = base64Url(crypto.getRandomValues(new Uint8Array(32)))
    await store.put(`challenge:${challenge}`, value, { ttl: CHALLENGE_SECONDS })
    return challenge
  }

  async function passkeyRoute(route, method, request, url, body) {
    if (route === 'passkey/login/options' && method === 'POST') {
      const challenge = await newChallenge({ type: 'login' })
      return json({
        challenge,
        rpId: passkeys.rpId ?? url.hostname,
        timeout: CHALLENGE_SECONDS * 1000,
        userVerification: passkeys.userVerification ?? 'preferred',
        allowCredentials: [],
      })
    }

    if (route === 'passkey/login/verify' && method === 'POST') {
      const { credential } = await body()
      await takeChallenge(credential?.response?.clientDataJSON, 'login')
      const stored = typeof credential?.id === 'string' ? await store.get(`passkey:${credential.id}`) : null
      if (!stored) return json({ error: "This passkey isn't registered here.", code: 'passkey-unknown' }, 400)
      if (credential.response.userHandle && credential.response.userHandle !== base64Url(new TextEncoder().encode(stored.userId))) {
        throw new PasskeyError('This passkey belongs to someone else.')
      }
      const { counter } = await verifyAuthentication(credential, stored, expect(url, readChallenge(credential.response.clientDataJSON)))
      await store.put(`passkey:${stored.id}`, { ...stored, counter, lastUsedAt: Date.now() })
      const found = await users.byId(stored.userId)
      if (!found || !(await users.allowed(found.email))) return json({ error: "You're not on the list for this app.", code: 'not-allowed' }, 403)
      return json({ user: publicUser(found) }, 200, { 'Set-Cookie': await sessions.create(found.id, request) })
    }

    // Everything below is for someone already signed in.
    const found = await user(request)
    if (!found) return json({ error: 'Please sign in.', code: 'signed-out' }, 401)
    const ids = (await store.get(`passkeys:${found.id}`)) ?? []

    if (route === 'passkey/register/options' && method === 'POST') {
      const challenge = await newChallenge({ type: 'register', userId: found.id })
      return json({
        challenge,
        rp: { id: passkeys.rpId ?? url.hostname, name: passkeys.rpName ?? appName },
        user: { id: base64Url(new TextEncoder().encode(found.id)), name: found.email, displayName: found.email },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: CHALLENGE_SECONDS * 1000,
        attestation: 'none',
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: passkeys.userVerification ?? 'preferred' },
        excludeCredentials: ids.map((id) => ({ type: 'public-key', id })),
      })
    }

    if (route === 'passkey/register/verify' && method === 'POST') {
      const { credential, name } = await body()
      const { challenge, stored } = await takeChallenge(credential?.response?.clientDataJSON, 'register')
      if (stored.userId !== found.id) throw new PasskeyError('That passkey request was for someone else.')
      const verified = await verifyRegistration(credential, expect(url, challenge))
      if (await store.get(`passkey:${verified.id}`)) return json({ error: 'That passkey is already registered.', code: 'passkey-exists' }, 409)
      const label = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : `Passkey added ${new Date().toISOString().slice(0, 10)}`
      await store.put(`passkey:${verified.id}`, { ...verified, userId: found.id, name: label, createdAt: Date.now(), lastUsedAt: null })
      await store.put(`passkeys:${found.id}`, [...ids, verified.id])
      return json({ ok: true, passkey: { id: verified.id, name: label } })
    }

    if (route === 'passkeys' && method === 'GET') {
      const list = []
      for (const id of ids) {
        const pk = await store.get(`passkey:${id}`)
        if (pk) list.push({ id: pk.id, name: pk.name, createdAt: pk.createdAt, lastUsedAt: pk.lastUsedAt })
      }
      return json({ passkeys: list })
    }

    if (route === 'passkey/delete' && method === 'POST') {
      const { id } = await body()
      if (!ids.includes(id)) return json({ error: 'No such passkey.', code: 'passkey-unknown' }, 404)
      await store.delete(`passkey:${id}`)
      await store.put(`passkeys:${found.id}`, ids.filter((x) => x !== id))
      return json({ ok: true })
    }

    return json({ error: 'Not found.', code: 'not-found' }, 404)
  }

  return { handle, user, requireUser, store }
}

function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt }
}

/** createLock works with { email, userId }. */
function lockUser(user) {
  return { email: user.email, userId: user.id }
}

/**
 * Stops other websites using a visitor's cookies to post here (CSRF): writes must be JSON
 * (which a plain HTML form can't send) and, when the browser says where they came from,
 * come from this site.
 */
function checkSameSite(request, url, origins) {
  const type = request.headers.get('content-type') ?? ''
  if (!type.startsWith('application/json')) return json({ error: 'Expected JSON.', code: 'bad-request' }, 415)
  const origin = request.headers.get('origin')
  const allowed = [origins ?? url.origin].flat()
  if (origin && !allowed.includes(origin)) return json({ error: 'Cross-site request refused.', code: 'cross-site' }, 403)
  if (!origin && request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Cross-site request refused.', code: 'cross-site' }, 403)
  return null
}

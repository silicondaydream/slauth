import { createAccess } from './access.js'
import { createChallenge } from './challenge.js'
import { createEmailCodes } from './email-code.js'
import { consoleEmail } from './email/console.js'
import { createLock } from './lock.js'
import { createNewSignIns } from './new-sign-in.js'
import { createOAuthFlow } from './oauth/flow.js'
import { createOrgs, OrgError } from './orgs.js'
import { PasskeyError } from './passkey/webauthn.js'
import { createPasswords } from './password.js'
import { createRateLimit } from './rate-limit.js'
import { accountRoutes } from './routes/account.js'
import { emailRoutes } from './routes/email.js'
import { oauthRoutes } from './routes/oauth.js'
import { orgRoutes } from './routes/orgs.js'
import { passkeyRoutes } from './routes/passkeys.js'
import { passwordRoutes } from './routes/password.js'
import { twoFactorRoutes } from './routes/two-factor.js'
import { createSessions } from './session.js'
import { createTokens } from './tokens.js'
import { createTwoFactor } from './two-factor.js'
import { createUsers, publicUser } from './users.js'
import { base64Url, json, randomToken, readCookie, serializeCookie, sha256 } from './util.js'

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const PENDING_SECONDS = 10 * 60
const PENDING_COOKIE = 'slauth_2fa'
let warned = false

/**
 * slauth: sign-in for side projects, and for the projects they grow into.
 *
 *   const auth = slauth({ secret, store })
 *   if (url.pathname.startsWith('/auth/')) return auth.handle(request)
 *   const user = await auth.user(request)
 *
 * Email codes and passkeys are on from the start. Everything else (providers,
 * passwords, two-factor, tokens, organizations) is one config key away.
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
    baseUrl,
    signInPage,
    freshMinutes = 15,
    providers = [],
    magicLinks = false,
    on = {},
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

  const ids = new Set()
  for (const p of providers) {
    if (ids.has(p.id)) throw new Error(`slauth: two providers are called "${p.id}".`)
    ids.add(p.id)
  }

  const option = (value, defaults = {}) => (value ? (value === true ? defaults : { ...defaults, ...value }) : null)
  const passwordOptions = option(config.passwords)
  const twoFactorOptions = option(config.twoFactor)
  const tokenOptions = option(config.tokens)
  const orgOptions = option(config.organizations, { allowCreate: true })
  const newSignInOptions = option(config.newSignInEmails)

  const users = createUsers(store, allow)
  const sessions = createSessions({ store, cookie, days: sessionDays })
  const codes = createEmailCodes({ store, secret, sender, appName, message: config.emails })
  const limits = createRateLimit(store, config.rateLimit)
  const challenge = createChallenge(config.challenge)
  const passwords = passwordOptions ? createPasswords({ store, ...passwordOptions }) : null
  const twoFactor = twoFactorOptions ? createTwoFactor({ store, issuer: twoFactorOptions.issuer ?? appName }) : null
  const tokens = tokenOptions ? createTokens({ store, secret, ...tokenOptions }) : null
  const orgs = orgOptions ? createOrgs(store) : null
  const newSignIns = newSignInOptions ? createNewSignIns({ store, codes, sessions, accountPage: newSignInOptions.accountPage }) : null
  const oauth = createOAuthFlow({ store, fetch: config.fetch })
  const access = config.access ? createAccess({ teamDomain: config.access.team, audience: config.access.aud, devUser: config.access.devUser, fetch: config.access.fetch }) : null
  const lock = config.lock
    ? createLock(
        { get: (userId) => store.get(`lock:${userId}`), put: (userId, doc) => store.put(`lock:${userId}`, doc) },
        { cookie: config.lock === true ? 'slauth_lock' : (config.lock.cookie ?? 'slauth_lock'), defaultPolicy: config.lock === true ? 'never' : (config.lock.default ?? 'never') },
      )
    : null

  const prefix = basePath.replace(/\/+$/, '')

  /* ---------- who's asking ---------- */

  /**
   * The session and user behind a request, or null. JWTs count only for your own routes
   * (auth.user), never for slauth's: a token must not be able to mint the next one.
   */
  async function current(request, { jwt = false } = {}) {
    const session = await sessions.read(request)
    if (session) {
      const found = await users.byId(session.userId)
      // Taking someone off the allow list (or banning them) signs them out everywhere.
      if (found && !found.bannedAt && (await users.allowed(found.email, { method: 'session' }))) return { user: found, session }
    }
    const bearer = request.headers.get('authorization')
    if (jwt && tokens && bearer?.startsWith('Bearer ') && bearer.split('.').length === 3) {
      const claims = await tokens.verify(bearer.slice(7).trim())
      const found = claims && (await users.byId(claims.sub))
      if (found && !found.bannedAt) return { user: found, session: null, claims }
    }
    if (access) {
      const fromAccess = await access.getUser(request)
      if (fromAccess) {
        const found = await users.signIn(fromAccess.email, { method: 'access' })
        if (found && !found.bannedAt) return { user: found, session: null }
      }
    }
    return null
  }

  /** The signed-in person, or null. Doesn't look at the app lock; see requireUser. */
  async function user(request) {
    const found = await current(request, { jwt: true })
    return found ? publicUser(found.user) : null
  }

  /**
   * The signed-in, unlocked person, or a 401/403 Response to send back as it is:
   *
   *   const user = await auth.requireUser(request)
   *   if (user instanceof Response) return user
   *
   * @param {Request} request
   * @param {{ role?: string | string[] }} [options]  only people with one of these roles
   */
  async function requireUser(request, { role } = {}) {
    const found = await user(request)
    if (!found) return json({ error: 'Please sign in.', code: 'signed-out' }, 401)
    if (lock && !(await lock.isUnlocked(lockUser(found), request.headers.get('cookie')))) {
      return json({ error: 'Please enter your PIN.', code: 'locked' }, 401)
    }
    if (role && ![role].flat().some((r) => found.roles.includes(r))) return json({ error: "You don't have access to that.", code: 'forbidden' }, 403)
    return found
  }

  /* ---------- the end of every sign-in ---------- */

  async function emit(name, data) {
    if (typeof on[name] !== 'function') return
    try {
      await on[name](data)
    } catch (error) {
      console.error(`slauth: the ${name} handler threw:`, error)
    }
  }

  /**
   * Every way of signing in ends here: bans, then two-factor, then a session.
   * @returns {Promise<{ kind: 'session', user: object, cookie: string, token: string } | { kind: 'two-factor', cookie: string, token: string } | { kind: 'refused', status: number, code: string, error: string }>}
   */
  async function complete(found, request, { method }) {
    if (found.bannedAt) return { kind: 'refused', status: 403, code: 'banned', error: "This account can't sign in." }
    const isNew = Boolean(found.isNew)
    if (found.isNew) {
      delete found.isNew
      await emit('signUp', { user: publicUser(found), method, request })
    }
    if (twoFactor && method !== 'passkey' && (await twoFactor.enabled(found.id))) {
      const token = randomToken()
      await store.put(`2fa:${base64Url(await sha256(token))}`, { userId: found.id, method, tries: 0, isNew }, { ttl: PENDING_SECONDS })
      return { kind: 'two-factor', token, cookie: serializeCookie(PENDING_COOKIE, token, { maxAge: PENDING_SECONDS, secure: isSecure(request) }) }
    }
    const made = await sessions.create(found.id, request, { method })
    await noticeSignIn(found, request, { method, sessionId: made.id, isNew })
    await emit('signIn', { user: publicUser(found), method, request })
    return { kind: 'session', user: publicUser(found), cookie: made.cookie, token: made.token }
  }

  /** With newSignInEmails on: an email when this is a browser and OS the account hasn't used. */
  async function noticeSignIn(found, request, { method, sessionId, isNew = false }) {
    if (newSignIns) await newSignIns(found, request, { method, sessionId, isNew, origin: app.origin(new URL(request.url)) })
  }

  /** The JSON answer for a sign-in route: a cookie for browsers, or the token for apps that asked for one. */
  function reply(result, extra = {}, request) {
    if (result.kind === 'refused') return json({ error: result.error, code: result.code }, result.status)
    const bearer = request?.headers.get('x-slauth-transport') === 'bearer'
    if (result.kind === 'two-factor') return json({ twoFactor: true, ...(bearer ? { pendingToken: result.token } : {}), ...extra }, 200, bearer ? {} : { 'Set-Cookie': result.cookie })
    return json({ user: result.user, ...(bearer ? { token: result.token } : {}), ...extra }, 200, bearer ? {} : { 'Set-Cookie': result.cookie })
  }

  /** The two-factor sign-in waiting to be finished in this browser (or for this token). */
  async function pending(request, token) {
    const value = token ?? readCookie(request.headers.get('cookie'), PENDING_COOKIE)
    if (!value || value.length > 128) return null
    const key = `2fa:${base64Url(await sha256(value))}`
    const doc = await store.get(key)
    return doc ? { ...doc, key } : null
  }

  /* ---------- routes ---------- */

  const app = {
    config,
    appName,
    prefix,
    store,
    users,
    sessions,
    codes,
    limits,
    challenge,
    passwords,
    twoFactor,
    tokens,
    orgs,
    orgOptions,
    oauth,
    lock,
    providers,
    magicLinks,
    signInPage,
    passkeys,
    origins,
    current,
    complete,
    reply,
    pending,
    emit,
    noticeSignIn,
    deleteUser,
    pendingCookie: PENDING_COOKIE,
    /** Where links in emails and provider callbacks point. */
    origin: (url) => (baseUrl ?? url.origin).replace(/\/+$/, ''),
    /** The signed-in user and session, or a 401 to return. */
    async signedIn(request) {
      return (await current(request)) ?? json({ error: 'Please sign in.', code: 'signed-out' }, 401)
    },
    /** True when the session started recently enough for something sensitive. */
    fresh(session) {
      return freshMinutes === false || (session != null && Date.now() - session.createdAt < freshMinutes * 60_000)
    },
    reauth: () => json({ error: 'Please sign in again to do that.', code: 'reauth-required' }, 403),
    secure: isSecure,
  }

  const routers = [emailRoutes(app), accountRoutes(app), passkeyRoutes(app), oauthRoutes(app), passwordRoutes(app), twoFactorRoutes(app), orgRoutes(app)]

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

    let parsed
    const body = async () => {
      if (parsed === undefined) {
        try {
          parsed = (await request.json()) ?? {}
        } catch {
          parsed = {}
        }
        if (typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {}
      }
      return parsed
    }
    const r = { route, method, request, url, body }

    try {
      for (const router of routers) {
        const answer = await router(r)
        if (answer) return answer
      }
      if (route.startsWith('lock/') && lock) {
        const found = await user(request)
        if (!found) return json({ error: 'Please sign in.', code: 'signed-out' }, 401)
        const answer = await lock.handle(route.slice(5), method, body, lockUser(found), request.headers.get('cookie'), url.protocol === 'https:')
        if (answer) return json(answer.body, answer.status, answer.cookie ? { 'Set-Cookie': answer.cookie } : {})
      }
      return json({ error: 'Not found.', code: 'not-found' }, 404)
    } catch (error) {
      if (error instanceof PasskeyError) return json({ error: error.message, code: 'passkey-failed' }, 400)
      if (error instanceof OrgError) return json({ error: error.message, code: error.code }, 409)
      console.error('slauth:', error)
      return json({ error: 'Something went wrong.', code: 'server-error' }, 500)
    }
  }

  /* ---------- the server-side API ---------- */

  async function deleteUser(id) {
    const found = await users.byId(id)
    if (!found) return false
    await sessions.revokeAll(id)
    for (const pk of (await store.get(`passkeys:${id}`)) ?? []) await store.delete(`passkey:${pk}`)
    await store.delete(`passkeys:${id}`)
    for (const key of (await store.get(`accounts:${id}`)) ?? []) await store.delete(`account:${key}`)
    for (const key of [`accounts:${id}`, `password:${id}`, `totp:${id}`, `lock:${id}`, `devices:${id}`]) await store.delete(key)
    if (orgs) await orgs.forget(id)
    await users.remove(found)
    await emit('userDeleted', { user: publicUser(found) })
    return true
  }

  async function updateUser(id, patch) {
    const updated = await users.update(id, patch)
    if (updated) await emit('userUpdated', { user: publicUser(updated) })
    return updated
  }

  return {
    handle,
    user,
    requireUser,
    /** The user and the session behind a request (session is null for Access or a JWT), or null. */
    async session(request) {
      const found = await current(request, { jwt: true })
      if (!found) return null
      const s = found.session
      return { user: publicUser(found.user), session: s ? { id: s.id, userId: s.userId, createdAt: s.createdAt, method: s.method ?? null, impersonatorId: s.impersonatorId ?? null } : null }
    },
    store,

    users: {
      get: users.byId,
      byEmail: users.byEmail,
      list: users.list,
      async create(details) {
        const made = await users.create(details)
        await emit('signUp', { user: publicUser(made), method: 'admin' })
        return made
      },
      update: updateUser,
      delete: deleteUser,
      /** Signs them out everywhere and stops them signing in again, until unban. */
      async ban(id) {
        const updated = await updateUser(id, { bannedAt: Date.now() })
        if (updated) await sessions.revokeAll(id)
        return updated
      },
      unban: (id) => updateUser(id, { bannedAt: null }),
    },

    sessions: {
      list: sessions.list,
      revoke: sessions.revoke,
      revokeAll: (userId) => sessions.revokeAll(userId),
      /**
       * Signs someone in without asking them: for your own sign-in methods, tests, or
       * support staff seeing what a user sees (pass impersonatorId so it's on record).
       * Returns the Set-Cookie value and the bearer token.
       */
      async create(userId, request, { method = 'admin', impersonatorId = null } = {}) {
        const found = await users.byId(userId)
        if (!found) throw new Error(`slauth: no user ${userId}.`)
        const made = await sessions.create(userId, request, { method, impersonatorId })
        return { cookie: made.cookie, token: made.token }
      },
    },

    accounts: {
      /** The providers someone has linked, with their tokens when the provider has keepTokens. */
      async list(userId) {
        const out = []
        for (const key of (await store.get(`accounts:${userId}`)) ?? []) {
          const doc = await store.get(`account:${key}`)
          if (doc) out.push(doc)
        }
        return out
      },
    },

    passwords: passwords && { set: passwords.set, remove: passwords.remove, has: passwords.has, hash: passwords.hash },
    twoFactor: twoFactor && { enabled: twoFactor.enabled, disable: twoFactor.disable },
    orgs: orgs && {
      create: (details, ownerId) => orgs.create(details, ownerId),
      get: orgs.get,
      update: orgs.update,
      delete: orgs.remove,
      forUser: orgs.forUser,
      members: orgs.members,
      role: orgs.role,
      addMember: orgs.addMember,
      setRole: orgs.setRole,
      removeMember: orgs.removeMember,
      invite: orgs.invite,
      revokeInvite: orgs.revokeInvite,
      /**
       * The signed-in person if they belong to this org (with one of these roles), else a
       * 401/403 Response to return as it is.
       */
      async require(request, orgId, { role } = {}) {
        const found = await requireUser(request)
        if (found instanceof Response) return found
        const theirs = await orgs.role(orgId, found.id)
        if (!theirs || (role && ![role].flat().includes(theirs))) return json({ error: "You don't have access to that.", code: 'forbidden' }, 403)
        return { ...found, orgRole: theirs }
      },
    },

    createToken: (u, extra) => {
      if (!tokens) throw new Error('slauth: turn on `tokens` to make tokens.')
      return tokens.create(u, extra)
    },
    verifyToken: (token) => {
      if (!tokens) throw new Error('slauth: turn on `tokens` to check tokens.')
      return tokens.verify(token)
    },
  }
}

/** createLock works with { email, userId }. */
function lockUser(user) {
  return { email: user.email, userId: user.id }
}

function isSecure(request) {
  return new URL(request.url).protocol === 'https:'
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

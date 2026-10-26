/**
 * The app lock: a 4-digit PIN that each person can ask an app to check again now and
 * then, on top of the Access sign-in. Access says *who* you are; the lock guards an
 * unlocked phone or iPad from whoever picks it up.
 *
 * Each person picks how often, per app:
 *   always   every visit (the unlock ends when the browser closes, at most 12 hours)
 *   daily    once a day
 *   weekly   once a week
 *   never    no PIN; the Access sign-in is enough
 *
 * Grown out of the Planda / LedgerFox PIN pad, and compatible with its stored hashes:
 * a salted PBKDF2 hash, 5 free tries then a lock of 5 minutes doubling to an hour, and a
 * signed HttpOnly cookie. The signing key is random and per person; changing the PIN
 * replaces it, which locks that person's other devices.
 */

import { base64Url, randomToken, readCookie, safeEqual } from './util.js'

const DAY = 24 * 60 * 60
export const POLICIES = /** @type {const} */ (['always', 'daily', 'weekly', 'never'])
const TTL_SECONDS = { always: DAY / 2, daily: DAY, weekly: 7 * DAY }
const FREE_ATTEMPTS = 5
const PBKDF2_ITERATIONS = 100_000

export function validPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin)
}

export function validPolicy(policy) {
  return POLICIES.includes(policy)
}

/**
 * @typedef {'always' | 'daily' | 'weekly' | 'never'} Policy
 * @typedef {{ pinHash?: string, salt?: string, sessionKey: string, failures: number, lockedUntil: number, policy?: Policy }} LockDoc
 * @typedef {{ get(userId: string): Promise<LockDoc | null>, put(userId: string, doc: LockDoc): Promise<void> }} LockStore
 * @typedef {{ email: string, userId: string }} User
 * @typedef {{ status: number, body: object, cookie?: string }} LockReply
 */

/**
 * @param {LockStore} store  where each person's lock document lives
 * @param {{ cookie?: string, defaultPolicy?: Policy }} [options]
 *   cookie         the cookie name (keep an app's old one so nobody is signed out twice)
 *   defaultPolicy  for people who haven't chosen yet; "weekly" unless set
 */
export function createLock(store, { cookie: cookieName = 'slauth_lock', defaultPolicy = 'weekly' } = {}) {
  if (!validPolicy(defaultPolicy)) throw new Error(`slauth: unknown policy "${defaultPolicy}".`)

  async function load(userId) {
    const doc = await store.get(userId)
    if (doc && typeof doc.sessionKey === 'string') return doc
    const fresh = { sessionKey: randomToken(), failures: 0, lockedUntil: 0 }
    await store.put(userId, fresh)
    return fresh
  }

  const policyOf = (doc) => (validPolicy(doc.policy) ? doc.policy : defaultPolicy)
  const pinIsSet = (doc) => Boolean(doc.pinHash && doc.salt)
  const matches = async (doc, pin) => pinIsSet(doc) && safeEqual(await hashPin(pin, doc.salt), doc.pinHash)

  async function unlockCookie(userId, doc, secure) {
    const issued = String(Math.floor(Date.now() / 1000))
    const value = `${issued}.${await sign(`${userId}.${issued}`, doc.sessionKey)}`
    // "always" is a browser-session cookie; the others last as long as the longest policy,
    // and the policy in force decides on each request whether the unlock still counts.
    return cookie(cookieName, value, policyOf(doc) === 'always' ? null : TTL_SECONDS.weekly, secure)
  }

  /**
   * True when this person may use the app right now: they chose "never", or they
   * unlocked recently enough for their policy.
   * @param {User} user
   * @param {string | null | undefined} cookieHeader
   */
  async function isUnlocked(user, cookieHeader) {
    const doc = await load(user.userId)
    const policy = policyOf(doc)
    if (policy === 'never') return true
    if (!pinIsSet(doc)) return false

    const [issued, signature] = (readCookie(cookieHeader, cookieName) ?? '').split('.')
    const issuedAt = Number(issued)
    if (!signature || !Number.isFinite(issuedAt)) return false
    const age = Date.now() / 1000 - issuedAt
    if (age < -60 || age > TTL_SECONDS[policy]) return false
    // The user id is part of what's signed, so one person's cookie never unlocks another's.
    return safeEqual(signature, await sign(`${user.userId}.${issued}`, doc.sessionKey))
  }

  async function savePin(userId, doc, pin, policy, secure) {
    const salt = randomToken()
    const next = { ...doc, pinHash: await hashPin(pin, salt), salt, sessionKey: randomToken(), failures: 0, lockedUntil: 0, policy }
    await store.put(userId, next)
    return unlockCookie(userId, next, secure)
  }

  /** @returns {Promise<LockReply>} */
  async function login(user, guess, secure) {
    if (!validPin(guess)) return { status: 400, body: { error: 'The PIN is 4 digits.' } }
    const doc = await load(user.userId)
    const now = Date.now()
    if (!pinIsSet(doc)) return { status: 409, body: { error: 'No PIN has been created yet.', reason: 'no-pin' } }
    if (doc.lockedUntil > now) {
      return { status: 429, body: { error: 'Too many tries.', reason: 'locked', retryAt: doc.lockedUntil } }
    }

    if (await matches(doc, guess)) {
      if (doc.failures !== 0 || doc.lockedUntil !== 0) await store.put(user.userId, { ...doc, failures: 0, lockedUntil: 0 })
      return { status: 200, body: { ok: true }, cookie: await unlockCookie(user.userId, doc, secure) }
    }

    const failures = doc.failures + 1
    const over = failures - FREE_ATTEMPTS
    const lockedUntil = over >= 0 ? now + Math.min(60, 5 * 2 ** over) * 60_000 : 0
    await store.put(user.userId, { ...doc, failures, lockedUntil })
    return lockedUntil
      ? { status: 429, body: { error: 'Too many tries.', reason: 'locked', retryAt: lockedUntil } }
      : { status: 401, body: { error: 'Wrong PIN.', reason: 'wrong', attemptsLeft: FREE_ATTEMPTS - failures } }
  }

  /** First time in this app: choose a PIN (and optionally how often to ask for it). */
  async function setup(user, pin, policy, secure) {
    if (!validPin(pin)) return { status: 400, body: { error: 'The PIN is 4 digits.' } }
    if (policy !== undefined && !validPolicy(policy)) return { status: 400, body: { error: 'Unknown lock setting.' } }
    const doc = await load(user.userId)
    if (pinIsSet(doc)) return { status: 409, body: { error: 'A PIN already exists.' } }
    return { status: 200, body: { ok: true }, cookie: await savePin(user.userId, doc, pin, policy ?? policyOf(doc), secure) }
  }

  /** Change PIN from Settings. Not counted toward the lockout; locks this person's other devices. */
  async function change(user, current, next, secure) {
    if (!validPin(current) || !validPin(next)) return { status: 400, body: { error: 'PINs are 4 digits.' } }
    const doc = await load(user.userId)
    if (!(await matches(doc, current))) return { status: 403, body: { error: 'The current PIN is wrong.' } }
    return { status: 200, body: { ok: true }, cookie: await savePin(user.userId, doc, next, policyOf(doc), secure) }
  }

  /**
   * Change how often the PIN is asked for. With a PIN set, the current PIN is needed,
   * so a borrowed unlocked device can't switch the lock off.
   */
  async function setPolicy(user, policy, pin, secure) {
    if (!validPolicy(policy)) return { status: 400, body: { error: 'Unknown lock setting.' } }
    const doc = await load(user.userId)
    if (pinIsSet(doc)) {
      if (!validPin(pin) || !(await matches(doc, pin))) return { status: 403, body: { error: 'The current PIN is wrong.' } }
    } else if (policy !== 'never') {
      return { status: 409, body: { error: 'Create a PIN first.', reason: 'no-pin' } }
    }
    const next = { ...doc, policy }
    await store.put(user.userId, next)
    const reply = { status: 200, body: { ok: true, policy } }
    return pinIsSet(next) ? { ...reply, cookie: await unlockCookie(user.userId, next, secure) } : reply
  }

  /**
   * The lock routes. `route` is the part after the app's prefix (e.g. "session" for
   * /api/lock/session). Returns null for any other route.
   * @param {string} route
   * @param {string} method
   * @param {() => Promise<any>} readBody
   * @param {User} user  from Access
   * @param {string | null | undefined} cookieHeader
   * @param {boolean} secure  https, so the cookie gets the Secure flag
   * @returns {Promise<LockReply | null>}
   */
  async function handle(route, method, readBody, user, cookieHeader, secure) {
    if (route === 'session' && method === 'GET') {
      const doc = await load(user.userId)
      const policy = policyOf(doc)
      return {
        status: 200,
        body: { email: user.email, policy, required: policy !== 'never', pinSet: pinIsSet(doc), unlocked: await isUnlocked(user, cookieHeader) },
      }
    }
    if (route === 'login' && method === 'POST') return login(user, (await readBody())?.pin, secure)
    if (route === 'setup' && method === 'POST') {
      const body = await readBody()
      if (body?.policy === 'never' && body?.pin === undefined) return setPolicy(user, 'never', undefined, secure)
      return setup(user, body?.pin, body?.policy, secure)
    }
    if (route === 'logout' && method === 'POST') return { status: 200, body: { ok: true }, cookie: cookie(cookieName, '', 0, secure) }
    if (route === 'pin' && method === 'POST') {
      if (!(await isUnlocked(user, cookieHeader))) return { status: 401, body: { error: 'Please enter your PIN.' } }
      const body = await readBody()
      return change(user, body?.current, body?.next, secure)
    }
    if (route === 'policy' && method === 'POST') {
      if (!(await isUnlocked(user, cookieHeader))) return { status: 401, body: { error: 'Please enter your PIN.' } }
      const body = await readBody()
      return setPolicy(user, body?.policy, body?.pin, secure)
    }
    return null
  }

  return { handle, isUnlocked }
}

function cookie(name, value, maxAge, secure) {
  const age = maxAge === null ? '' : `; Max-Age=${maxAge}`
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict${age}${secure ? '; Secure' : ''}`
}


async function hashPin(pin, salt) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return base64Url(bits)
}

async function sign(payload, secret) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
}




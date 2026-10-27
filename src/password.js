import { base64Url, fromBase64Url, safeEqual } from './util.js'

const MAX_FAILURES = 10
const FAILURE_WINDOW_SECONDS = 15 * 60

/**
 * Optional passwords, hashed with PBKDF2-SHA256 from Web Crypto. 100,000 rounds by
 * default: the most Cloudflare Workers allows. Raise `iterations` elsewhere if you like;
 * old hashes keep working because each one records its own count.
 *
 *   password:<userId>   { hash: "pbkdf2-sha256$<iterations>$<salt>$<hash>", updatedAt }
 *   pwfail:<email>      { count }   (10 wrong guesses → wait 15 minutes)
 *
 * People only get a password after proving their email (a code, a link or a provider),
 * so "forgot password" is just "sign in with a code, then set a new one".
 *
 * @param {{ store: import('./index.js').Store, iterations?: number, minLength?: number, validate?: (password: string) => string | null | Promise<string | null> }} options
 */
export function createPasswords({ store, iterations = 100_000, minLength = 8, validate }) {
  // Run a real hash even for unknown emails, so timing doesn't reveal who has an account.
  let decoy = null

  return {
    /** An error message when the password won't do, else null. */
    async problem(password) {
      if (typeof password !== 'string' || password.length < minLength) return `Passwords need at least ${minLength} characters.`
      if (password.length > 256) return 'That password is too long.'
      return validate ? ((await validate(password)) ?? null) : null
    },

    hash: (password) => hashPassword(password, iterations),

    async set(userId, password) {
      await store.put(`password:${userId}`, { hash: await hashPassword(password, iterations), updatedAt: Date.now() })
    },

    async has(userId) {
      return Boolean(await store.get(`password:${userId}`))
    },

    async remove(userId) {
      await store.delete(`password:${userId}`)
    },

    /** Checks a guess for a user (or null for "no such user"), counting failures per email. */
    async check(email, userId, password) {
      const failures = (await store.get(`pwfail:${email}`)) ?? { count: 0 }
      if (failures.count >= MAX_FAILURES) return { ok: false, code: 'too-many-tries' }
      const stored = userId ? await store.get(`password:${userId}`) : null
      decoy ??= await hashPassword('decoy-password', iterations)
      const ok = await verifyPassword(String(password ?? ''), stored?.hash ?? decoy)
      if (ok && stored) {
        await store.delete(`pwfail:${email}`)
        return { ok: true }
      }
      await store.put(`pwfail:${email}`, { count: failures.count + 1 }, { ttl: FAILURE_WINDOW_SECONDS })
      return { ok: false, code: 'bad-password' }
    },

    async verify(userId, password) {
      const stored = await store.get(`password:${userId}`)
      return Boolean(stored) && verifyPassword(String(password ?? ''), stored.hash)
    },
  }
}

export async function hashPassword(password, iterations = 100_000) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2-sha256$${iterations}$${base64Url(salt)}$${base64Url(await derive(password, salt, iterations))}`
}

export async function verifyPassword(password, stored) {
  const [scheme, rounds, salt, hash] = String(stored).split('$')
  if (scheme !== 'pbkdf2-sha256') return false
  return safeEqual(base64Url(await derive(password, fromBase64Url(salt), Number(rounds))), hash)
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

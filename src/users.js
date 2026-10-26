import { base64Url } from './util.js'

/**
 * People. A user is just `{ id, email, createdAt }`; keep anything else about them in
 * your own tables, keyed by `user.id`.
 *
 *   user:<id>      the user
 *   email:<email>  -> id
 *
 * @param {import('./index.js').Store} store
 * @param {undefined | string[] | ((email: string) => boolean | Promise<boolean>)} allow
 */
export function createUsers(store, allow) {
  const list = Array.isArray(allow) ? allow.map((e) => e.trim().toLowerCase()) : null

  async function allowed(email) {
    if (typeof allow === 'function') return Boolean(await allow(email))
    if (!list) return true
    // "@family.com" lets in anyone at that domain.
    return list.includes(email) || list.some((entry) => entry.startsWith('@') && email.endsWith(entry))
  }

  return {
    allowed,

    async byId(id) {
      return store.get(`user:${id}`)
    },

    async byEmail(email) {
      const id = await store.get(`email:${normalizeEmail(email)}`)
      return id ? store.get(`user:${id}`) : null
    },

    /** The user with this email, created on first sign-in. Null when they aren't allowed in. */
    async signIn(rawEmail) {
      const email = normalizeEmail(rawEmail)
      if (!(await allowed(email))) return null
      const existing = await this.byEmail(email)
      if (existing) return existing
      const user = { id: `usr_${base64Url(crypto.getRandomValues(new Uint8Array(15)))}`, email, createdAt: Date.now() }
      await store.put(`user:${user.id}`, user)
      await store.put(`email:${email}`, user.id)
      return user
    },
  }
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

/** Deliberately loose: one @, something either side, a dot in the domain, no spaces. */
export function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

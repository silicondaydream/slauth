import { randomId } from './util.js'

/**
 * People.
 *
 *   user:<id>      { id, email, name, image, roles, metadata, privateMetadata, createdAt, updatedAt, bannedAt }
 *   email:<email>  -> id
 *
 * `metadata` is yours to fill and is sent to the browser; `privateMetadata` never leaves
 * the server. Anything bigger belongs in your own tables, keyed by `user.id`.
 *
 * @param {import('./index.js').Store} store
 * @param {undefined | string[] | ((email: string, context: object) => boolean | Promise<boolean>)} allow
 */
export function createUsers(store, allow) {
  const list = Array.isArray(allow) ? allow.map((e) => e.trim().toLowerCase()) : null

  async function allowed(email, context = {}) {
    if (typeof allow === 'function') return Boolean(await allow(email, context))
    if (!list) return true
    // "@family.com" lets in anyone at that domain.
    return list.includes(email) || list.some((entry) => entry.startsWith('@') && email.endsWith(entry))
  }

  async function byId(id) {
    if (typeof id !== 'string') return null
    const user = await store.get(`user:${id}`)
    return user ? withDefaults(user) : null
  }

  async function byEmail(email) {
    const id = await store.get(`email:${normalizeEmail(email)}`)
    return id ? byId(id) : null
  }

  /** Makes a user; no allow-list check, so it's for sign-in flows that already did one, and for admins. */
  async function create({ email: rawEmail, name = null, image = null, roles = [], metadata = {}, privateMetadata = {} }) {
    const email = normalizeEmail(rawEmail)
    if (!validEmail(email)) throw new Error(`slauth: "${rawEmail}" isn't an email address.`)
    if (await store.get(`email:${email}`)) throw new Error(`slauth: there's already a user with ${email}.`)
    const now = Date.now()
    const user = { id: randomId('usr'), email, name, image, roles, metadata, privateMetadata, createdAt: now, updatedAt: now, bannedAt: null }
    await store.put(`user:${user.id}`, user)
    await store.put(`email:${email}`, user.id)
    return user
  }

  /** Changes what's given; `email` moves the email index too. Returns the new user, or null. */
  async function update(id, patch) {
    const user = await byId(id)
    if (!user) return null
    const next = { ...user, updatedAt: Date.now() }
    for (const key of ['name', 'image', 'roles', 'metadata', 'privateMetadata', 'bannedAt']) if (patch[key] !== undefined) next[key] = patch[key]
    if (patch.email !== undefined) {
      const email = normalizeEmail(patch.email)
      if (!validEmail(email)) throw new Error(`slauth: "${patch.email}" isn't an email address.`)
      if (email !== user.email) {
        const owner = await store.get(`email:${email}`)
        if (owner && owner !== id) throw new Error(`slauth: there's already a user with ${email}.`)
        await store.put(`email:${email}`, id)
        await store.delete(`email:${user.email}`)
        next.email = email
      }
    }
    await store.put(`user:${id}`, next)
    return next
  }

  return {
    allowed,
    byId,
    byEmail,
    create,
    update,

    /**
     * The user with this email, made on first sign-in. Null when they aren't allowed in.
     * `profile` fills in a name and picture the first time (e.g. from GitHub).
     */
    async signIn(rawEmail, context = {}, profile = {}) {
      const email = normalizeEmail(rawEmail)
      if (!(await allowed(email, context))) return null
      const existing = await byEmail(email)
      if (existing) {
        const fill = {}
        if (!existing.name && profile.name) fill.name = profile.name
        if (!existing.image && profile.image) fill.image = profile.image
        return Object.keys(fill).length ? update(existing.id, fill) : existing
      }
      const user = await create({ email, name: profile.name ?? null, image: profile.image ?? null })
      return { ...user, isNew: true }
    },

    /** Forgets the user record and email; core.js removes everything hanging off it. */
    async remove(user) {
      await store.delete(`email:${user.email}`)
      await store.delete(`user:${user.id}`)
    },

    /** Every user, a page at a time. Needs a store with list() (all the built-in ones). */
    async list({ limit = 100, cursor } = {}) {
      if (typeof store.list !== 'function') throw new Error("slauth: listing users needs a store with list(); the built-in stores all have one.")
      const page = await store.list('user:', { limit, cursor })
      return { users: page.items.map((item) => withDefaults(item.value)), cursor: page.cursor }
    },
  }
}

/** Users saved by slauth 1.0 only had { id, email, createdAt }. */
function withDefaults(user) {
  return { name: null, image: null, roles: [], metadata: {}, privateMetadata: {}, updatedAt: user.createdAt, bannedAt: null, ...user }
}

/** What the browser (and your app, via auth.user) sees. */
export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null, roles: user.roles ?? [], metadata: user.metadata ?? {}, createdAt: user.createdAt }
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

/** Deliberately loose: one @, something either side, a dot in the domain, no spaces. */
export function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

import { base64Url, randomToken, readCookie, serializeCookie, sha256 } from './util.js'

const DAY = 24 * 60 * 60

/**
 * Sessions: a random token in an HttpOnly cookie (or, for apps that can't keep cookies,
 * sent as `Authorization: Bearer <token>`). Only a SHA-256 of the token is stored, so a
 * leaked database can't be used to sign in. Sessions slide: each day someone uses the
 * app, the 30 days start again.
 *
 *   session:<id>      { userId, createdAt, refreshedAt, method, userAgent, ip, impersonatorId, orgId? }
 *   sessions:<userId> -> [id, ...]   (so people can see and end their other sessions)
 *
 * The id is the hash, which is safe to show: it can't be turned back into the token.
 *
 * @param {{ store: import('./index.js').Store, cookie: string, days: number }} options
 */
export function createSessions({ store, cookie, days }) {
  const ttl = days * DAY
  const idFor = async (token) => base64Url(await sha256(token))
  const secure = (request) => new URL(request.url).protocol === 'https:'

  function tokenFrom(request) {
    const auth = request.headers.get('authorization')
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null
    // A JWT (two dots) is for auth.verifyToken, not a session.
    const token = bearer && bearer.split('.').length !== 3 ? bearer : readCookie(request.headers.get('cookie'), cookie)
    return token && token.length <= 128 ? token : null
  }

  async function index(userId, change) {
    const ids = (await store.get(`sessions:${userId}`)) ?? []
    const next = change(ids)
    if (next.length) await store.put(`sessions:${userId}`, next)
    else await store.delete(`sessions:${userId}`)
  }

  async function revoke(userId, id) {
    await store.delete(`session:${id}`)
    await index(userId, (ids) => ids.filter((x) => x !== id))
  }

  return {
    cookieName: cookie,

    /**
     * Starts a session. Returns the token and the Set-Cookie value that carries it.
     * @param {string} userId
     * @param {Request} request
     * @param {{ method?: string, impersonatorId?: string }} [details]
     */
    async create(userId, request, { method = 'unknown', impersonatorId = null } = {}) {
      const token = randomToken()
      const id = await idFor(token)
      const now = Date.now()
      const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 300) || null
      const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? null
      await store.put(`session:${id}`, { userId, createdAt: now, refreshedAt: now, method, userAgent, ip, impersonatorId }, { ttl })
      // At most 50 at once: the oldest is signed out to make room.
      const ids = (await store.get(`sessions:${userId}`)) ?? []
      for (const old of ids.slice(0, Math.max(0, ids.length - 49))) await store.delete(`session:${old}`)
      await store.put(`sessions:${userId}`, [...ids.slice(-49), id])
      return { id, token, cookie: serializeCookie(cookie, token, { maxAge: ttl, secure: secure(request) }) }
    },

    /** The session behind this request, or null. */
    async read(request) {
      const token = tokenFrom(request)
      if (!token) return null
      const id = await idFor(token)
      const session = await store.get(`session:${id}`)
      if (!session) return null
      // A session from slauth 1.x: add it to the index, so revoking and banning reach it.
      if (!('method' in session)) {
        const left = Math.ceil((session.refreshedAt + ttl * 1000 - Date.now()) / 1000)
        if (left <= 0) return null
        Object.assign(session, { method: null, userAgent: null, ip: null, impersonatorId: null })
        await store.put(`session:${id}`, session, { ttl: left })
        const ids = (await store.get(`sessions:${session.userId}`)) ?? []
        if (!ids.includes(id)) await store.put(`sessions:${session.userId}`, [...ids.slice(-49), id])
      }
      return { ...session, id, token }
    },

    /** Changes a session's own fields (like the active organization), keeping its expiry. */
    async update(session, patch) {
      const { token, id, ...value } = session
      const left = Math.ceil((value.refreshedAt + ttl * 1000 - Date.now()) / 1000)
      if (left <= 0) return false
      await store.put(`session:${id}`, { ...value, ...patch }, { ttl: left })
      return true
    },

    /** Restarts the 30 days at most once a day; returns a Set-Cookie value when it did. */
    async refresh(session, request) {
      if (Date.now() - session.refreshedAt < DAY * 1000) return null
      const { token, id, ...value } = session
      await store.put(`session:${id}`, { ...value, refreshedAt: Date.now() }, { ttl })
      return serializeCookie(cookie, token, { maxAge: ttl, secure: secure(request) })
    },

    /** Ends this request's session; returns the Set-Cookie value that clears it. */
    async destroy(request) {
      const session = await this.read(request)
      if (session) await revoke(session.userId, session.id)
      return this.clear(request)
    },

    clear(request) {
      return serializeCookie(cookie, '', { maxAge: 0, secure: secure(request) })
    },

    /** Someone's live sessions, newest first. */
    async list(userId) {
      const ids = (await store.get(`sessions:${userId}`)) ?? []
      const out = []
      for (const id of ids) {
        const s = await store.get(`session:${id}`)
        if (s && s.userId === userId) out.push({ id, createdAt: s.createdAt, lastActiveAt: s.refreshedAt, method: s.method ?? null, userAgent: s.userAgent ?? null, ip: s.ip ?? null, impersonatorId: s.impersonatorId ?? null })
      }
      if (out.length !== ids.length) await index(userId, () => out.map((s) => s.id))
      return out.sort((a, b) => b.createdAt - a.createdAt)
    },

    /** Ends one of someone's sessions. Returns false when there was no such session. */
    async revoke(userId, id) {
      const s = typeof id === 'string' ? await store.get(`session:${id}`) : null
      if (!s || s.userId !== userId) return false
      await revoke(userId, id)
      return true
    },

    /** Ends all of someone's sessions, except `keepId` if given. */
    async revokeAll(userId, keepId = null) {
      const ids = (await store.get(`sessions:${userId}`)) ?? []
      for (const id of ids) if (id !== keepId) await store.delete(`session:${id}`)
      await index(userId, () => (keepId && ids.includes(keepId) ? [keepId] : []))
    },
  }
}

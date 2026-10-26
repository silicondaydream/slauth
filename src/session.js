import { base64Url, randomToken, readCookie, serializeCookie, sha256 } from './util.js'

const DAY = 24 * 60 * 60

/**
 * Sessions: a random token in an HttpOnly cookie. Only a SHA-256 of the token is
 * stored, so a leaked database can't be used to sign in. Sessions slide: each day
 * someone uses the app, the 30 days start again.
 *
 * @param {{ store: import('./index.js').Store, cookie: string, days: number }} options
 */
export function createSessions({ store, cookie, days }) {
  const ttl = days * DAY
  const keyFor = async (token) => `session:${base64Url(await sha256(token))}`
  const secure = (request) => new URL(request.url).protocol === 'https:'

  return {
    /** Starts a session; returns the Set-Cookie value. */
    async create(userId, request) {
      const token = randomToken()
      const now = Date.now()
      await store.put(await keyFor(token), { userId, createdAt: now, refreshedAt: now }, { ttl })
      return serializeCookie(cookie, token, { maxAge: ttl, secure: secure(request) })
    },

    /** The session behind this request, or null. */
    async read(request) {
      const token = readCookie(request.headers.get('cookie'), cookie)
      if (!token || token.length > 128) return null
      const session = await store.get(await keyFor(token))
      return session ? { ...session, token } : null
    },

    /** Restarts the 30 days at most once a day; returns a Set-Cookie value when it did. */
    async refresh(session, request) {
      if (Date.now() - session.refreshedAt < DAY * 1000) return null
      const { token, ...value } = session
      await store.put(await keyFor(token), { ...value, refreshedAt: Date.now() }, { ttl })
      return serializeCookie(cookie, token, { maxAge: ttl, secure: secure(request) })
    },

    /** Ends this request's session; returns the Set-Cookie value that clears it. */
    async destroy(request) {
      const token = readCookie(request.headers.get('cookie'), cookie)
      if (token && token.length <= 128) await store.delete(await keyFor(token))
      return serializeCookie(cookie, '', { maxAge: 0, secure: secure(request) })
    },
  }
}

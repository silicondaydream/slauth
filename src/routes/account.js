import { publicUser } from '../users.js'
import { json } from '../util.js'

/**
 * The signed-in person's own account: the session, their profile, their other
 * sessions, linked providers, and tokens for your APIs.
 *
 * @param {object} app  the shared context from core.js
 */
export function accountRoutes(app) {
  const { store, sessions, users, lock, tokens } = app

  return async function route({ route, method, request, url, body }) {
    if (route === 'session' && method === 'GET') {
      const me = await app.current(request)
      const headers = {}
      if (me?.session) {
        const refreshed = await sessions.refresh(me.session, request)
        if (refreshed) headers['Set-Cookie'] = refreshed
      }
      const out = { user: me ? publicUser(me.user) : null }
      if (me?.session?.impersonatorId) out.impersonatorId = me.session.impersonatorId
      if (!me && app.twoFactor && (await app.pending(request))) out.twoFactor = 'pending'
      if (lock && me) out.lock = (await lock.handle('session', 'GET', body, { email: me.user.email, userId: me.user.id }, request.headers.get('cookie'), url.protocol === 'https:')).body
      return json(out, 200, headers)
    }

    // What the sign-in box should offer.
    if (route === 'config' && method === 'GET') {
      return json({
        appName: app.appName,
        emailCodes: true,
        magicLinks: Boolean(app.magicLinks),
        passkeys: app.passkeys !== false,
        passwords: Boolean(app.passwords),
        twoFactor: Boolean(app.twoFactor),
        organizations: Boolean(app.orgs),
        providers: app.providers.map((p) => ({ id: p.id, name: p.name })),
        challenge: Boolean(app.config.challenge),
      })
    }

    if (route === 'signout' && method === 'POST') {
      const me = await app.current(request)
      const cookie = await sessions.destroy(request)
      if (me) await app.emit('signOut', { user: publicUser(me.user), request })
      return json({ ok: true }, 200, { 'Set-Cookie': cookie })
    }

    if (route === 'jwks.json' && method === 'GET' && tokens) {
      return new Response(JSON.stringify(await tokens.jwks()), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } })
    }

    const mine = new Set(['sessions', 'sessions/revoke', 'sessions/revoke-others', 'user', 'user/delete', 'accounts', 'accounts/unlink', 'token'])
    if (!mine.has(route)) return

    const me = await app.signedIn(request)
    if (me instanceof Response) return me
    const { user, session } = me

    if (route === 'token' && method === 'GET' && tokens) {
      return json(await tokens.create(publicUser(user)))
    }

    if (route === 'sessions' && method === 'GET') {
      const list = await sessions.list(user.id)
      return json({ sessions: list.map((s) => ({ ...s, current: s.id === session?.id })) })
    }

    if (route === 'sessions/revoke' && method === 'POST') {
      const { id } = await body()
      if (!(await sessions.revoke(user.id, id))) return json({ error: 'No such session.', code: 'not-found' }, 404)
      return json({ ok: true })
    }

    if (route === 'sessions/revoke-others' && method === 'POST') {
      await sessions.revokeAll(user.id, session?.id)
      return json({ ok: true })
    }

    if (route === 'user' && method === 'POST') {
      const input = await body()
      const patch = {}
      if (input.name !== undefined) {
        if (input.name !== null && typeof input.name !== 'string') return json({ error: 'A name is text.', code: 'bad-request' }, 400)
        patch.name = input.name?.trim().slice(0, 100) || null
      }
      if (input.image !== undefined) {
        if (input.image !== null && !(typeof input.image === 'string' && /^https:\/\/\S+$/.test(input.image) && input.image.length <= 2000)) {
          return json({ error: 'A picture is an https:// link.', code: 'bad-request' }, 400)
        }
        patch.image = input.image
      }
      const updated = await users.update(user.id, patch)
      await app.emit('userUpdated', { user: publicUser(updated) })
      return json({ user: publicUser(updated) })
    }

    if (route === 'user/delete' && method === 'POST') {
      if (app.config.allowDeletion === false) return json({ error: "Accounts can't be deleted here.", code: 'not-found' }, 404)
      if (!app.fresh(session)) return app.reauth()
      await app.deleteUser(user.id)
      return json({ ok: true }, 200, { 'Set-Cookie': sessions.clear(request) })
    }

    if (route === 'accounts' && method === 'GET') {
      const out = []
      for (const key of (await store.get(`accounts:${user.id}`)) ?? []) {
        const doc = await store.get(`account:${key}`)
        if (doc) out.push({ provider: doc.provider, name: app.providers.find((p) => p.id === doc.provider)?.name ?? doc.provider, email: doc.email ?? null, username: doc.name ?? null, createdAt: doc.createdAt })
      }
      return json({
        accounts: out,
        password: app.passwords ? await app.passwords.has(user.id) : false,
        twoFactor: app.twoFactor ? await app.twoFactor.enabled(user.id) : false,
      })
    }

    if (route === 'accounts/unlink' && method === 'POST') {
      const { provider } = await body()
      const keys = (await store.get(`accounts:${user.id}`)) ?? []
      const key = keys.find((k) => k.split(':')[0] === provider)
      if (!key) return json({ error: "That account isn't linked.", code: 'not-found' }, 404)
      await store.delete(`account:${key}`)
      const rest = keys.filter((k) => k !== key)
      if (rest.length) await store.put(`accounts:${user.id}`, rest)
      else await store.delete(`accounts:${user.id}`)
      return json({ ok: true })
    }
  }
}

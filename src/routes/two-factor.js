import { publicUser } from '../users.js'
import { json, serializeCookie } from '../util.js'

const MAX_TRIES = 5

/**
 * Two-factor sign-in, when `twoFactor` is on. After the first step (a code, a link, a
 * password or a provider) someone with an authenticator app set up gets
 * `{ twoFactor: true }` instead of a session, and finishes here.
 *
 *   POST two-factor/verify    { code } or { recoveryCode }  (+ pendingToken for apps)
 *   POST two-factor/setup     → { secret, uri }   (signed in, recently)
 *   POST two-factor/enable    { code } → { recoveryCodes }
 *   POST two-factor/disable   { code } or { recoveryCode }
 *   POST two-factor/recovery-codes  { code } → { recoveryCodes }   (a fresh set)
 *
 *   2fa:<sha256 of token>  { userId, method, tries }   (lives 10 minutes)
 *
 * Passkeys skip this step: a passkey is already something you have and something you are.
 *
 * @param {object} app  the shared context from core.js
 */
export function twoFactorRoutes(app) {
  const { store, users, twoFactor, limits } = app

  return async function route({ route, method, request, body }) {
    if (!route.startsWith('two-factor/')) return
    if (!twoFactor) return json({ error: 'Two-factor sign-in is turned off.', code: 'not-found' }, 404)
    if (method !== 'POST') return
    const input = await body()
    const clearPending = serializeCookie(app.pendingCookie, '', { maxAge: 0, secure: app.secure(request) })

    if (route === 'two-factor/verify') {
      const wait = await limits.check('two-factor/verify', request)
      if (wait) return json({ error: `Too many tries. Please wait ${wait}s.`, code: 'slow-down', retryAfter: wait }, 429)
      const pending = await app.pending(request, typeof input.pendingToken === 'string' ? input.pendingToken : undefined)
      if (!pending) return json({ error: 'That sign-in has expired. Please start again.', code: 'expired' }, 410, { 'Set-Cookie': clearPending })
      const ok = await twoFactor.check(pending.userId, { code: input.code, recoveryCode: input.recoveryCode })
      if (!ok) {
        const tries = pending.tries + 1
        const { key, ...doc } = pending
        if (tries >= MAX_TRIES) {
          await store.delete(key)
          return json({ error: 'Too many tries. Please start again.', code: 'too-many-tries' }, 410, { 'Set-Cookie': clearPending })
        }
        await store.put(key, { ...doc, tries }, { ttl: 10 * 60 })
        return json({ error: 'That code is wrong.', code: 'bad-code', triesLeft: MAX_TRIES - tries }, 400)
      }
      await store.delete(pending.key)
      const found = await users.byId(pending.userId)
      if (!found || found.bannedAt) return json({ error: "This account can't sign in.", code: 'banned' }, 403, { 'Set-Cookie': clearPending })
      const made = await app.sessions.create(found.id, request, { method: `${pending.method}+totp` })
      await app.noticeSignIn(found, request, { method: pending.method, sessionId: made.id, isNew: pending.isNew })
      await app.emit('signIn', { user: publicUser(found), method: pending.method, request })
      const extra = input.recoveryCode ? { recoveryCodesLeft: await twoFactor.recoveryLeft(found.id) } : {}
      if (request.headers.get('x-slauth-transport') === 'bearer') return json({ user: publicUser(found), token: made.token, ...extra })
      const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      headers.append('Set-Cookie', made.cookie)
      headers.append('Set-Cookie', clearPending)
      return new Response(JSON.stringify({ user: publicUser(found), ...extra }), { headers })
    }

    const me = await app.signedIn(request)
    if (me instanceof Response) return me
    const userId = me.user.id

    if (route === 'two-factor/setup') {
      if (await twoFactor.enabled(userId)) return json({ error: 'Two-factor sign-in is already on.', code: 'two-factor-on' }, 409)
      if (!app.fresh(me.session)) return app.reauth()
      return json(await twoFactor.setup(me.user))
    }

    if (route === 'two-factor/enable') {
      const recoveryCodes = await twoFactor.enable(userId, input.code)
      if (!recoveryCodes) return json({ error: 'That code is wrong. Check the time on your phone, and try the newest code.', code: 'bad-code' }, 400)
      return json({ ok: true, recoveryCodes })
    }

    if (route === 'two-factor/disable') {
      if (!(await twoFactor.check(userId, input))) return json({ error: 'That code is wrong.', code: 'bad-code' }, 400)
      await twoFactor.disable(userId)
      return json({ ok: true })
    }

    if (route === 'two-factor/recovery-codes') {
      if (!(await twoFactor.check(userId, { code: input.code }))) return json({ error: 'That code is wrong.', code: 'bad-code' }, 400)
      return json({ ok: true, recoveryCodes: await twoFactor.regenerate(userId) })
    }
  }
}

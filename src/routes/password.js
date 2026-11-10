import { normalizeEmail, validEmail } from '../users.js'
import { json } from '../util.js'

/**
 * Passwords, when `passwords` is on.
 *
 *   POST password/signin  { email, password }     sign in
 *   POST password/signup  { email, password }     emails a code; the password is saved once it's used
 *   POST password/set     { password, current? }  add or change (signed in)
 *   POST password/remove  { }                     go back to codes and passkeys (signed in)
 *
 * @param {object} app  the shared context from core.js
 */
export function passwordRoutes(app) {
  const { store, users, passwords, limits, challenge } = app

  return async function route({ route, method, request, url, body }) {
    if (!route.startsWith('password/')) return
    if (!passwords) return json({ error: 'Passwords are turned off.', code: 'not-found' }, 404)
    if (method !== 'POST') return

    if (route === 'password/signin') {
      const input = await body()
      const email = normalizeEmail(input.email)
      if (!validEmail(email)) return json({ error: "That doesn't look like an email address.", code: 'bad-email' }, 400)
      const wait = await limits.check('password/signin', request)
      if (wait) return json({ error: `Too many tries. Please wait ${wait}s.`, code: 'slow-down', retryAfter: wait }, 429)
      const refused = await challenge(route, request, input)
      if (refused) return refused
      const found = await users.byEmail(email)
      const checked = await passwords.check(email, found?.id ?? null, input.password)
      if (!checked.ok) {
        if (checked.code === 'too-many-tries') return json({ error: 'Too many wrong passwords. Sign in with an email code, or wait 15 minutes.', code: 'too-many-tries' }, 429)
        return json({ error: "That email and password don't match.", code: 'bad-password' }, 400)
      }
      if (!(await users.allowed(email, { method: 'password' }))) return json({ error: "That email isn't on the list for this app.", code: 'not-allowed' }, 403)
      return app.reply(await app.complete(found, request, { method: 'password' }), {}, request)
    }

    if (route === 'password/signup') {
      const input = await body()
      const email = normalizeEmail(input.email)
      if (!validEmail(email)) return json({ error: "That doesn't look like an email address.", code: 'bad-email' }, 400)
      const problem = await passwords.problem(input.password)
      if (problem) return json({ error: problem, code: 'weak-password' }, 400)
      const wait = await limits.check('password/signup', request)
      if (wait) return json({ error: `Please wait ${wait}s before trying again.`, code: 'slow-down', retryAfter: wait }, 429)
      const refused = await challenge(route, request, input)
      if (refused) return refused
      if (!(await users.allowed(email, { method: 'password' }))) return json({ error: "That email isn't on the list for this app.", code: 'not-allowed' }, 403)
      // Same answer whether or not they have an account, so this can't be used to find out.
      const sent = await app.sendSignInCode(email, url, input.redirect)
      if (!sent.ok) return json({ error: `Please wait ${sent.retryAfter}s before asking for another code.`, code: 'slow-down', retryAfter: sent.retryAfter }, 429)
      await store.put(`signup:${email}`, { hash: await passwords.hash(input.password) }, { ttl: 10 * 60 })
      return json({ ok: true, verify: 'email' })
    }

    const me = await app.signedIn(request)
    if (me instanceof Response) return me

    if (route === 'password/set') {
      const input = await body()
      const has = await passwords.has(me.user.id)
      // Changing a password takes the old one, or a recent sign-in.
      if (has && input.current !== undefined) {
        if (!(await passwords.verify(me.user.id, input.current))) return json({ error: "That's not your current password.", code: 'bad-password' }, 400)
      } else if (!app.fresh(me.session)) return app.reauth()
      const problem = await passwords.problem(input.password)
      if (problem) return json({ error: problem, code: 'weak-password' }, 400)
      await passwords.set(me.user.id, input.password)
      // Anyone else signed in with the old password is signed out.
      if (has) await app.sessions.revokeAll(me.user.id, me.session?.id)
      return json({ ok: true })
    }

    if (route === 'password/remove') {
      if (!app.fresh(me.session)) return app.reauth()
      await passwords.remove(me.user.id)
      return json({ ok: true })
    }
  }
}

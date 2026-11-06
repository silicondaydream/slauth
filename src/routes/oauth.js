import { normalizeEmail } from '../users.js'
import { json, redirect, safeRedirect, withParams } from '../util.js'

/**
 * "Sign in with GitHub/Google/…".
 *
 *   GET oauth/<provider>?redirect=/somewhere         start signing in
 *   GET oauth/<provider>?link=1&redirect=/settings   link to the signed-in account
 *   GET oauth/<provider>/callback                    where the provider sends people back
 *
 *   account:<provider>:<accountId>  { provider, accountId, userId, email, name, createdAt, tokens? }
 *   accounts:<userId>               ["github:123", ...]
 *
 * Who is it? In order: someone who's linked this account before; the signed-in person,
 * when linking; the user with the same email, when the provider says it's verified;
 * otherwise a new user (if the allow list agrees).
 *
 * @param {object} app  the shared context from core.js
 */
export function oauthRoutes(app) {
  const { store, users, oauth, providers } = app

  return async function route({ route, method, request, url }) {
    if (!route.startsWith('oauth/') || method !== 'GET') return
    const [, id, step] = route.split('/')
    const provider = providers.find((p) => p.id === id)
    if (!provider || (step && step !== 'callback')) return json({ error: 'No such provider.', code: 'not-found' }, 404)
    const callbackUrl = `${app.origin(url)}${app.prefix}/oauth/${provider.id}/callback`
    const secure = app.secure(request)

    if (!step) {
      // Back to the page the button was on when something needs the person (an error, a 2FA code).
      const referer = sameSitePath(request.headers.get('referer'), url)
      const redirectTo = safeRedirect(url.searchParams.get('redirect') ?? referer ?? '/')
      let linkUserId = null
      if (url.searchParams.get('link')) {
        const me = await app.current(request)
        if (!me) return redirect(withParams(app.signInPage ?? referer ?? '/', { slauth_error: 'signed-out' }))
        if (!app.fresh(me.session)) return redirect(withParams(referer ?? redirectTo, { slauth_error: 'reauth-required' }))
        linkUserId = me.user.id
      }
      const started = await oauth.start(provider, { callbackUrl, redirect: redirectTo, returnTo: app.signInPage ?? referer ?? redirectTo, linkUserId, secure })
      return redirect(started.location, [started.cookie])
    }

    const result = await oauth.finish(provider, request, { callbackUrl })
    const back = result.state?.returnTo ?? app.signInPage ?? '/'
    const clear = oauth.clearCookie(secure)
    const fail = (code) => redirect(withParams(back, { slauth_error: code }), [clear])
    if (!result.ok) return fail(result.code)
    const { profile, tokens, state: saved } = result
    const accountKey = `${provider.id}:${profile.id}`
    const linked = await store.get(`account:${accountKey}`)
    const email = profile.email ? normalizeEmail(profile.email) : null
    const context = { method: 'oauth', provider: provider.id, profile }

    let found = null
    if (saved.linkUserId) {
      if (linked && linked.userId !== saved.linkUserId) return fail('account-in-use')
      found = await users.byId(saved.linkUserId)
      if (!found) return fail('signed-out')
    } else if (linked) {
      found = await users.byId(linked.userId)
      if (found && !(await users.allowed(found.email, context))) return fail('not-allowed')
    } else {
      if (!email || !profile.emailVerified) return fail('email-not-verified')
      found = await users.signIn(email, context, { name: profile.name, image: profile.image })
      if (!found) return fail('not-allowed')
    }
    if (!found) return fail('oauth-failed')

    const account = {
      provider: provider.id,
      accountId: profile.id,
      userId: found.id,
      email,
      name: profile.name ?? null,
      createdAt: linked?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      ...(provider.keepTokens ? { tokens: { ...tokens, savedAt: Date.now() } } : {}),
    }
    await store.put(`account:${accountKey}`, account)
    const keys = (await store.get(`accounts:${found.id}`)) ?? []
    if (!keys.includes(accountKey)) {
      // One account per provider per person: linking a second GitHub replaces the first.
      for (const old of keys.filter((k) => k.split(':')[0] === provider.id)) await store.delete(`account:${old}`)
      await store.put(`accounts:${found.id}`, [...keys.filter((k) => k.split(':')[0] !== provider.id), accountKey])
    }

    if (saved.linkUserId) return redirect(withParams(saved.redirect, { slauth_linked: provider.id }), [clear])

    const done = await app.complete(found, request, { method: `oauth:${provider.id}` })
    if (done.kind === 'refused') return fail(done.code)
    if (done.kind === 'two-factor') return redirect(withParams(back, { slauth_step: 'two-factor', redirect: saved.redirect }), [clear, done.cookie])
    return redirect(saved.redirect, [clear, done.cookie])
  }
}

function sameSitePath(referer, url) {
  try {
    const from = new URL(referer)
    return from.origin === url.origin ? from.pathname + from.search : null
  } catch {
    return null
  }
}

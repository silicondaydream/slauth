import { CODE_MINUTES } from '../email-code.js'
import { normalizeEmail, publicUser, validEmail } from '../users.js'
import { base64Url, escapeHtml, json, randomToken, safeRedirect, sha256 } from '../util.js'

const MESSAGES = { expired: 'That code has expired. Ask for a new one.', 'too-many-tries': 'Too many tries. Ask for a new code.', 'bad-code': 'That code is wrong.' }

/**
 * Email codes (and, with magicLinks on, a link in the same email), and changing the
 * address on an account.
 *
 *   link:<sha256 of token>  { email, redirect }   (lives as long as the code)
 *   signup:<email>          { hash }              (a password to set once the code is used)
 *
 * @param {object} app  the shared context from core.js
 */
export function emailRoutes(app) {
  const { store, users, codes, limits } = app
  const notAllowed = () => json({ error: "That email isn't on the list for this app.", code: 'not-allowed' }, 403)
  const badEmail = () => json({ error: "That doesn't look like an email address.", code: 'bad-email' }, 400)
  const slowDown = (retryAfter) => json({ error: `Please wait ${retryAfter}s before trying again.`, code: 'slow-down', retryAfter }, 429)
  const failed = (result) => json({ error: MESSAGES[result.code], code: result.code, triesLeft: result.triesLeft }, result.code === 'bad-code' ? 400 : 410)

  /** Sends a sign-in code (and link) to an address that's allowed in. Shared with password sign-up. */
  async function sendSignInCode(email, url, redirect) {
    let link
    let data = {}
    if (app.magicLinks) {
      const token = randomToken()
      const linkId = base64Url(await sha256(token))
      link = `${app.origin(url)}${app.prefix}/email/link?token=${token}`
      data = { linkId }
      const sent = await codes.start(email, { link, data })
      if (sent.ok) await store.put(`link:${linkId}`, { email, redirect: safeRedirect(redirect, null) }, { ttl: CODE_MINUTES * 60 })
      return sent
    }
    return codes.start(email, { data })
  }
  app.sendSignInCode = sendSignInCode

  return async function route({ route, method, request, url, body }) {
    if (route === 'email/start' && method === 'POST') {
      const input = await body()
      const email = normalizeEmail(input.email)
      if (!validEmail(email)) return badEmail()
      const wait = await limits.check('email/start', request)
      if (wait) return slowDown(wait)
      if (!(await users.allowed(email, { method: 'email' }))) return notAllowed()
      const sent = await sendSignInCode(email, url, input.redirect)
      if (!sent.ok) return slowDown(sent.retryAfter)
      return json({ ok: true })
    }

    if (route === 'email/verify' && method === 'POST') {
      const input = await body()
      const email = normalizeEmail(input.email)
      if (!validEmail(email)) return badEmail()
      const result = await codes.verify(email, input.code)
      if (!result.ok) return failed(result)
      if (result.entry.linkId) await store.delete(`link:${result.entry.linkId}`)
      const found = await users.signIn(email, { method: 'email' })
      if (!found) return notAllowed()
      await finishSignup(found)
      return app.reply(await app.complete(found, request, { method: 'email' }), {}, request)
    }

    // The link in the email opens a page with a button, rather than signing in on GET:
    // mail scanners open links to check them, and would use the link up.
    if (route === 'email/link' && method === 'GET') {
      return new Response(linkPage(app.appName, `${app.prefix}/email/link`), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'" },
      })
    }

    if (route === 'email/link' && method === 'POST') {
      const { token } = await body()
      const linkId = typeof token === 'string' && token.length <= 128 ? base64Url(await sha256(token)) : null
      const link = linkId ? await store.get(`link:${linkId}`) : null
      if (!link) return json({ error: 'That link has expired or was already used. Ask for a new one.', code: 'expired' }, 410)
      await store.delete(`link:${linkId}`)
      const code = await store.get(`code:${link.email}`)
      if (code?.linkId === linkId) await store.delete(`code:${link.email}`)
      const found = await users.signIn(link.email, { method: 'link' })
      if (!found) return notAllowed()
      await finishSignup(found)
      const result = await app.complete(found, request, { method: 'link' })
      const to = result.kind === 'two-factor' ? (app.signInPage ?? link.redirect ?? '/') : (link.redirect ?? '/')
      return app.reply(result, { redirect: to }, request)
    }

    if (route === 'email/change/start' && method === 'POST') {
      const me = await app.signedIn(request)
      if (me instanceof Response) return me
      if (!app.fresh(me.session)) return app.reauth()
      const email = normalizeEmail((await body()).email)
      if (!validEmail(email)) return badEmail()
      if (email === me.user.email) return json({ error: "That's already your email.", code: 'same-email' }, 400)
      if (!(await users.allowed(email, { method: 'email-change', user: publicUser(me.user) }))) return notAllowed()
      if (await users.byEmail(email)) return json({ error: 'Another account uses that email.', code: 'email-taken' }, 409)
      const sent = await codes.start(email, { key: `code-change:${me.user.id}`, kind: 'email-change' })
      if (!sent.ok) return slowDown(sent.retryAfter)
      return json({ ok: true })
    }

    if (route === 'email/change/verify' && method === 'POST') {
      const me = await app.signedIn(request)
      if (me instanceof Response) return me
      const input = await body()
      const email = normalizeEmail(input.email)
      if (!validEmail(email)) return badEmail()
      const result = await codes.verify(email, input.code, { key: `code-change:${me.user.id}` })
      if (!result.ok) return failed(result)
      if (await users.byEmail(email)) return json({ error: 'Another account uses that email.', code: 'email-taken' }, 409)
      const updated = await users.update(me.user.id, { email })
      await app.emit('userUpdated', { user: publicUser(updated) })
      return json({ user: publicUser(updated) })
    }
  }

  /** Someone who signed up with a password has now proved their email: save the password. */
  async function finishSignup(found) {
    const pending = await store.get(`signup:${found.email}`)
    if (!pending) return
    await store.delete(`signup:${found.email}`)
    await store.put(`password:${found.id}`, { hash: pending.hash, updatedAt: Date.now() })
  }
}

function linkPage(appName, endpoint) {
  const name = escapeHtml(appName)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to ${name}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fdf6ec;color:#2b2118;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
main{max-width:360px;margin:16px;background:#fff;border:2px solid #2b2118;border-radius:16px;padding:28px;box-shadow:4px 4px 0 #2b2118;text-align:center}
button{font:inherit;font-weight:700;font-size:16px;background:#f59e0b;color:#2b2118;border:2px solid #2b2118;border-radius:10px;padding:12px 18px;width:100%;cursor:pointer}
p{opacity:.8}.error{color:#c2410c;font-weight:600;opacity:1}</style></head>
<body><main><h1 style="font-size:22px;margin:0 0 8px">Sign in to ${name}</h1><p>You're one tap away.</p>
<button id="go">Continue</button><p id="msg" class="error" role="alert"></p></main>
<script>
const token = new URLSearchParams(location.search).get('token')
document.getElementById('go').addEventListener('click', async (e) => {
  e.target.disabled = true
  const res = await fetch(${JSON.stringify(endpoint)}, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null)
  const data = res ? await res.json().catch(() => ({})) : { error: "Couldn't reach the server." }
  if (res && res.ok) location.replace(data.redirect || '/')
  else { document.getElementById('msg').textContent = data.error || 'Something went wrong.'; e.target.disabled = false }
})
</script></body></html>`
}

import { slauth } from '../src/core.js'
import { memory } from '../src/stores/memory.js'

export const ORIGIN = 'https://app.example'

/** A slauth instance with a mailbox you can read, and a tiny cookie-keeping browser. */
export function setup(config = {}) {
  const mailbox = []
  const auth = slauth({
    secret: 'test-secret-test-secret',
    store: memory(),
    email: { send: async (message) => void mailbox.push(message) },
    appName: 'Test App',
    ...config,
  })
  return { auth, mailbox, browser: () => browser(auth) }
}

export function browser(auth, origin = ORIGIN) {
  const jar = new Map()
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const remember = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';')
      const [name, ...rest] = pair.split('=')
      const value = rest.join('=')
      if (attrs.some((a) => a.trim() === 'Max-Age=0') || value === '') jar.delete(name)
      else jar.set(name, value)
    }
  }
  const request = (method, path, body, headers = {}) =>
    new Request(path.startsWith('http') ? path : `${origin}${path}`, {
      method,
      headers: { cookie: cookieHeader(), ...(body !== undefined ? { 'content-type': 'application/json', origin } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  return {
    jar,
    request,
    async call(method, path, body, headers) {
      const res = await auth.handle(request(method, path, body, headers))
      remember(res)
      const type = res.headers.get('content-type') ?? ''
      return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), res }
    },
    user: () => auth.user(request('GET', '/anything')),
    requireUser: () => auth.requireUser(request('GET', '/anything')),
  }
}

/** Signs `email` in by reading the code from the mailbox. */
export async function signIn(b, mailbox, email) {
  await b.call('POST', '/auth/email/start', { email })
  const code = mailbox.findLast((m) => m.to === email.trim().toLowerCase()).code
  return b.call('POST', '/auth/email/verify', { email, code })
}

/**
 * A pretend OAuth provider: hand its `fetch` to slauth, send the browser to
 * `authorize(location)` as if the person clicked "Allow", and it checks PKCE and the
 * client secret like a real one.
 */
export async function fakeProvider(oauth2, profile, options = {}) {
  const codes = new Map()
  const issued = new Map()
  const state = { profile }
  const sha = async (text) => {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  const provider = oauth2({
    id: 'fake',
    name: 'Fake',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    authorization: 'https://fake.example/authorize',
    token: 'https://fake.example/token',
    scope: 'email',
    async profile(tokens, doFetch) {
      return (await doFetch('https://fake.example/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json()
    },
    ...options,
  })
  async function fetch(url, init = {}) {
    const u = new URL(url)
    if (u.pathname === '/token') {
      const form = new URLSearchParams(String(init.body))
      const saved = codes.get(form.get('code'))
      codes.delete(form.get('code'))
      if (!saved || form.get('client_secret') !== 'client-secret' || form.get('redirect_uri') !== saved.redirectUri || (await sha(form.get('code_verifier') ?? '')) !== saved.challenge) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 })
      }
      const token = `at_${Math.random().toString(36).slice(2)}`
      issued.set(token, saved.profile)
      return Response.json({ access_token: token, token_type: 'bearer', refresh_token: 'rt_1' })
    }
    if (u.pathname === '/me') {
      const profile = issued.get(new Headers(init.headers).get('authorization')?.slice(7))
      return profile ? Response.json(profile) : new Response('no', { status: 401 })
    }
    return new Response('not found', { status: 404 })
  }
  return {
    provider,
    fetch,
    state,
    /** The provider's answer to "Allow": the callback URL with a code. */
    authorize(location) {
      const u = new URL(location)
      const code = `code_${Math.random().toString(36).slice(2)}`
      codes.set(code, { challenge: u.searchParams.get('code_challenge'), redirectUri: u.searchParams.get('redirect_uri'), profile: state.profile })
      return `${u.searchParams.get('redirect_uri')}?code=${code}&state=${u.searchParams.get('state')}`
    },
  }
}

/** Runs the whole provider round trip in browser `b`; returns the final redirect response. */
export async function providerSignIn(b, fake, start = '/auth/oauth/fake?redirect=/home') {
  const begin = await b.call('GET', start)
  if (begin.status !== 302 || !begin.res.headers.get('location').startsWith('https://fake.example/')) return begin
  return b.call('GET', fake.authorize(begin.res.headers.get('location')))
}

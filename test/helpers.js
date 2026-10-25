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
    new Request(`${origin}${path}`, {
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
      return { status: res.status, body: await res.json(), res }
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

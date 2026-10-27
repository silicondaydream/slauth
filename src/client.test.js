import { describe, expect, it } from 'vitest'
import { createClient, SlauthError } from './client.js'
import { setup, ORIGIN } from '../test/helpers.js'

/** A fetch that goes straight to auth.handle and keeps cookies, like a browser tab. */
function tab(auth) {
  let cookie = ''
  return async (path, init = {}) => {
    const headers = new Headers(init.headers)
    if (cookie) headers.set('cookie', cookie)
    if (init.method === 'POST') headers.set('origin', ORIGIN)
    const res = await auth.handle(new Request(`${ORIGIN}${path}`, { ...init, headers }))
    const set = res.headers.getSetCookie()[0]
    if (set) cookie = set.includes('Max-Age=0') ? '' : set.split(';')[0]
    return res
  }
}

describe('client', () => {
  it('signs in, reads the session and signs out', async () => {
    const { auth, mailbox } = setup()
    const client = createClient({ fetch: tab(auth) })
    expect((await client.session()).user).toBeNull()
    await client.email.start('me@example.com')
    const { user } = await client.email.verify('me@example.com', mailbox[0].code)
    expect(user.email).toBe('me@example.com')
    expect((await client.session()).user.email).toBe('me@example.com')
    await client.signOut()
    expect((await client.session()).user).toBeNull()
  })

  it('throws SlauthError with a code to switch on', async () => {
    const { auth, mailbox } = setup()
    const client = createClient({ fetch: tab(auth) })
    await client.email.start('me@example.com')
    const wrong = mailbox[0].code === '000001' ? '000002' : '000001'
    const error = await client.email.verify('me@example.com', wrong).catch((e) => e)
    expect(error).toBeInstanceOf(SlauthError)
    expect(error.code).toBe('bad-code')
    expect(error.triesLeft).toBe(4)
  })

  it('reports being offline', async () => {
    const client = createClient({ fetch: async () => { throw new TypeError('network') } })
    expect((await client.session().catch((e) => e)).code).toBe('offline')
  })
})

describe('client, going deeper', () => {
  it('works without cookies, keeping a bearer token', async () => {
    const { auth, mailbox } = setup()
    let saved = null
    const bare = async (path, init = {}) => {
      const headers = new Headers(init.headers)
      if (init.method === 'POST') headers.set('origin', ORIGIN)
      return auth.handle(new Request(`${ORIGIN}${path}`, { ...init, headers }))
    }
    const client = createClient({ fetch: bare, token: { get: () => saved, set: (t) => void (saved = t) } })
    await client.email.start('me@example.com')
    await client.email.verify('me@example.com', mailbox[0].code)
    expect(saved).toBeTruthy()
    expect((await client.session()).user.email).toBe('me@example.com')
    await client.signOut()
    expect(saved).toBeNull()
    expect((await client.session()).user).toBeNull()
  })

  it('reuses a JWT until it is nearly expired', async () => {
    const { auth, mailbox } = setup({ tokens: true })
    let calls = 0
    const fetch = tab(auth)
    const counting = (path, init) => ((calls += path.endsWith('/token') ? 1 : 0), fetch(path, init))
    const client = createClient({ fetch: counting })
    await client.email.start('me@example.com')
    await client.email.verify('me@example.com', mailbox[0].code)
    const first = await client.getToken()
    expect(await client.getToken()).toBe(first)
    expect(calls).toBe(1)
    expect((await auth.verifyToken(first)).email).toBe('me@example.com')
  })

  it('builds provider links', () => {
    const client = createClient({ basePath: '/api/auth/' })
    expect(client.oauth.url('github', { redirect: '/app' })).toBe('/api/auth/oauth/github?redirect=%2Fapp')
  })
})

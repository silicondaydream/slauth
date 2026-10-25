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

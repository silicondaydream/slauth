import { afterEach, describe, expect, it, vi } from 'vitest'
import { slauth } from './core.js'
import { memory } from './stores/memory.js'
import { browser as browserFor, setup, signIn } from '../test/helpers.js'

afterEach(() => vi.useRealTimers())

describe('setup', () => {
  it('explains what is missing', () => {
    expect(() => slauth({ secret: 'x'.repeat(32) })).toThrow(/store/)
    expect(() => slauth({ store: memory(), secret: 'short' })).toThrow(/openssl rand/)
  })
})

describe('email codes', () => {
  it('signs someone in with the code from their email', async () => {
    const { mailbox, browser } = setup()
    const b = browser()
    expect((await b.call('POST', '/auth/email/start', { email: ' Me@Example.com ' })).status).toBe(200)
    expect(mailbox).toHaveLength(1)
    expect(mailbox[0]).toMatchObject({ to: 'me@example.com', appName: 'Test App' })
    expect(mailbox[0].code).toMatch(/^\d{6}$/)
    expect(mailbox[0].subject).toContain(mailbox[0].code)

    const verified = await b.call('POST', '/auth/email/verify', { email: 'me@example.com', code: mailbox[0].code })
    expect(verified.status).toBe(200)
    expect(verified.body.user).toMatchObject({ email: 'me@example.com' })
    expect(verified.res.headers.get('set-cookie')).toMatch(/slauth_session=.+HttpOnly; SameSite=Lax/)
    expect(await b.user()).toEqual(verified.body.user)
    expect((await b.call('GET', '/auth/session')).body.user.email).toBe('me@example.com')
  })

  it('gives the same person the same account every time', async () => {
    const { mailbox, browser } = setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    const first = await signIn(browser(), mailbox, 'me@example.com')
    vi.setSystemTime(Date.now() + 61_000)
    const second = await signIn(browser(), mailbox, 'ME@example.com')
    expect(second.body.user.id).toBe(first.body.user.id)
  })

  it('a code works once', async () => {
    const { mailbox, browser } = setup()
    const b = browser()
    await b.call('POST', '/auth/email/start', { email: 'me@example.com' })
    const code = mailbox[0].code
    expect((await b.call('POST', '/auth/email/verify', { email: 'me@example.com', code })).status).toBe(200)
    expect((await b.call('POST', '/auth/email/verify', { email: 'me@example.com', code })).body.code).toBe('expired')
  })

  it('allows five tries per code', async () => {
    const { mailbox, browser } = setup()
    const b = browser()
    await b.call('POST', '/auth/email/start', { email: 'me@example.com' })
    const wrong = mailbox[0].code === '000000' ? '111111' : '000000'
    const replies = []
    for (let i = 0; i < 5; i++) replies.push((await b.call('POST', '/auth/email/verify', { email: 'me@example.com', code: wrong })).body)
    expect(replies.slice(0, 4).map((r) => r.triesLeft)).toEqual([4, 3, 2, 1])
    expect(replies[4].code).toBe('too-many-tries')
    // Even the right code is refused now.
    expect((await b.call('POST', '/auth/email/verify', { email: 'me@example.com', code: mailbox[0].code })).body.code).toBe('too-many-tries')
  })

  it('codes expire after 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { mailbox, browser } = setup()
    const b = browser()
    await b.call('POST', '/auth/email/start', { email: 'me@example.com' })
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1)
    expect((await b.call('POST', '/auth/email/verify', { email: 'me@example.com', code: mailbox[0].code })).body.code).toBe('expired')
  })

  it('asks people to wait a minute between codes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { mailbox, browser } = setup()
    const b = browser()
    await b.call('POST', '/auth/email/start', { email: 'me@example.com' })
    const again = await b.call('POST', '/auth/email/start', { email: 'me@example.com' })
    expect(again.status).toBe(429)
    expect(again.body).toMatchObject({ code: 'slow-down' })
    vi.setSystemTime(Date.now() + 61_000)
    expect((await b.call('POST', '/auth/email/start', { email: 'me@example.com' })).status).toBe(200)
    expect(mailbox).toHaveLength(2)
  })

  it('refuses things that are not emails', async () => {
    const { browser } = setup()
    expect((await browser().call('POST', '/auth/email/start', { email: 'nope' })).body.code).toBe('bad-email')
  })
})

describe('allow list', () => {
  it('only lets in the people (and domains) on it', async () => {
    const { mailbox, browser } = setup({ allow: ['me@example.com', '@family.com'] })
    expect((await browser().call('POST', '/auth/email/start', { email: 'stranger@else.com' })).body.code).toBe('not-allowed')
    expect(mailbox).toHaveLength(0)
    expect((await signIn(browser(), mailbox, 'me@example.com')).status).toBe(200)
    expect((await signIn(browser(), mailbox, 'sis@family.com')).status).toBe(200)
  })

  it('taking someone off the list signs them out', async () => {
    const list = ['me@example.com']
    const { mailbox, browser } = setup({ allow: (email) => list.includes(email) })
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    expect(await b.user()).not.toBeNull()
    list.pop()
    expect(await b.user()).toBeNull()
  })

  it('takes a function', async () => {
    const { mailbox, browser } = setup({ allow: async (email) => email.endsWith('@ok.dev') })
    expect((await browser().call('POST', '/auth/email/start', { email: 'a@no.dev' })).status).toBe(403)
    expect((await signIn(browser(), mailbox, 'a@ok.dev')).status).toBe(200)
  })
})

describe('sessions', () => {
  it('sign out ends the session for good', async () => {
    const { mailbox, browser } = setup()
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    const token = b.jar.get('slauth_session')
    await b.call('POST', '/auth/signout', {})
    expect(await b.user()).toBeNull()
    // The old cookie, replayed, is dead too.
    b.jar.set('slauth_session', token)
    expect(await b.user()).toBeNull()
  })

  it('ignores made-up cookies', async () => {
    const { browser } = setup()
    const b = browser()
    b.jar.set('slauth_session', 'forged')
    expect(await b.user()).toBeNull()
    expect((await b.call('GET', '/auth/session')).body).toEqual({ user: null })
  })

  it('lasts 30 days after the last visit, not the first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { mailbox, browser } = setup()
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    vi.setSystemTime(Date.now() + 20 * 86_400_000)
    expect((await b.call('GET', '/auth/session')).res.headers.get('set-cookie')).toContain('Max-Age=2592000')
    vi.setSystemTime(Date.now() + 20 * 86_400_000)
    expect(await b.user()).not.toBeNull()
    vi.setSystemTime(Date.now() + 31 * 86_400_000)
    expect(await b.user()).toBeNull()
  })

  it('requireUser hands back a 401 Response when signed out', async () => {
    const { mailbox, browser } = setup()
    const b = browser()
    const out = await b.requireUser()
    expect(out).toBeInstanceOf(Response)
    expect((await out.json()).code).toBe('signed-out')
    await signIn(b, mailbox, 'me@example.com')
    expect((await b.requireUser()).email).toBe('me@example.com')
  })
})

describe('cross-site protection', () => {
  it('refuses posts from other sites and non-JSON posts', async () => {
    const { auth } = setup()
    const post = (headers, body = '{"email":"me@example.com"}') => auth.handle(new Request('https://app.example/auth/email/start', { method: 'POST', headers, body }))
    expect((await post({ 'content-type': 'application/json', origin: 'https://evil.example' })).status).toBe(403)
    expect((await post({ 'content-type': 'application/x-www-form-urlencoded', origin: 'https://app.example' }, 'email=me@example.com')).status).toBe(415)
    expect((await post({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post({ 'content-type': 'application/json', origin: 'https://app.example' })).status).toBe(200)
  })

  it('accepts configured origins', async () => {
    const { auth } = setup({ origins: ['https://app.example', 'https://www.app.example'] })
    const res = await auth.handle(new Request('https://app.example/auth/email/start', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://www.app.example' }, body: '{"email":"me@example.com"}' }))
    expect(res.status).toBe(200)
  })
})

describe('routing', () => {
  it('answers 404 outside its base path and for unknown routes', async () => {
    const { auth } = setup({ basePath: '/api/auth/' })
    expect((await auth.handle(new Request('https://app.example/other'))).status).toBe(404)
    expect((await auth.handle(new Request('https://app.example/api/auth/nope'))).status).toBe(404)
    expect((await auth.handle(new Request('https://app.example/api/auth/session'))).status).toBe(200)
  })

  it('cookies are Secure on https and not on plain http (localhost)', async () => {
    const { mailbox, auth } = setup()
    const local = browserFor(auth, 'http://localhost:8787')
    const reply = await signIn(local, mailbox, 'me@example.com')
    expect(reply.res.headers.get('set-cookie')).not.toContain('Secure')
  })
})

describe('app lock', () => {
  it('requireUser waits for the PIN when someone turned it on', async () => {
    const { mailbox, browser } = setup({ lock: true })
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    // Off by default.
    expect((await b.requireUser()).email).toBe('me@example.com')
    expect((await b.call('GET', '/auth/session')).body.lock).toMatchObject({ policy: 'never', unlocked: true })

    await b.call('POST', '/auth/lock/setup', { pin: '2580', policy: 'always' })
    await b.call('POST', '/auth/lock/logout', {})
    const locked = await b.requireUser()
    expect(locked).toBeInstanceOf(Response)
    expect((await locked.json()).code).toBe('locked')
    expect((await b.call('POST', '/auth/lock/login', { pin: '2580' })).status).toBe(200)
    expect((await b.requireUser()).email).toBe('me@example.com')
  })

  it('lock routes need a signed-in person', async () => {
    const { browser } = setup({ lock: true })
    expect((await browser().call('POST', '/auth/lock/setup', { pin: '2580' })).status).toBe(401)
  })
})

describe('Cloudflare Access', () => {
  it('counts someone signed in by Access as signed in, as the same user as their email', async () => {
    const { mailbox, browser } = setup({ access: { team: 'team', aud: '', devUser: 'me@example.com' } })
    const viaAccess = await browser().user()
    expect(viaAccess.email).toBe('me@example.com')
    const viaCode = await signIn(browser(), mailbox, 'me@example.com')
    expect(viaCode.body.user.id).toBe(viaAccess.id)
  })

  it('still applies the allow list', async () => {
    const { browser } = setup({ allow: ['other@example.com'], access: { team: 'team', aud: '', devUser: 'me@example.com' } })
    expect(await browser().user()).toBeNull()
  })
})

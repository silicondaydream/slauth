import { afterEach, describe, expect, it, vi } from 'vitest'
import { setup, signIn, ORIGIN } from '../test/helpers.js'

afterEach(() => vi.useRealTimers())

describe('sessions on other devices', () => {
  it('lists them, and ends one or all the others', async () => {
    const { browser, mailbox } = setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    const laptop = browser()
    await signIn(laptop, mailbox, 'me@example.com')
    vi.setSystemTime(Date.now() + 61_000)
    const phone = browser()
    await signIn(phone, mailbox, 'me@example.com')
    vi.setSystemTime(Date.now() + 61_000)
    const tablet = browser()
    await signIn(tablet, mailbox, 'me@example.com')

    const { sessions } = (await laptop.call('GET', '/auth/sessions')).body
    expect(sessions).toHaveLength(3)
    expect(sessions.filter((s) => s.current)).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ method: 'email' })

    const phoneId = (await phone.call('GET', '/auth/sessions')).body.sessions.find((s) => s.current).id
    expect((await laptop.call('POST', '/auth/sessions/revoke', { id: phoneId })).status).toBe(200)
    expect(await phone.user()).toBeNull()

    await laptop.call('POST', '/auth/sessions/revoke-others', {})
    expect(await tablet.user()).toBeNull()
    expect(await laptop.user()).not.toBeNull()
  })

  it("can't end someone else's session", async () => {
    const { browser, mailbox } = setup()
    const mine = browser()
    await signIn(mine, mailbox, 'me@example.com')
    const theirs = browser()
    await signIn(theirs, mailbox, 'them@example.com')
    const id = (await theirs.call('GET', '/auth/sessions')).body.sessions[0].id
    expect((await mine.call('POST', '/auth/sessions/revoke', { id })).status).toBe(404)
    expect(await theirs.user()).not.toBeNull()
  })
})

describe('profile', () => {
  it('people can set their name and picture', async () => {
    const { browser, mailbox } = setup()
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    const updated = await b.call('POST', '/auth/user', { name: '  Sam  ', image: 'https://img.example/sam.png' })
    expect(updated.body.user).toMatchObject({ name: 'Sam', image: 'https://img.example/sam.png' })
    expect((await b.call('POST', '/auth/user', { image: 'javascript:alert(1)' })).status).toBe(400)
  })

  it('roles and metadata are set on the server and gate requireUser', async () => {
    const { auth, browser, mailbox } = setup()
    const b = browser()
    const { user } = (await signIn(b, mailbox, 'me@example.com')).body
    expect(await (await b.call('GET', '/auth/session')).body.user).toMatchObject({ roles: [], metadata: {} })
    const denied = await auth.requireUser(b.request('GET', '/admin'), { role: 'admin' })
    expect(denied.status).toBe(403)
    await auth.users.update(user.id, { roles: ['admin'], metadata: { plan: 'pro' }, privateMetadata: { stripe: 'cus_1' } })
    const me = await auth.requireUser(b.request('GET', '/admin'), { role: ['admin', 'staff'] })
    expect(me).toMatchObject({ roles: ['admin'], metadata: { plan: 'pro' } })
    expect(me.privateMetadata).toBeUndefined()
    expect((await auth.users.get(user.id)).privateMetadata).toEqual({ stripe: 'cus_1' })
  })

  it('changing email takes a code sent to the new address', async () => {
    const { auth, browser, mailbox } = setup()
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    await signIn(browser(), mailbox, 'taken@example.com')
    expect((await b.call('POST', '/auth/email/change/start', { email: 'taken@example.com' })).body.code).toBe('email-taken')
    expect((await b.call('POST', '/auth/email/change/start', { email: 'New@Example.com' })).status).toBe(200)
    const sent = mailbox.at(-1)
    expect(sent).toMatchObject({ to: 'new@example.com', kind: 'email-change' })
    const changed = await b.call('POST', '/auth/email/change/verify', { email: 'new@example.com', code: sent.code })
    expect(changed.body.user.email).toBe('new@example.com')
    expect(await auth.users.byEmail('me@example.com')).toBeNull()
    expect((await auth.users.byEmail('new@example.com')).id).toBe(changed.body.user.id)
  })

  it('sensitive changes need a recent sign-in', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { browser, mailbox } = setup()
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    vi.setSystemTime(Date.now() + 20 * 60_000)
    expect((await b.call('POST', '/auth/email/change/start', { email: 'new@example.com' })).body.code).toBe('reauth-required')
    expect((await b.call('POST', '/auth/passkey/register/options', {})).body.code).toBe('reauth-required')
    expect((await b.call('POST', '/auth/user/delete', {})).body.code).toBe('reauth-required')
  })

  it('people can delete their account, and everything goes with it', async () => {
    const deleted = []
    const { auth, browser, mailbox } = setup({ on: { userDeleted: ({ user }) => deleted.push(user.email) } })
    const b = browser()
    const { user } = (await signIn(b, mailbox, 'me@example.com')).body
    expect((await b.call('POST', '/auth/user/delete', {})).status).toBe(200)
    expect(await b.user()).toBeNull()
    expect(await auth.users.get(user.id)).toBeNull()
    expect(await auth.store.get(`sessions:${user.id}`)).toBeNull()
    expect(deleted).toEqual(['me@example.com'])
    // A fresh start, with a new id.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 61_000)
    expect((await signIn(browser(), mailbox, 'me@example.com')).body.user.id).not.toBe(user.id)
  })
})

describe('events', () => {
  it('tells you about sign-ups, sign-ins and sign-outs', async () => {
    const seen = []
    const on = Object.fromEntries(['signUp', 'signIn', 'signOut', 'userUpdated'].map((name) => [name, ({ user, method }) => seen.push([name, user.email, method])]))
    const { browser, mailbox } = setup({ on })
    vi.useFakeTimers({ toFake: ['Date'] })
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    await b.call('POST', '/auth/user', { name: 'Me' })
    await b.call('POST', '/auth/signout', {})
    vi.setSystemTime(Date.now() + 61_000)
    await signIn(browser(), mailbox, 'me@example.com')
    expect(seen).toEqual([
      ['signUp', 'me@example.com', 'email'],
      ['signIn', 'me@example.com', 'email'],
      ['userUpdated', 'me@example.com', undefined],
      ['signOut', 'me@example.com', undefined],
      ['signIn', 'me@example.com', 'email'],
    ])
  })

  it('a handler that throws is logged, not fatal', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { browser, mailbox } = setup({ on: { signIn: () => { throw new Error('webhook down') } } })
    expect((await signIn(browser(), mailbox, 'me@example.com')).status).toBe(200)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('magic links', () => {
  it('the email has a link that signs in, once, after a click', async () => {
    const { browser, mailbox } = setup({ magicLinks: true })
    const b = browser()
    await b.call('POST', '/auth/email/start', { email: 'me@example.com', redirect: '/welcome' })
    const { link, code, html } = mailbox[0]
    expect(code).toMatch(/^\d{6}$/)
    expect(link).toMatch(/^https:\/\/app\.example\/auth\/email\/link\?token=/)
    expect(html).toContain(link)

    // Opening it (as a mail scanner would) doesn't use it up.
    const other = browser()
    const page = await other.call('GET', new URL(link).pathname + new URL(link).search)
    expect(page.res.headers.get('content-type')).toContain('text/html')
    const token = new URL(link).searchParams.get('token')
    const used = await other.call('POST', '/auth/email/link', { token })
    expect(used.body).toMatchObject({ user: { email: 'me@example.com' }, redirect: '/welcome' })
    expect((await other.user()).email).toBe('me@example.com')
    expect((await browser().call('POST', '/auth/email/link', { token })).body.code).toBe('expired')
    // And the code in the same email is spent too.
    expect((await b.call('POST', '/auth/email/verify', { email: 'me@example.com', code })).body.code).toBe('expired')
  })
})

describe('admin', () => {
  it('bans sign a person out and keep them out', async () => {
    const { auth, browser, mailbox } = setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    const b = browser()
    const { user } = (await signIn(b, mailbox, 'me@example.com')).body
    await auth.users.ban(user.id)
    expect(await b.user()).toBeNull()
    vi.setSystemTime(Date.now() + 61_000)
    expect((await signIn(browser(), mailbox, 'me@example.com')).body.code).toBe('banned')
    await auth.users.unban(user.id)
    vi.setSystemTime(Date.now() + 61_000)
    expect((await signIn(browser(), mailbox, 'me@example.com')).status).toBe(200)
  })

  it('creates, lists and impersonates users', async () => {
    const { auth, browser } = setup()
    const made = await auth.users.create({ email: 'Zed@Example.com', name: 'Zed', roles: ['beta'] })
    await auth.users.create({ email: 'amy@example.com' })
    await expect(auth.users.create({ email: 'zed@example.com' })).rejects.toThrow(/already/)
    const { users, cursor } = await auth.users.list({ limit: 1 })
    expect(users).toHaveLength(1)
    expect((await auth.users.list({ cursor })).users).toHaveLength(1)

    const b = browser()
    const { cookie } = await auth.sessions.create(made.id, b.request('GET', '/'), { impersonatorId: 'usr_admin' })
    b.jar.set('slauth_session', cookie.split(';')[0].split('=')[1])
    expect((await b.user()).email).toBe('zed@example.com')
    expect((await b.call('GET', '/auth/session')).body.impersonatorId).toBe('usr_admin')
    expect((await auth.session(b.request('GET', '/'))).session.impersonatorId).toBe('usr_admin')
  })
})

describe('apps without cookies', () => {
  it('get a bearer token when they ask for one', async () => {
    const { auth, mailbox } = setup()
    const post = (path, body) => auth.handle(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-slauth-transport': 'bearer' }, body: JSON.stringify(body) }))
    await post('/auth/email/start', { email: 'me@example.com' })
    const res = await post('/auth/email/verify', { email: 'me@example.com', code: mailbox[0].code })
    expect(res.headers.get('set-cookie')).toBeNull()
    const { token } = await res.json()
    const withToken = new Request(`${ORIGIN}/api`, { headers: { authorization: `Bearer ${token}` } })
    expect((await auth.user(withToken)).email).toBe('me@example.com')
    await auth.handle(new Request(`${ORIGIN}/auth/signout`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}' }))
    expect(await auth.user(withToken)).toBeNull()
  })
})

describe('rate limits', () => {
  it('limits code requests per IP when the host tells us the IP', async () => {
    const { browser } = setup()
    const b = browser()
    const replies = []
    for (let i = 0; i < 11; i++) replies.push(await b.call('POST', '/auth/email/start', { email: `p${i}@example.com` }, { 'cf-connecting-ip': '203.0.113.9' }))
    expect(replies.slice(0, 10).every((r) => r.status === 200)).toBe(true)
    expect(replies[10].body.code).toBe('slow-down')
    // Someone else is fine.
    expect((await b.call('POST', '/auth/email/start', { email: 'x@example.com' }, { 'cf-connecting-ip': '203.0.113.10' })).status).toBe(200)
  })

  it('can be turned off', async () => {
    const { browser } = setup({ rateLimit: false })
    const b = browser()
    for (let i = 0; i < 12; i++) expect((await b.call('POST', '/auth/email/start', { email: `p${i}@example.com` }, { 'cf-connecting-ip': '1.1.1.1' })).status).toBe(200)
  })
})

describe('config route', () => {
  it('says what the sign-in box should offer', async () => {
    const { browser } = setup({ passwords: true, magicLinks: true })
    expect((await browser().call('GET', '/auth/config')).body).toEqual({
      appName: 'Test App',
      emailCodes: true,
      magicLinks: true,
      passkeys: true,
      passwords: true,
      twoFactor: false,
      organizations: false,
      providers: [],
    })
  })
})

describe('upgrading from 1.x', () => {
  it('sessions made by 1.x keep working and can be revoked', async () => {
    const { auth, browser } = setup()
    const user = await auth.users.create({ email: 'me@example.com' })
    // Exactly what slauth 1.x stored: no index, no method.
    const token = 'old-token-from-v1'
    const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    await auth.store.put(`session:${hash}`, { userId: user.id, createdAt: Date.now(), refreshedAt: Date.now() }, { ttl: 30 * 86400 })
    await auth.store.put(`user:${user.id}`, { id: user.id, email: user.email, createdAt: user.createdAt })
    const b = browser()
    b.jar.set('slauth_session', token)
    expect(await b.user()).toMatchObject({ email: 'me@example.com', name: null, roles: [] })
    expect(await auth.sessions.list(user.id)).toHaveLength(1)
    await auth.sessions.revokeAll(user.id)
    expect(await b.user()).toBeNull()
  })
})

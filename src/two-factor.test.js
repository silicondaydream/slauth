import { afterEach, describe, expect, it, vi } from 'vitest'
import { totp } from './two-factor.js'
import { fakeProvider, providerSignIn, setup, signIn } from '../test/helpers.js'
import { oauth2 } from './oauth/providers.js'

afterEach(() => vi.useRealTimers())

/** Signs in and turns on two-factor; returns the secret and recovery codes. */
async function withTwoFactor(config = {}) {
  vi.useFakeTimers({ toFake: ['Date'] })
  const ctx = setup({ twoFactor: true, ...config })
  const b = ctx.browser()
  await signIn(b, ctx.mailbox, 'me@example.com')
  const { secret, uri } = (await b.call('POST', '/auth/two-factor/setup', {})).body
  const enabled = await b.call('POST', '/auth/two-factor/enable', { code: await totp(secret) })
  // Codes are single use: move on to the next 30 seconds.
  vi.setSystemTime(Date.now() + 30_000)
  return { ...ctx, b, secret, uri, recoveryCodes: enabled.body.recoveryCodes, enabled }
}

describe('two-factor sign-in', () => {
  it('matches the RFC 6238 test vector', async () => {
    // The RFC's SHA-1 secret "12345678901234567890" in base32, at T = 59s.
    expect(await totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082')
  })

  it('sets up with an otpauth link and hands out recovery codes', async () => {
    const { uri, recoveryCodes, enabled } = await withTwoFactor()
    expect(enabled.status).toBe(200)
    expect(uri).toMatch(/^otpauth:\/\/totp\/Test%20App%3Ame%40example\.com\?secret=[A-Z2-7]+&issuer=Test%20App/)
    expect(recoveryCodes).toHaveLength(10)
    expect(recoveryCodes[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/)
  })

  it('asks for the app code after an email code', async () => {
    const { browser, mailbox, secret } = await withTwoFactor()
    const b = browser()
    const first = await signIn(b, mailbox, 'me@example.com')
    expect(first.body).toEqual({ twoFactor: true })
    expect(await b.user()).toBeNull()
    expect((await b.call('GET', '/auth/session')).body).toEqual({ user: null, twoFactor: 'pending' })
    const second = await b.call('POST', '/auth/two-factor/verify', { code: await totp(secret) })
    expect(second.status).toBe(200)
    expect((await b.user()).email).toBe('me@example.com')
  })

  it('takes each recovery code once', async () => {
    const { browser, mailbox, recoveryCodes } = await withTwoFactor()
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    const used = await b.call('POST', '/auth/two-factor/verify', { recoveryCode: recoveryCodes[0].toUpperCase() })
    expect(used.body.recoveryCodesLeft).toBe(9)
    vi.setSystemTime(Date.now() + 61_000)
    const again = browser()
    await signIn(again, mailbox, 'me@example.com')
    expect((await again.call('POST', '/auth/two-factor/verify', { recoveryCode: recoveryCodes[0] })).body.code).toBe('bad-code')
  })

  it('refuses a code that was already used', async () => {
    const { browser, mailbox, secret } = await withTwoFactor()
    const code = await totp(secret)
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    expect((await b.call('POST', '/auth/two-factor/verify', { code })).status).toBe(200)
    // Still inside the same 30 seconds, so only replay protection stops it.
    const c = browser()
    await signIn(c, mailbox, 'me@example.com')
    expect((await c.call('POST', '/auth/two-factor/verify', { code })).body.code).toBe('bad-code')
  })

  it('gives five tries, then the sign-in starts over', async () => {
    const { browser, mailbox, secret } = await withTwoFactor()
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    const right = await totp(secret)
    const wrong = right === '000000' ? '111111' : '000000'
    for (let i = 0; i < 4; i++) expect((await b.call('POST', '/auth/two-factor/verify', { code: wrong })).body.code).toBe('bad-code')
    expect((await b.call('POST', '/auth/two-factor/verify', { code: wrong })).body.code).toBe('too-many-tries')
    expect((await b.call('POST', '/auth/two-factor/verify', { code: right })).body.code).toBe('expired')
  })

  it('applies after a provider sign-in too, and sends the person back for the code', async () => {
    const fake = await fakeProvider(oauth2, { id: 'u1', email: 'me@example.com', emailVerified: true })
    const { browser, secret } = await withTwoFactor({ providers: [fake.provider], fetch: fake.fetch })
    const b = browser()
    const back = await providerSignIn(b, fake, '/auth/oauth/fake?redirect=/app')
    expect(back.res.headers.get('location')).toBe('/app?slauth_step=two-factor&redirect=%2Fapp')
    expect(await b.user()).toBeNull()
    await b.call('POST', '/auth/two-factor/verify', { code: await totp(secret) })
    expect(await b.user()).not.toBeNull()
  })

  it('works for apps with tokens instead of cookies', async () => {
    const { auth, mailbox, secret } = await withTwoFactor()
    const post = (path, body) =>
      auth.handle(new Request(`https://app.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-slauth-transport': 'bearer' }, body: JSON.stringify(body) }))
    await post('/auth/email/start', { email: 'me@example.com' })
    const first = await (await post('/auth/email/verify', { email: 'me@example.com', code: mailbox.at(-1).code })).json()
    expect(first.pendingToken).toBeTruthy()
    const second = await (await post('/auth/two-factor/verify', { pendingToken: first.pendingToken, code: await totp(secret) })).json()
    const user = await auth.user(new Request('https://app.example/', { headers: { authorization: `Bearer ${second.token}` } }))
    expect(user.email).toBe('me@example.com')
  })

  it('turning it off takes a code', async () => {
    const { b, browser, mailbox, secret } = await withTwoFactor()
    expect((await b.call('POST', '/auth/two-factor/disable', { code: '000000' })).body.code).toBe('bad-code')
    expect((await b.call('POST', '/auth/two-factor/disable', { code: await totp(secret) })).status).toBe(200)
    vi.setSystemTime(Date.now() + 61_000)
    expect((await signIn(browser(), mailbox, 'me@example.com')).body.user.email).toBe('me@example.com')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { device } from './device.js'
import { totp } from './two-factor.js'
import { setup } from '../test/helpers.js'

afterEach(() => vi.useRealTimers())

const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const MAC_CHROME_NEWER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const WINDOWS_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'

/** Signs in with an email code from a browser with this user agent. */
async function signInFrom(ctx, ua, email = 'me@example.com') {
  const b = ctx.browser()
  const headers = { 'user-agent': ua }
  await b.call('POST', '/auth/email/start', { email }, headers)
  const code = ctx.mailbox.findLast((m) => m.to === email && m.kind === 'sign-in').code
  const reply = await b.call('POST', '/auth/email/verify', { email, code }, headers)
  return { b, reply }
}

const alerts = (mailbox) => mailbox.filter((m) => m.kind === 'new-sign-in')

describe('new sign-in emails', () => {
  it('are off unless turned on', async () => {
    const ctx = setup()
    await signInFrom(ctx, MAC_CHROME)
    await signInFrom(ctx, IPHONE)
    expect(alerts(ctx.mailbox)).toEqual([])
    expect(await ctx.auth.store.get(`devices:${(await ctx.auth.users.byEmail('me@example.com')).id}`)).toBeNull()
  })

  it('email once for a new browser and OS, and not for one already seen', async () => {
    const ctx = setup({ newSignInEmails: { accountPage: '/account' } })
    await signInFrom(ctx, MAC_CHROME)
    expect(alerts(ctx.mailbox)).toEqual([]) // a brand-new account
    await signInFrom(ctx, MAC_CHROME_NEWER) // a newer version is the same family
    expect(alerts(ctx.mailbox)).toEqual([])
    await signInFrom(ctx, IPHONE)
    const [mail] = alerts(ctx.mailbox)
    expect(mail).toMatchObject({ to: 'me@example.com', device: 'Safari on iOS', method: 'email', link: 'https://app.example/account' })
    expect(mail.subject).toBe('New sign-in to Test App from Safari on iOS')
    expect(mail.text).toContain('Safari on iOS')
    await signInFrom(ctx, IPHONE)
    expect(alerts(ctx.mailbox)).toHaveLength(1)
  })

  it('start from existing sessions when turned on later, and stay quiet with none', async () => {
    const { memory } = await import('./stores/memory.js')
    const store = memory()
    const before = setup({ store })
    await signInFrom(before, MAC_CHROME)
    // Turned on now: the Mac session already counts as known.
    const after = setup({ store, newSignInEmails: true })
    await signInFrom(after, MAC_CHROME)
    expect(alerts(after.mailbox)).toEqual([])
    await signInFrom(after, WINDOWS_FIREFOX)
    expect(alerts(after.mailbox).map((m) => m.device)).toEqual(['Firefox on Windows'])
    expect(alerts(after.mailbox)[0].link).toBeUndefined()

    // Someone with no live sessions at all: the first sign-in just starts the list.
    const quiet = setup({ store: memory() })
    await signInFrom(quiet, MAC_CHROME, 'old@example.com')
    const id = (await quiet.auth.users.byEmail('old@example.com')).id
    await quiet.auth.sessions.revokeAll(id)
    const on = setup({ store: quiet.auth.store, newSignInEmails: true })
    await signInFrom(on, IPHONE, 'old@example.com')
    expect(alerts(on.mailbox)).toEqual([])
    expect(await on.auth.store.get(`devices:${id}`)).toEqual(['Safari on iOS'])
  })

  it('wait for the two-factor code before emailing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ctx = setup({ twoFactor: true, newSignInEmails: true })
    const { b } = await signInFrom(ctx, MAC_CHROME)
    const { secret } = (await b.call('POST', '/auth/two-factor/setup', {})).body
    await b.call('POST', '/auth/two-factor/enable', { code: await totp(secret) })
    vi.setSystemTime(Date.now() + 30_000)
    const { b: phone, reply } = await signInFrom(ctx, IPHONE)
    expect(reply.body.twoFactor).toBe(true)
    expect(alerts(ctx.mailbox)).toEqual([])
    await phone.call('POST', '/auth/two-factor/verify', { code: await totp(secret) }, { 'user-agent': IPHONE })
    expect(alerts(ctx.mailbox).map((m) => m.device)).toEqual(['Safari on iOS'])
  })

  it('never block the sign-in when the email fails, and are forgotten with the account', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mailbox = []
    const ctx = setup({
      newSignInEmails: true,
      email: {
        send: async (m) => {
          if (m.kind === 'new-sign-in') throw new Error('mail is down')
          mailbox.push(m)
        },
      },
    })
    const c = { ...ctx, mailbox }
    await signInFrom(c, MAC_CHROME)
    const { reply } = await signInFrom(c, IPHONE)
    expect(reply.status).toBe(200)
    expect(errors).toHaveBeenCalledWith('slauth: the new sign-in email failed:', 'mail is down')
    const id = reply.body.user.id
    expect(await ctx.auth.store.get(`devices:${id}`)).toEqual(['Chrome on macOS', 'Safari on iOS'])
    await ctx.auth.users.delete(id)
    expect(await ctx.auth.store.get(`devices:${id}`)).toBeNull()
    errors.mockRestore()
  })

  it('use your wording when you pass emails()', async () => {
    const ctx = setup({ newSignInEmails: true, emails: (kind, { device: d }) => (kind === 'new-sign-in' ? { subject: `Hi from ${d}`, text: 't', html: 'h' } : null) })
    await signInFrom(ctx, MAC_CHROME)
    await signInFrom(ctx, WINDOWS_FIREFOX)
    expect(alerts(ctx.mailbox)[0].subject).toBe('Hi from Firefox on Windows')
  })

  it('name devices by family only', () => {
    expect(device(MAC_CHROME)).toBe('Chrome on macOS')
    expect(device(IPHONE)).toBe('Safari on iOS')
    expect(device(null)).toBe('Unknown device')
  })
})

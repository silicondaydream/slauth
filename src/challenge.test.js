import { describe, expect, it, vi } from 'vitest'
import { hcaptcha, turnstile } from './challenge.js'
import { setup } from '../test/helpers.js'

/** A pretend siteverify endpoint that accepts the token "good". */
function vendor({ hostname = 'app.example', status = 200 } = {}) {
  const calls = []
  const fetch = async (url, init) => {
    const form = new URLSearchParams(init.body)
    calls.push({ url, secret: form.get('secret'), response: form.get('response'), remoteip: form.get('remoteip') })
    return new Response(JSON.stringify({ success: form.get('response') === 'good', hostname }), { status })
  }
  return { calls, fetch }
}

const email = { email: 'me@example.com' }

describe('challenge', () => {
  it('is off unless configured, and says so in config', async () => {
    const { browser } = setup()
    const b = browser()
    expect((await b.call('POST', '/auth/email/start', email)).status).toBe(200)
    expect((await b.call('GET', '/auth/config')).body.challenge).toBe(false)
  })

  it('needs a passing token on email/start, and sends no email without one', async () => {
    const check = vi.fn(async (_request, token) => token === 'good')
    const { browser, mailbox } = setup({ challenge: check })
    const b = browser()
    expect((await b.call('GET', '/auth/config')).body.challenge).toBe(true)
    const missing = await b.call('POST', '/auth/email/start', email)
    expect(missing.status).toBe(403)
    expect(missing.body.code).toBe('challenge-failed')
    expect((await b.call('POST', '/auth/email/start', { ...email, challenge: 'bad' })).status).toBe(403)
    expect(mailbox).toHaveLength(0)
    expect((await b.call('POST', '/auth/email/start', { ...email, challenge: 'good' })).status).toBe(200)
    expect(mailbox).toHaveLength(1)
    expect(check).toHaveBeenLastCalledWith(expect.any(Request), 'good', { route: 'email/start' })
  })

  it('guards password sign-up and sign-in too', async () => {
    const { browser } = setup({ passwords: { iterations: 1000 }, challenge: (_r, token) => token === 'good' })
    const b = browser()
    const body = { email: 'me@example.com', password: 'long enough' }
    expect((await b.call('POST', '/auth/password/signup', body)).body.code).toBe('challenge-failed')
    expect((await b.call('POST', '/auth/password/signup', { ...body, challenge: 'good' })).status).toBe(200)
    expect((await b.call('POST', '/auth/password/signin', body)).body.code).toBe('challenge-failed')
    // Past the check, a wrong password is just a wrong password.
    expect((await b.call('POST', '/auth/password/signin', { ...body, challenge: 'good' })).body.code).toBe('bad-password')
  })

  it('fails closed when the check throws, without logging the token', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { browser } = setup({ challenge: () => { throw new Error('vendor down') } })
    const reply = await browser().call('POST', '/auth/email/start', { ...email, challenge: 'secret-token-123' })
    expect(reply.body.code).toBe('challenge-failed')
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-token-123')
    errors.mockRestore()
  })

  it('only true counts: truthy values do not', async () => {
    const { browser } = setup({ challenge: () => 'yes' })
    expect((await browser().call('POST', '/auth/email/start', { ...email, challenge: 'x' })).status).toBe(403)
  })

  it('counts against the rate limit before calling the vendor', async () => {
    const check = vi.fn(async () => false)
    const { browser } = setup({ challenge: check, rateLimit: { limits: { 'email/start': [2, 600] } } })
    const b = browser()
    const headers = { 'cf-connecting-ip': '203.0.113.9' }
    for (let i = 0; i < 2; i++) await b.call('POST', '/auth/email/start', { ...email, challenge: 'x' }, headers)
    expect((await b.call('POST', '/auth/email/start', { ...email, challenge: 'x' }, headers)).status).toBe(429)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('turnstile() posts the secret, token and IP to siteverify', async () => {
    const v = vendor()
    const check = turnstile({ secret: 'ts-secret', fetch: v.fetch })
    const request = new Request('https://app.example/auth/email/start', { headers: { 'cf-connecting-ip': '203.0.113.9' } })
    expect(await check(request, 'good')).toBe(true)
    expect(await check(request, 'bad')).toBe(false)
    expect(await check(request, null)).toBe(false)
    expect(v.calls).toHaveLength(2)
    expect(v.calls[0]).toEqual({ url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify', secret: 'ts-secret', response: 'good', remoteip: '203.0.113.9' })
  })

  it('hcaptcha() checks the hostname when asked, and throws on a vendor error', async () => {
    const request = new Request('https://app.example/')
    expect(await hcaptcha({ secret: 's', hostname: 'app.example', fetch: vendor().fetch })(request, 'good')).toBe(true)
    expect(await hcaptcha({ secret: 's', hostname: 'other.example', fetch: vendor().fetch })(request, 'good')).toBe(false)
    await expect(hcaptcha({ secret: 's', fetch: vendor({ status: 500 }).fetch })(request, 'good')).rejects.toThrow()
    expect(vendor().calls).toEqual([])
    expect(() => turnstile({})).toThrow(/secret/)
  })

  it('refuses a challenge that is not a function', () => {
    expect(() => setup({ challenge: true })).toThrow(/function/)
  })
})

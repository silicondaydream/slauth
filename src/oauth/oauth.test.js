import { describe, expect, it } from 'vitest'
import { fakeProvider, providerSignIn, setup, signIn } from '../../test/helpers.js'
import { github, oauth2, oidc } from './providers.js'

async function withFake(profile = { id: 'u1', email: 'me@example.com', emailVerified: true, name: 'Me', image: 'https://img.example/me.png' }, config = {}, providerOptions = {}) {
  const fake = await fakeProvider(oauth2, profile, providerOptions)
  const ctx = setup({ providers: [fake.provider], fetch: fake.fetch, ...config })
  return { ...ctx, fake }
}

describe('sign in with a provider', () => {
  it('sends people to the provider with PKCE and a state, and back signed in', async () => {
    const { browser, fake } = await withFake()
    const b = browser()
    const begin = await b.call('GET', '/auth/oauth/fake?redirect=/home')
    expect(begin.status).toBe(302)
    const to = new URL(begin.res.headers.get('location'))
    expect(to.origin + to.pathname).toBe('https://fake.example/authorize')
    expect(to.searchParams.get('redirect_uri')).toBe('https://app.example/auth/oauth/fake/callback')
    expect(to.searchParams.get('code_challenge_method')).toBe('S256')
    expect(to.searchParams.get('state')).toBeTruthy()

    const back = await b.call('GET', fake.authorize(to.toString()))
    expect(back.status).toBe(302)
    expect(back.res.headers.get('location')).toBe('/home')
    const me = await b.user()
    expect(me).toMatchObject({ email: 'me@example.com', name: 'Me', image: 'https://img.example/me.png' })
    expect((await b.call('GET', '/auth/accounts')).body.accounts).toMatchObject([{ provider: 'fake', name: 'Fake', email: 'me@example.com' }])
  })

  it('is the same person as the one who signs in with an email code', async () => {
    const { browser, mailbox, fake } = await withFake()
    const viaCode = await signIn(browser(), mailbox, 'me@example.com')
    const b = browser()
    await providerSignIn(b, fake)
    expect((await b.user()).id).toBe(viaCode.body.user.id)
  })

  it("won't sign in by an email the provider hasn't verified", async () => {
    const { browser, fake } = await withFake({ id: 'u1', email: 'me@example.com', emailVerified: false })
    const b = browser()
    const back = await providerSignIn(b, fake)
    expect(back.res.headers.get('location')).toContain('slauth_error=email-not-verified')
    expect(await b.user()).toBeNull()
  })

  it('trusts unverified emails only when told to', async () => {
    const { browser, fake } = await withFake({ id: 'u1', email: 'me@example.com', emailVerified: false }, {}, { trustEmail: true })
    const b = browser()
    await providerSignIn(b, fake)
    expect((await b.user()).email).toBe('me@example.com')
  })

  it('refuses a callback that this browser did not start (login CSRF)', async () => {
    const { browser, fake } = await withFake()
    const attacker = browser()
    const begin = await attacker.call('GET', '/auth/oauth/fake')
    const callback = fake.authorize(begin.res.headers.get('location'))
    const victim = browser()
    const back = await victim.call('GET', callback)
    expect(back.res.headers.get('location')).toContain('slauth_error=oauth-state')
    expect(await victim.user()).toBeNull()
  })

  it('a code and a state work once', async () => {
    const { browser, fake } = await withFake()
    const b = browser()
    const begin = await b.call('GET', '/auth/oauth/fake')
    const callback = fake.authorize(begin.res.headers.get('location'))
    await b.call('GET', callback)
    await b.call('POST', '/auth/signout', {})
    expect((await b.call('GET', callback)).res.headers.get('location')).toContain('slauth_error=oauth-state')
  })

  it('applies the allow list, with the provider in the context', async () => {
    const seen = []
    const { browser, fake } = await withFake(undefined, { allow: (email, context) => (seen.push(context), false) })
    const back = await providerSignIn(browser(), fake)
    expect(back.res.headers.get('location')).toContain('slauth_error=not-allowed')
    expect(seen[0]).toMatchObject({ method: 'oauth', provider: 'fake' })
  })

  it('only redirects to paths on this site', async () => {
    const { browser, fake } = await withFake()
    const back = await providerSignIn(browser(), fake, '/auth/oauth/fake?redirect=//evil.example/x')
    expect(back.res.headers.get('location')).toBe('/')
  })

  it('reports a cancelled sign-in back to the page it started on', async () => {
    const { browser } = await withFake()
    const b = browser()
    const begin = await b.call('GET', '/auth/oauth/fake', undefined, { referer: 'https://app.example/login' })
    const state = new URL(begin.res.headers.get('location')).searchParams.get('state')
    const back = await b.call('GET', `/auth/oauth/fake/callback?error=access_denied&state=${state}`)
    expect(back.res.headers.get('location')).toBe('/login?slauth_error=oauth-cancelled')
  })

  it('answers 404 for providers it does not have', async () => {
    const { browser } = await withFake()
    expect((await browser().call('GET', '/auth/oauth/nope')).status).toBe(404)
  })

  it('keeps tokens when asked, for calling the provider later', async () => {
    const { auth, browser, fake } = await withFake(undefined, {}, { keepTokens: true })
    const b = browser()
    await providerSignIn(b, fake)
    const [account] = await auth.accounts.list((await b.user()).id)
    expect(account.tokens.access_token).toMatch(/^at_/)
    expect(account.tokens.refresh_token).toBe('rt_1')
  })
})

describe('linking providers', () => {
  it('links a provider to the signed-in account, even with another email', async () => {
    const { browser, mailbox, fake } = await withFake({ id: 'gh-7', email: 'work@corp.example', emailVerified: true })
    const b = browser()
    const me = (await signIn(b, mailbox, 'me@example.com')).body.user
    const back = await providerSignIn(b, fake, '/auth/oauth/fake?link=1&redirect=/settings')
    expect(back.res.headers.get('location')).toBe('/settings?slauth_linked=fake')
    // Now it signs in as me, not as work@corp.example.
    const other = browser()
    await providerSignIn(other, fake)
    expect((await other.user()).id).toBe(me.id)
  })

  it("won't link an account that already belongs to someone else", async () => {
    const { browser, mailbox, fake } = await withFake({ id: 'gh-7', email: 'them@example.com', emailVerified: true })
    await providerSignIn(browser(), fake)
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    const back = await providerSignIn(b, fake, '/auth/oauth/fake?link=1')
    expect(back.res.headers.get('location')).toContain('slauth_error=account-in-use')
  })

  it('unlinks', async () => {
    const { browser, fake } = await withFake()
    const b = browser()
    await providerSignIn(b, fake)
    expect((await b.call('POST', '/auth/accounts/unlink', { provider: 'fake' })).status).toBe(200)
    expect((await b.call('GET', '/auth/accounts')).body.accounts).toEqual([])
  })
})

describe('built-in providers', () => {
  it('GitHub uses the verified primary email, not the profile one', async () => {
    const provider = github({ clientId: 'a', clientSecret: 'b' })
    const fetch = async (url) => {
      if (url.endsWith('/user')) return Response.json({ id: 42, login: 'octo', name: '', email: 'public@else.example', avatar_url: 'https://a/1' })
      return Response.json([
        { email: 'unverified@example.com', primary: false, verified: false },
        { email: 'Me@Example.com', primary: true, verified: true },
      ])
    }
    expect(await provider.profile({ access_token: 't' }, fetch)).toEqual({ id: '42', email: 'Me@Example.com', emailVerified: true, name: 'octo', image: 'https://a/1' })
  })

  it('OpenID Connect providers are found from the issuer', async () => {
    const calls = []
    const fetch = async (url) => {
      calls.push(url)
      if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ authorization_endpoint: 'https://id.example/auth', token_endpoint: 'https://id.example/token', userinfo_endpoint: 'https://id.example/me' })
      return Response.json({ sub: 'abc', email: 'me@example.com', email_verified: true, name: 'Me' })
    }
    const provider = oidc({ id: 'corp', name: 'Corp', issuer: 'https://id.example/', clientId: 'x' })
    const { browser } = setup({ providers: [provider], fetch })
    const begin = await browser().call('GET', '/auth/oauth/corp')
    expect(begin.res.headers.get('location')).toMatch(/^https:\/\/id\.example\/auth\?/)
    expect(await provider.profile({ access_token: 't' }, fetch)).toMatchObject({ id: 'abc', emailVerified: true })
    expect(calls.filter((u) => u.includes('openid-configuration'))).toHaveLength(1)
  })

  it('checks provider settings up front', () => {
    expect(() => oauth2({ id: 'x', clientId: 'a' })).toThrow(/authorization/)
    expect(() => oauth2({ id: 'Bad Id', clientId: 'a', authorization: 'x', token: 'y', profile() {} })).toThrow(/lower-case/)
    expect(() => setup({ providers: [github({ clientId: 'a' }), github({ clientId: 'b' })] })).toThrow(/two providers/)
  })
})

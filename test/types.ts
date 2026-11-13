// Not run: type-checked by `pnpm typecheck` to keep the .d.ts files honest.
import { slauth, memory, createLock, type SlauthUser } from 'slauthjs'
import { d1 } from 'slauthjs/stores/d1'
import { kv } from 'slauthjs/stores/kv'
import { sqlite } from 'slauthjs/stores/sqlite'
import { postgres } from 'slauthjs/stores/postgres'
import { libsql } from 'slauthjs/stores/libsql'
import { createClient as createLibsql } from '@libsql/client'
import { resend } from 'slauthjs/email/resend'
import { turnstile, hcaptcha } from 'slauthjs/challenge'
import { cloudflareEmail } from 'slauthjs/email/cloudflare'
import { consoleEmail } from 'slauthjs/email/console'
import { createClient, SlauthError } from 'slauthjs/client'
import { toNodeHandler } from 'slauthjs/node'
import 'slauthjs/element'

declare const env: { DB: { prepare(sql: string): unknown }; KV: Parameters<typeof kv>[0]; EMAIL: Parameters<typeof cloudflareEmail>[0] }
declare const db: Parameters<typeof sqlite>[0]
/** The shape of a node-postgres Pool. */
declare const pool: { query(text: string, params: unknown[]): Promise<{ rows: any[]; rowCount: number | null }> }

const auth = slauth({
  secret: 'x'.repeat(32),
  store: d1(env.DB),
  email: resend({ apiKey: 're_123', from: 'hi@app.dev' }),
  allow: ['me@example.com', '@family.com'],
  passkeys: { rpId: 'app.dev' },
  lock: { default: 'weekly' },
})
slauth({ secret: 'x'.repeat(32), store: memory(), email: consoleEmail() })
slauth({ secret: 'x'.repeat(32), store: memory(), challenge: turnstile({ secret: 's', hostname: 'app.dev' }) })
slauth({ secret: 'x'.repeat(32), store: memory(), challenge: hcaptcha({ secret: 's' }) })
slauth({ secret: 'x'.repeat(32), store: memory(), newSignInEmails: { accountPage: '/account' }, emails: (kind, { device }) => (kind === 'new-sign-in' ? { subject: `New: ${device}`, text: '', html: '' } : null) })
slauth({ secret: 'x'.repeat(32), store: memory(), challenge: async (_request, token, { route }) => token === 'ok' && route !== 'password/signin' })
slauth({ secret: 'x'.repeat(32), store: kv(env.KV), email: cloudflareEmail(env.EMAIL, { from: 'hi@app.dev' }), access: { team: 't', aud: 'a' } })
slauth({ secret: 'x'.repeat(32), store: sqlite(db), lock: true, passkeys: false })
slauth({ secret: 'x'.repeat(32), store: postgres(pool) })
slauth({ secret: 'x'.repeat(32), store: postgres(async (text: string, params: unknown[]) => [{ text, params }]) })
slauth({ secret: 'x'.repeat(32), store: libsql(createLibsql({ url: ':memory:' })) })

export async function handler(request: Request): Promise<Response> {
  if (new URL(request.url).pathname.startsWith('/auth/')) return auth.handle(request)
  const user = await auth.requireUser(request)
  if (user instanceof Response) return user
  const me: SlauthUser = user
  return Response.json(me)
}

export async function orgRoute(request: Request): Promise<Response> {
  const member = await auth.orgs!.require(request, { role: ['owner', 'admin'] })
  if (member instanceof Response) return member
  const where: string = member.orgId
  const session = await auth.session(request)
  return Response.json({ where, active: session?.org?.role })
}

const client = createClient()
client.orgs.setActive('org_123').then(({ org }) => org?.name)
client.orgs.setActive(null)
client.email.start('me@example.com', { challenge: 'token' }).catch((e: unknown) => e instanceof SlauthError && e.code)
client.passkey.supported()
document.createElement('slauth-sign-in')
toNodeHandler(auth)
createLock({ get: async () => null, put: async () => {} })

// slauth 2: the deeper end.
import { github, google, oidc, oauth2, microsoft } from 'slauthjs/providers'
import 'slauthjs/account'
import { totp, type StoredUser, type Slauth } from 'slauthjs'

const full: Slauth = slauth({
  secret: 'x'.repeat(32),
  store: memory(),
  baseUrl: 'https://app.dev',
  signInPage: '/login',
  providers: [
    github({ clientId: 'a', clientSecret: 'b' }),
    google({ clientId: 'a', clientSecret: 'b' }),
    microsoft({ clientId: 'a', tenant: 'my-tenant', trustEmail: true }),
    oidc({ id: 'corp', name: 'Corp', issuer: 'https://id.corp', clientId: 'a' }),
    oauth2({ id: 'x', name: 'X', clientId: 'a', authorization: 'https://x/a', token: 'https://x/t', profile: async () => ({ id: '1', email: 'a@b.c', emailVerified: true }) }),
  ],
  magicLinks: true,
  passwords: { minLength: 10, validate: (p) => (p === 'password123' ? 'Too common.' : null) },
  twoFactor: true,
  tokens: { minutes: 10, audience: 'api', claims: (u) => ({ plan: u.metadata.plan }) },
  organizations: { allowCreate: (u) => u.roles.includes('staff') },
  rateLimit: { limits: { 'email/start': [5, 60] } },
  freshMinutes: 10,
  allow: (email, context) => context.method !== 'oauth' || email.endsWith('@corp.dev'),
  on: { signUp: async ({ user }) => void user.email, userDeleted: ({ user }) => void user.id },
  emails: (kind, data) => (kind === 'sign-in' ? { subject: `Code ${data.code}`, text: '', html: '' } : null),
})

export async function deeper(request: Request) {
  const admin = await full.requireUser(request, { role: 'admin' })
  if (admin instanceof Response) return admin
  const stored: StoredUser | null = await full.users.get(admin.id)
  await full.users.update(admin.id, { roles: ['admin'], privateMetadata: { stripe: 'cus_1' } })
  await full.sessions.revokeAll(admin.id)
  const { token } = await full.createToken(admin)
  const claims = await full.verifyToken(token)
  const member = await full.orgs!.require(request, 'org_1', { role: ['owner', 'admin'] })
  if (!(member instanceof Response)) member.orgRole
  await totp('JBSWY3DPEHPK3PXP')
  return { stored, claims }
}

const deep = createClient({ token: { get: () => null, set: () => {} } })
deep.oauth.signIn('github', { redirect: '/' })
deep.twoFactor.verify({ recoveryCode: 'abcde-fghij' })
deep.getToken().then((t: string) => t)
deep.orgs.invite('org_1', 'pal@example.com', 'admin')
document.createElement('slauth-account')

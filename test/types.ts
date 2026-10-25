// Not run: type-checked by `pnpm typecheck` to keep the .d.ts files honest.
import { slauth, memory, createLock, type SlauthUser } from 'slauth'
import { d1 } from 'slauth/stores/d1'
import { kv } from 'slauth/stores/kv'
import { sqlite } from 'slauth/stores/sqlite'
import { resend } from 'slauth/email/resend'
import { cloudflareEmail } from 'slauth/email/cloudflare'
import { consoleEmail } from 'slauth/email/console'
import { createClient, SlauthError } from 'slauth/client'
import { toNodeHandler } from 'slauth/node'
import 'slauth/element'

declare const env: { DB: { prepare(sql: string): unknown }; KV: Parameters<typeof kv>[0]; EMAIL: Parameters<typeof cloudflareEmail>[0] }
declare const db: Parameters<typeof sqlite>[0]

const auth = slauth({
  secret: 'x'.repeat(32),
  store: d1(env.DB),
  email: resend({ apiKey: 're_123', from: 'hi@app.dev' }),
  allow: ['me@example.com', '@family.com'],
  passkeys: { rpId: 'app.dev' },
  lock: { default: 'weekly' },
})
slauth({ secret: 'x'.repeat(32), store: memory(), email: consoleEmail() })
slauth({ secret: 'x'.repeat(32), store: kv(env.KV), email: cloudflareEmail(env.EMAIL, { from: 'hi@app.dev' }), access: { team: 't', aud: 'a' } })
slauth({ secret: 'x'.repeat(32), store: sqlite(db), lock: true, passkeys: false })

export async function handler(request: Request): Promise<Response> {
  if (new URL(request.url).pathname.startsWith('/auth/')) return auth.handle(request)
  const user = await auth.requireUser(request)
  if (user instanceof Response) return user
  const me: SlauthUser = user
  return Response.json(me)
}

const client = createClient()
client.email.start('me@example.com').catch((e: unknown) => e instanceof SlauthError && e.code)
client.passkey.supported()
document.createElement('slauth-sign-in')
toNodeHandler(auth)
createLock({ get: async () => null, put: async () => {} })

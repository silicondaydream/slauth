// bun run server.js  →  http://localhost:3000 (codes print in this terminal)
import { Database } from 'bun:sqlite'
import { slauth } from 'slauth'
import { sqlite } from 'slauth/stores/sqlite'

const auth = slauth({
  secret: process.env.SLAUTH_SECRET ?? 'dev-only-secret-change-me',
  store: sqlite(new Database('auth.db')),
  appName: 'Bun example',
})

Bun.serve({
  port: 3000,
  async fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/auth/')) return auth.handle(request)
    if (pathname === '/api/me') {
      const user = await auth.requireUser(request)
      if (user instanceof Response) return user
      return Response.json({ hello: user.email })
    }
    return new Response('Try POST /auth/email/start with {"email": "you@example.com"}')
  },
})

import { slauth } from 'slauth'
import { d1 } from 'slauth/stores/d1'
import { resend } from 'slauth/email/resend'

export default {
  async fetch(request, env) {
    const auth = slauth({
      secret: env.SLAUTH_SECRET,
      store: d1(env.DB),
      // No key yet? Codes are printed in the `wrangler dev` terminal instead.
      email: env.RESEND_API_KEY ? resend({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }) : undefined,
      appName: 'slauth example',
    })

    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/auth/')) return auth.handle(request)

    if (pathname === '/api/me') {
      const user = await auth.requireUser(request)
      if (user instanceof Response) return user
      return Response.json({ hello: user.email, since: new Date(user.createdAt).toISOString() })
    }

    return env.ASSETS.fetch(request)
  },
}

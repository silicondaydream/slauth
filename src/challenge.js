import { clientIp, json } from './util.js'

/**
 * Bot checks (Turnstile, hCaptcha or your own) on the routes that send email or take a
 * guess: email/start, password/signup and password/signin. The browser sends the widget's
 * token as `challenge` in the JSON body; `<slauth-sign-in>` finds it for you.
 *
 *   import { turnstile } from 'slauthjs/challenge'
 *   slauth({ ..., challenge: turnstile({ secret: env.TURNSTILE_SECRET }) })
 *
 * There's no fingerprinting here: the vendor does that under its own terms, and only for
 * apps that turn this on. A check that throws counts as failed (fail closed).
 */

const ROUTES = new Set(['email/start', 'password/signup', 'password/signin'])

/**
 * @param {((request: Request, token: string | null, context: { route: string }) => boolean | Promise<boolean>) | undefined} check
 * @returns {(route: string, request: Request, input: Record<string, unknown>) => Promise<Response | null>}
 */
export function createChallenge(check) {
  if (!check) return async () => null
  if (typeof check !== 'function') throw new Error('slauth: `challenge` must be a function, e.g. turnstile({ secret }).')
  return async (route, request, input) => {
    if (!ROUTES.has(route)) return null
    const token = typeof input.challenge === 'string' && input.challenge.length <= 4096 ? input.challenge : null
    let passed = false
    try {
      passed = (await check(request, token, { route })) === true
    } catch (error) {
      // The message only: never the token.
      console.error('slauth: the challenge check threw:', error?.message ?? error)
    }
    return passed ? null : json({ error: 'Please complete the check and try again.', code: 'challenge-failed' }, 403)
  }
}

/**
 * Cloudflare Turnstile. `secret` is the widget's secret key.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * @param {{ secret: string, hostname?: string | string[], fetch?: typeof fetch }} options
 */
export function turnstile({ secret, hostname, fetch: doFetch }) {
  return siteverify('https://challenges.cloudflare.com/turnstile/v0/siteverify', { secret, hostname, doFetch, name: 'turnstile' })
}

/**
 * hCaptcha. `secret` is the account's secret key.
 * https://docs.hcaptcha.com/#verify-the-user-response-server-side
 *
 * @param {{ secret: string, hostname?: string | string[], fetch?: typeof fetch }} options
 */
export function hcaptcha({ secret, hostname, fetch: doFetch }) {
  return siteverify('https://api.hcaptcha.com/siteverify', { secret, hostname, doFetch, name: 'hcaptcha' })
}

/** Both vendors take the same form post and answer `{ success, hostname }`. */
function siteverify(endpoint, { secret, hostname, doFetch, name }) {
  if (typeof secret !== 'string' || !secret) throw new Error(`slauth: ${name}() needs { secret }.`)
  const hosts = hostname ? [hostname].flat() : null
  return async (request, token) => {
    if (!token) return false
    const form = new URLSearchParams({ secret, response: token })
    const ip = clientIp(request)
    if (ip) form.set('remoteip', ip)
    const res = await (doFetch ?? fetch)(endpoint, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`${name} answered ${res.status}`)
    const result = await res.json()
    if (result.success !== true) return false
    return !hosts || hosts.includes(result.hostname)
  }
}

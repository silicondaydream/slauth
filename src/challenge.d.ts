/** Checks the token from a bot-check widget. Return true to let the request through. */
export type ChallengeCheck = (request: Request, token: string | null, context: { route: 'email/start' | 'password/signup' | 'password/signin' }) => boolean | Promise<boolean>

export interface SiteverifyOptions {
  /** The widget's secret key. */
  secret: string
  /** Only accept tokens solved on these hostnames. */
  hostname?: string | string[]
  fetch?: typeof fetch
}

/** Cloudflare Turnstile's server-side check. */
export function turnstile(options: SiteverifyOptions): ChallengeCheck
/** hCaptcha's server-side check. */
export function hcaptcha(options: SiteverifyOptions): ChallengeCheck

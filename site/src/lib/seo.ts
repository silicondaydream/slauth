// One place for what search engines and AI assistants are told about slauth.

export const SITE = 'https://slauth.dev'
export const REPO = 'https://github.com/silicondaydream/slauth'
export const NAME = 'slauth'
export const TAGLINE = 'Open-source auth you own'
export const SUMMARY =
  'slauth is an open-source (MIT), zero-dependency authentication library for JavaScript. It adds email-code and passkey sign-in in about five minutes, keeps users in your own database (Cloudflare D1, SQLite, Workers KV or any key-value store), and runs anywhere that speaks Request/Response: Cloudflare Workers, Bun, Deno, Node, Next.js, Astro and Hono. When a project grows it adds, one config key at a time, "Sign in with GitHub/Google/Discord/GitLab/Microsoft" or any OpenID Connect provider, passwords, magic links, two-factor (TOTP), session management, roles, an admin API, organizations with invitations, and ES256 JWTs with a JWKS endpoint.'
export const OG_IMAGE = `${SITE}/og.png`

/** An absolute, trailing-slash URL for a path, matching the sitemap. */
export function canonical(path: string) {
  const clean = path.endsWith('/') || /\.[a-z0-9]+$/i.test(path) ? path : `${path}/`
  return new URL(clean, SITE).toString()
}

export const software = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: NAME,
  alternateName: 'slauthjs',
  description: SUMMARY,
  url: SITE,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Cloudflare Workers, Node.js, Bun, Deno',
  softwareVersion: '2.0.0',
  license: 'https://opensource.org/licenses/MIT',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  sameAs: [REPO, 'https://www.npmjs.com/package/slauthjs'],
  featureList: [
    'Email one-time codes',
    'Passkeys (WebAuthn)',
    'OAuth 2.0 and OpenID Connect providers',
    'Magic links',
    'Passwords (PBKDF2)',
    'Two-factor authentication (TOTP) with recovery codes',
    'Session and device management',
    'Roles, metadata and an admin API',
    'Organizations with roles and invitations',
    'ES256 JWTs with a JWKS endpoint',
  ],
}

export const sourceCode = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: NAME,
  description: SUMMARY,
  codeRepository: REPO,
  programmingLanguage: ['JavaScript', 'TypeScript'],
  runtimePlatform: ['Cloudflare Workers', 'Node.js', 'Bun', 'Deno'],
  license: 'https://opensource.org/licenses/MIT',
}

export const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: NAME,
  url: SITE,
  description: `${TAGLINE}. ${SUMMARY}`,
}

/** Safe to drop into <script type="application/ld+json">. */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

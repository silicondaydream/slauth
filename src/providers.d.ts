import type { Profile, Provider } from './index.js'

interface Common {
  clientId: string
  clientSecret?: string
  /** Count the provider's email as verified even when it doesn't say so. */
  trustEmail?: boolean
  /** Save access and refresh tokens, for auth.accounts.list(). */
  keepTokens?: boolean
  scope?: string
  params?: Record<string, string>
}

export function oauth2(options: Common & {
  id: string
  name: string
  authorization: string
  token: string
  pkce?: boolean
  tokenAuth?: 'post' | 'basic'
  profile(tokens: Record<string, any>, fetch: typeof globalThis.fetch): Promise<Profile>
}): Provider
export function oidc(options: Common & { id: string; name: string; issuer: string; tokenAuth?: 'post' | 'basic' }): Provider
export function github(options: Common): Provider
export function google(options: Common): Provider
export function discord(options: Common): Provider
export function gitlab(options: Common & { baseUrl?: string }): Provider
export function microsoft(options: Common & { tenant?: string }): Provider

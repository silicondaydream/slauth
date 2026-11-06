import type { OrgRole, Policy, SlauthUser } from './index.js'

export class SlauthError extends Error {
  /** e.g. "bad-code", "expired", "not-allowed", "slow-down", "signed-out", "reauth-required", "offline". */
  code: string
  status: number
  [detail: string]: unknown
}

/** A sign-in reply: the user, or a request for the two-factor code. */
export type SignInResult = { user: SlauthUser; twoFactor?: undefined } | { twoFactor: true; user?: undefined }

export interface ClientConfig {
  appName: string
  emailCodes: boolean
  magicLinks: boolean
  passkeys: boolean
  passwords: boolean
  twoFactor: boolean
  organizations: boolean
  providers: { id: string; name: string }[]
}

export interface SlauthClient {
  session(): Promise<{ user: SlauthUser | null; twoFactor?: 'pending'; impersonatorId?: string; lock?: { policy: Policy; required: boolean; pinSet: boolean; unlocked: boolean } }>
  config(): Promise<ClientConfig>
  email: {
    start(email: string, options?: { redirect?: string }): Promise<{ ok: true }>
    verify(email: string, code: string): Promise<SignInResult>
    link(token: string): Promise<SignInResult & { redirect: string }>
    change: {
      start(email: string): Promise<{ ok: true }>
      verify(email: string, code: string): Promise<{ user: SlauthUser }>
    }
  }
  password: {
    signIn(email: string, password: string): Promise<SignInResult>
    signUp(email: string, password: string, options?: { redirect?: string }): Promise<{ ok: true; verify: 'email' }>
    set(password: string, current?: string): Promise<{ ok: true }>
    remove(): Promise<{ ok: true }>
  }
  oauth: {
    /** Navigates to the provider; returns the URL. */
    signIn(provider: string, options?: { redirect?: string }): string
    link(provider: string, options?: { redirect?: string }): string
    url(provider: string, options?: { redirect?: string }): string
  }
  twoFactor: {
    verify(code: string | { code: string } | { recoveryCode: string }): Promise<{ user: SlauthUser; recoveryCodesLeft?: number }>
    setup(): Promise<{ secret: string; uri: string }>
    enable(code: string): Promise<{ ok: true; recoveryCodes: string[] }>
    disable(code: string | { code: string } | { recoveryCode: string }): Promise<{ ok: true }>
    recoveryCodes(code: string): Promise<{ ok: true; recoveryCodes: string[] }>
  }
  passkey: {
    supported(): boolean
    register(name?: string): Promise<{ ok: true; passkey: { id: string; name: string } }>
    signIn(): Promise<SignInResult>
    list(): Promise<{ passkeys: { id: string; name: string; createdAt: number; lastUsedAt: number | null }[] }>
    rename(id: string, name: string): Promise<{ ok: true }>
    remove(id: string): Promise<{ ok: true }>
  }
  signOut(): Promise<{ ok: true }>
  user: {
    update(patch: { name?: string | null; image?: string | null }): Promise<{ user: SlauthUser }>
    delete(): Promise<{ ok: true }>
  }
  sessions: {
    list(): Promise<{ sessions: { id: string; createdAt: number; lastActiveAt: number; method: string | null; userAgent: string | null; ip: string | null; current: boolean }[] }>
    revoke(id: string): Promise<{ ok: true }>
    revokeOthers(): Promise<{ ok: true }>
  }
  accounts: {
    list(): Promise<{ accounts: { provider: string; name: string; email: string | null; username: string | null; createdAt: number }[]; password: boolean; twoFactor: boolean }>
    unlink(provider: string): Promise<{ ok: true }>
  }
  /** A JWT for your other services (needs `tokens` on), cached until shortly before it expires. */
  getToken(): Promise<string>
  orgs: {
    list(): Promise<{ orgs: { id: string; name: string; role: OrgRole; metadata: Record<string, unknown>; createdAt: number }[] }>
    create(name: string): Promise<{ org: { id: string; name: string; role: 'owner' } }>
    get(id: string): Promise<{
      org: { id: string; name: string; metadata: Record<string, unknown>; createdAt: number }
      role: OrgRole
      members: { userId: string; role: OrgRole; joinedAt: number; email: string; name: string | null; image: string | null }[]
      invites?: { id: string; email: string; role: OrgRole; createdAt: number; expiresAt: number }[]
    }>
    rename(id: string, name: string): Promise<{ org: { id: string; name: string } }>
    delete(id: string): Promise<{ ok: true }>
    invite(id: string, email: string, role?: OrgRole): Promise<{ ok: true; invite: { id: string; email: string; role: OrgRole; expiresAt: number } }>
    revokeInvite(id: string, inviteId: string): Promise<{ ok: true }>
    setRole(id: string, userId: string, role: OrgRole): Promise<{ ok: true }>
    removeMember(id: string, userId: string): Promise<{ ok: true }>
    invites(): Promise<{ invites: { id: string; role: OrgRole; org: { id: string; name: string }; expiresAt: number }[] }>
    accept(inviteId: string): Promise<{ ok: true; org: { id: string; name: string; role: OrgRole } }>
    decline(inviteId: string): Promise<{ ok: true }>
  }
  lock: {
    unlock(pin: string): Promise<{ ok: true }>
    setup(pin: string, policy?: Policy): Promise<{ ok: true }>
    skip(): Promise<{ ok: true }>
    changePin(current: string, next: string): Promise<{ ok: true }>
    setPolicy(policy: Policy, pin?: string): Promise<{ ok: true; policy: Policy }>
    lockNow(): Promise<{ ok: true }>
  }
}

export function createClient(options?: {
  basePath?: string
  fetch?: typeof fetch
  /** For apps without cookies: where to keep the session token. */
  token?: { get(): string | null | undefined; set(token: string | null): void | Promise<void> }
}): SlauthClient

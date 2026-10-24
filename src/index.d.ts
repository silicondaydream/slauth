export interface User {
  /** Lower-cased email from the Access sign-in. */
  email: string
  /** Stable, opaque id: the same in every app for the same email. */
  userId: string
}

export interface AccessOptions {
  /** "yourteam" or "yourteam.cloudflareaccess.com". */
  teamDomain: string
  /** The Application Audience (AUD) tag of the Access application(s). */
  audience: string | string[]
  /** Optional second check after the Access policy. */
  allowedEmails?: string[]
  /** email -> userId, to keep someone's data when their email changes. */
  aliases?: Record<string, string>
  /** Local development only: treat every request as this email. Never set in production. */
  devUser?: string
  fetch?: typeof fetch
}

export function createAccess(options: AccessOptions): {
  /** The signed-in person, or null when the request did not come through Access. */
  getUser(request: Request): Promise<User | null>
}

export function userIdFor(email: string): Promise<string>

export type Policy = 'always' | 'daily' | 'weekly' | 'never'
export const POLICIES: readonly Policy[]

export interface LockDoc {
  pinHash?: string
  salt?: string
  sessionKey: string
  failures: number
  lockedUntil: number
  policy?: Policy
}

export interface LockStore {
  get(userId: string): Promise<LockDoc | null>
  put(userId: string, doc: LockDoc): Promise<void>
}

export interface LockReply {
  status: number
  body: Record<string, unknown>
  /** A Set-Cookie header value, when the reply changes the unlock. */
  cookie?: string
}

export interface LockOptions {
  /** Cookie name; keep an app's old one so nobody is signed out twice. Default "slauth_lock". */
  cookie?: string
  /** For people who haven't chosen yet. Default "weekly". */
  defaultPolicy?: Policy
}

export function createLock(
  store: LockStore,
  options?: LockOptions,
): {
  /**
   * Routes: GET session, POST login | setup | logout | pin | policy.
   * Returns null for any other route.
   */
  handle(
    route: string,
    method: string,
    readBody: () => Promise<any>,
    user: User,
    cookieHeader: string | null | undefined,
    secure: boolean,
  ): Promise<LockReply | null>
  isUnlocked(user: User, cookieHeader: string | null | undefined): Promise<boolean>
}

export function validPin(pin: unknown): pin is string
export function validPolicy(policy: unknown): policy is Policy

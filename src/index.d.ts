/** A key-value store: the only thing slauth needs from your database. */
export interface Store {
  get(key: string): Promise<any>
  /** ttl is in seconds. */
  put(key: string, value: unknown, options?: { ttl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

/** Sends the sign-in email. `subject`, `text` and `html` are ready to use. */
export interface EmailSender {
  send(message: { to: string; code: string; appName: string; subject: string; text: string; html: string }): Promise<void>
}

export interface SlauthUser {
  id: string
  email: string
  createdAt: number
}

export interface SlauthConfig {
  /** A random string of 16+ characters. Make one with: openssl rand -base64 32 */
  secret: string
  /** Where users, sessions and passkeys live: memory(), d1(env.DB), kv(env.KV), sqlite(db), or your own. */
  store: Store
  /** How codes are emailed. Defaults to printing them to the console. */
  email?: EmailSender
  /** Shown in emails and as the passkey's site name. */
  appName?: string
  /** Who may sign in: a list of emails ("@family.com" for a whole domain) or a function. Everyone, if left out. */
  allow?: string[] | ((email: string) => boolean | Promise<boolean>)
  /** Where the routes live. Default "/auth". */
  basePath?: string
  /** Session cookie name. Default "slauth_session". */
  cookie?: string
  /** Sessions last this many days after the last visit. Default 30. */
  sessionDays?: number
  /** Origins allowed to post to the routes (and to use passkeys). Default: the request's own origin. */
  origins?: string | string[]
  /** Passkey settings, or false to turn passkeys off. */
  passkeys?:
    | false
    | {
        /** The site passkeys belong to, e.g. "myapp.dev" (works for every subdomain). Default: the request's hostname. */
        rpId?: string
        rpName?: string
        origin?: string | string[]
        userVerification?: 'required' | 'preferred' | 'discouraged'
      }
  /** Also accept people signed in by Cloudflare Access. */
  access?: { team: string; aud: string | string[]; devUser?: string; fetch?: typeof fetch }
  /** Turn on the PIN app lock. true = off by default for each person; or set their default. */
  lock?: true | { default?: Policy; cookie?: string }
}

export interface Slauth {
  /** Answers every request under basePath (404 for anything else). */
  handle(request: Request): Promise<Response>
  /** The signed-in person, or null. Ignores the app lock. */
  user(request: Request): Promise<SlauthUser | null>
  /** The signed-in, unlocked person, or a 401 Response to return as it is. */
  requireUser(request: Request): Promise<SlauthUser | Response>
  store: Store
}

export function slauth(config: SlauthConfig): Slauth
export function memory(): Store
export function consoleEmail(): EmailSender

/** What createAccess and createLock work with. */
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

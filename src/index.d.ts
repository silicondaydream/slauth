/** A key-value store: the only thing slauth needs from your database. */
export interface Store {
  get(key: string): Promise<any>
  /** ttl is in seconds. */
  put(key: string, value: unknown, options?: { ttl?: number }): Promise<void>
  delete(key: string): Promise<void>
  /** Optional: keys starting with `prefix`, in order. Only needed for auth.users.list(). */
  list?(prefix: string, options?: { limit?: number; cursor?: string | null }): Promise<{ items: { key: string; value: any }[]; cursor: string | null }>
}

export type EmailKind = 'sign-in' | 'email-change' | 'invite' | 'new-sign-in'

/** Sends slauth's emails. `subject`, `text` and `html` are ready to use. */
export interface EmailSender {
  send(message: { to: string; kind: EmailKind; code?: string; link?: string; appName: string; subject: string; text: string; html: string; device?: string; method?: string; when?: string }): Promise<void>
}

/** What the browser, auth.user() and your event handlers see. */
export interface SlauthUser {
  id: string
  email: string
  name: string | null
  image: string | null
  /** Set on the server (auth.users.update); checked by requireUser(request, { role }). */
  roles: string[]
  /** Yours to fill on the server; sent to the browser. */
  metadata: Record<string, unknown>
  createdAt: number
}

/** The whole record, for server code only. */
export interface StoredUser extends SlauthUser {
  /** Never sent to the browser. */
  privateMetadata: Record<string, unknown>
  updatedAt: number
  bannedAt: number | null
}

export interface Profile {
  id: string
  email?: string | null
  emailVerified?: boolean
  name?: string | null
  image?: string | null
}

/** A "Sign in with …" provider; make one with the helpers in 'slauthjs/providers'. */
export interface Provider {
  id: string
  name: string
  clientId: string
  clientSecret?: string
  authorization: string
  token: string
  scope?: string
  params?: Record<string, string>
  pkce?: boolean
  tokenAuth?: 'post' | 'basic'
  /** Count the provider's email as verified even when it doesn't say so. Only for providers you trust. */
  trustEmail?: boolean
  /** Save the provider's access and refresh tokens, for auth.accounts.list(). */
  keepTokens?: boolean
  profile(tokens: Record<string, any>, fetch: typeof globalThis.fetch): Promise<Profile>
}

export interface SignInContext {
  method: 'email' | 'link' | 'password' | 'passkey' | 'oauth' | 'access' | 'session' | 'email-change'
  provider?: string
  profile?: Profile
  user?: SlauthUser
}

export interface SlauthEvents {
  signUp?(event: { user: SlauthUser; method: string; request?: Request }): unknown
  signIn?(event: { user: SlauthUser; method: string; request: Request }): unknown
  signOut?(event: { user: SlauthUser; request: Request }): unknown
  userUpdated?(event: { user: SlauthUser }): unknown
  userDeleted?(event: { user: SlauthUser }): unknown
}

export interface SlauthConfig {
  /** A random string of 16+ characters. Make one with: openssl rand -base64 32 */
  secret: string
  /** Where users, sessions and passkeys live: memory(), d1(env.DB), kv(env.KV), sqlite(db), or your own. */
  store: Store
  /** How codes are emailed. Defaults to printing them to the console. */
  email?: EmailSender
  /** Your own wording for the emails. Return null to keep slauth's. */
  emails?: (kind: EmailKind, data: { code?: string; link?: string; appName: string; minutes?: number; orgName?: string; inviter?: string; device?: string; method?: string; when?: string }) => { subject: string; text: string; html: string } | null | Promise<{ subject: string; text: string; html: string } | null>
  /** Shown in emails and as the passkey's site name. */
  appName?: string
  /** Who may sign in: a list of emails ("@family.com" for a whole domain) or a function. Everyone, if left out. */
  allow?: string[] | ((email: string, context: SignInContext) => boolean | Promise<boolean>)
  /** Where the routes live. Default "/auth". */
  basePath?: string
  /** Your site's address for links in emails and provider callbacks, e.g. "https://myapp.dev". Default: the request's origin. */
  baseUrl?: string
  /** The page with your sign-in box; provider errors and two-factor steps come back here. Default: the page the person started on. */
  signInPage?: string
  /** Session cookie name. Default "slauth_session". */
  cookie?: string
  /** Sessions last this many days after the last visit. Default 30. */
  sessionDays?: number
  /** Adding a passkey or password, changing email, turning on two-factor or deleting the account need a sign-in this recent. Default 15; false to skip. */
  freshMinutes?: number | false
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
  /** "Sign in with …": github(), google(), oidc() and friends from 'slauthjs/providers'. */
  providers?: Provider[]
  /** Put a one-tap sign-in link in the code email too. */
  magicLinks?: boolean
  /** Let people sign in with a password (after proving their email once). */
  passwords?: boolean | { minLength?: number; iterations?: number; validate?: (password: string) => string | null | Promise<string | null> }
  /** Let people turn on an authenticator app (TOTP) with recovery codes. */
  twoFactor?: boolean | { issuer?: string }
  /** Short-lived JWTs for your other services, checked with /auth/jwks.json. */
  tokens?: boolean | { minutes?: number; issuer?: string; audience?: string; claims?: (user: SlauthUser) => Record<string, unknown> | Promise<Record<string, unknown>> }
  /** Teams with members, roles and email invitations. */
  organizations?: boolean | { allowCreate?: boolean | ((user: SlauthUser) => boolean | Promise<boolean>); invitePage?: string }
  /**
   * A bot check on email/start, password/signup and password/signin: turnstile() or
   * hcaptcha() from 'slauthjs/challenge', or your own. Gets the `challenge` token the
   * browser sent; return true to let it through.
   */
  challenge?: (request: Request, token: string | null, context: { route: 'email/start' | 'password/signup' | 'password/signin' }) => boolean | Promise<boolean>
  /** Per-IP limits on code, password and two-factor routes; false to turn off. */
  rateLimit?: false | { limits?: Record<string, [requests: number, seconds: number]>; ip?: (request: Request) => string | null }
  /** Let people delete their own account at POST /auth/user/delete. Default true. */
  allowDeletion?: boolean
  /**
   * Email people when their account signs in from a browser and OS it hasn't used before
   * ("Chrome on Windows"). `accountPage` is where the email's link goes, e.g. "/account".
   */
  newSignInEmails?: boolean | { accountPage?: string }
  /** Things to do when people sign up, sign in, and so on. */
  on?: SlauthEvents
  /** For providers' HTTP calls; handy in tests. */
  fetch?: typeof globalThis.fetch
  /** Also accept people signed in by Cloudflare Access. */
  access?: { team: string; aud: string | string[]; devUser?: string; fetch?: typeof fetch }
  /** Turn on the PIN app lock. true = off by default for each person; or set their default. */
  lock?: true | { default?: Policy; cookie?: string }
}

export interface SessionInfo {
  id: string
  createdAt: number
  lastActiveAt: number
  method: string | null
  userAgent: string | null
  ip: string | null
  impersonatorId: string | null
}

export interface LinkedAccount {
  provider: string
  accountId: string
  userId: string
  email: string | null
  name: string | null
  createdAt: number
  updatedAt: number
  tokens?: Record<string, any> & { savedAt: number }
}

export type OrgRole = 'owner' | 'admin' | 'member' | (string & {})

export interface Org {
  id: string
  name: string
  metadata: Record<string, unknown>
  createdAt: number
  createdBy: string | null
}

/** The organization a session is working in (POST /auth/orgs/active). */
export interface ActiveOrg {
  id: string
  name: string
  role: OrgRole
}

export interface OrgMember {
  userId: string
  role: OrgRole
  joinedAt: number
}

export interface OrgInvite {
  id: string
  orgId: string
  email: string
  role: OrgRole
  invitedBy: string | null
  createdAt: number
  expiresAt: number
}

export interface TokenClaims extends Record<string, unknown> {
  sub: string
  /** With an active organization. */
  org_id?: string
  org_role?: OrgRole
  email: string
  name: string | null
  roles: string[]
  iat: number
  exp: number
}

export interface Slauth {
  /** Answers every request under basePath (404 for anything else). */
  handle(request: Request): Promise<Response>
  /** The signed-in person, or null. Ignores the app lock. Reads the cookie, a bearer session token, or (with tokens on) a JWT. */
  user(request: Request): Promise<SlauthUser | null>
  /** The signed-in, unlocked person (with one of these roles), or a 401/403 Response to return as it is. */
  requireUser(request: Request, options?: { role?: string | string[] }): Promise<SlauthUser | Response>
  /** The user and their session (null for Access or a JWT), or null. */
  /** `org` is the active organization (null when none is chosen, or organizations are off). */
  session(request: Request): Promise<{ user: SlauthUser; session: { id: string; userId: string; createdAt: number; method: string | null; impersonatorId: string | null } | null; org: ActiveOrg | null } | null>
  store: Store

  users: {
    get(id: string): Promise<StoredUser | null>
    byEmail(email: string): Promise<StoredUser | null>
    /** Needs a store with list() (all the built-in ones have it). */
    list(options?: { limit?: number; cursor?: string | null }): Promise<{ users: StoredUser[]; cursor: string | null }>
    create(user: { email: string; name?: string | null; image?: string | null; roles?: string[]; metadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown> }): Promise<StoredUser>
    update(id: string, patch: Partial<Pick<StoredUser, 'email' | 'name' | 'image' | 'roles' | 'metadata' | 'privateMetadata'>>): Promise<StoredUser | null>
    /** Removes the user and their sessions, passkeys, providers, password, two-factor and memberships. */
    delete(id: string): Promise<boolean>
    ban(id: string): Promise<StoredUser | null>
    unban(id: string): Promise<StoredUser | null>
  }

  sessions: {
    list(userId: string): Promise<SessionInfo[]>
    revoke(userId: string, sessionId: string): Promise<boolean>
    revokeAll(userId: string): Promise<void>
    /** Signs someone in without asking: your own sign-in methods, tests, or impersonation. */
    create(userId: string, request: Request, options?: { method?: string; impersonatorId?: string | null }): Promise<{ cookie: string; token: string }>
  }

  accounts: {
    list(userId: string): Promise<LinkedAccount[]>
  }

  /** Null unless `passwords` is on. */
  passwords: null | {
    set(userId: string, password: string): Promise<void>
    remove(userId: string): Promise<void>
    has(userId: string): Promise<boolean>
    hash(password: string): Promise<string>
  }

  /** Null unless `twoFactor` is on. */
  twoFactor: null | {
    enabled(userId: string): Promise<boolean>
    /** For support: when someone has lost their phone and their recovery codes. */
    disable(userId: string): Promise<void>
  }

  /** Null unless `organizations` is on. */
  orgs: null | {
    create(org: { name: string; metadata?: Record<string, unknown> }, ownerId?: string): Promise<Org>
    get(orgId: string): Promise<Org | null>
    update(orgId: string, patch: { name?: string; metadata?: Record<string, unknown> }): Promise<Org | null>
    delete(orgId: string): Promise<void>
    forUser(userId: string): Promise<(Org & { role: OrgRole })[]>
    members(orgId: string): Promise<OrgMember[]>
    role(orgId: string, userId: string): Promise<OrgRole | null>
    addMember(orgId: string, userId: string, role?: OrgRole): Promise<boolean>
    setRole(orgId: string, userId: string, role: OrgRole): Promise<boolean>
    removeMember(orgId: string, userId: string): Promise<boolean>
    /** Saves an invitation (it doesn't email it; POST /auth/orgs/<id>/invite does both). */
    invite(orgId: string, email: string, role?: OrgRole, invitedBy?: string | null): Promise<OrgInvite>
    revokeInvite(inviteId: string): Promise<boolean>
    /** The signed-in member (with one of these org roles), or a 401/403 Response to return as it is. */
    require(request: Request, orgId: string, options?: { role?: OrgRole | OrgRole[] }): Promise<(SlauthUser & { orgId: string; orgRole: OrgRole }) | Response>
    /** The same, for the session's active organization (403 no-active-org when there isn't one). */
    require(request: Request, options?: { role?: OrgRole | OrgRole[] }): Promise<(SlauthUser & { orgId: string; orgRole: OrgRole }) | Response>
  }

  /** Needs `tokens` on. */
  createToken(user: SlauthUser, extra?: Record<string, unknown>): Promise<{ token: string; expiresAt: number }>
  /** The claims of a token slauth signed that hasn't expired, or null. Needs `tokens` on. */
  verifyToken(token: string): Promise<TokenClaims | null>
}

export function slauth(config: SlauthConfig): Slauth
export function memory(): Store
export function consoleEmail(): EmailSender
export function hashPassword(password: string, iterations?: number): Promise<string>
export function verifyPassword(password: string, hash: string): Promise<boolean>
/** The TOTP code for a base32 secret at a 30-second step (default: now). */
export function totp(secret: string, step?: number): Promise<string>

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

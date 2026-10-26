import type { Policy, SlauthUser } from './index.js'

export class SlauthError extends Error {
  /** e.g. "bad-code", "expired", "not-allowed", "slow-down", "signed-out", "offline". */
  code: string
  status: number
  [detail: string]: unknown
}

export interface SlauthClient {
  session(): Promise<{ user: SlauthUser | null; lock?: { policy: Policy; required: boolean; pinSet: boolean; unlocked: boolean } }>
  email: {
    start(email: string): Promise<{ ok: true }>
    verify(email: string, code: string): Promise<{ user: SlauthUser }>
  }
  passkey: {
    supported(): boolean
    register(name?: string): Promise<{ ok: true; passkey: { id: string; name: string } }>
    signIn(): Promise<{ user: SlauthUser }>
    list(): Promise<{ passkeys: { id: string; name: string; createdAt: number; lastUsedAt: number | null }[] }>
    remove(id: string): Promise<{ ok: true }>
  }
  signOut(): Promise<{ ok: true }>
  lock: {
    unlock(pin: string): Promise<{ ok: true }>
    setup(pin: string, policy?: Policy): Promise<{ ok: true }>
    skip(): Promise<{ ok: true }>
    changePin(current: string, next: string): Promise<{ ok: true }>
    setPolicy(policy: Policy, pin?: string): Promise<{ ok: true; policy: Policy }>
    lockNow(): Promise<{ ok: true }>
  }
}

export function createClient(options?: { basePath?: string; fetch?: typeof fetch }): SlauthClient

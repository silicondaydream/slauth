import type { Store } from '../index.js'

/**
 * Anything that can run a parameterised Postgres query: a node-postgres Pool or Client,
 * PGlite, Neon's serverless driver, postgres.js, or your own (text, params) => rows.
 */
export type PostgresClient =
  | { query(text: string, params: unknown[]): Promise<{ rows: any[] } | any[]> }
  | { unsafe(text: string, params: unknown[]): Promise<any[]> }
  | ((text: string, params: unknown[]) => Promise<{ rows: any[] } | any[]>)

export function postgres(db: PostgresClient, options?: { table?: string }): Store

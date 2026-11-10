import type { Store } from '../index.js'

/** A libSQL / Turso client from @libsql/client, or anything with the same execute(). */
export function libsql(db: { execute(statement: { sql: string; args: any[] }): Promise<{ rows: any[] }> }, options?: { table?: string }): Store

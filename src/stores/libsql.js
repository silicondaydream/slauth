import { page } from './d1.js'

/**
 * libSQL and Turso, through @libsql/client (or anything with the same
 * `execute({ sql, args })` → `{ rows }`). Creates its own table (`slauth_kv`) on first use.
 *
 *   import { createClient } from '@libsql/client'
 *   store: libsql(createClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN }))
 *
 * @param {{ execute(statement: { sql: string, args: unknown[] }): Promise<{ rows: any[] }> }} db
 * @param {{ table?: string }} [options]
 * @returns {import('../index.js').Store}
 */
export function libsql(db, { table = 'slauth_kv' } = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`slauth: "${table}" isn't a valid table name.`)
  const run = async (sql, args = []) => (await db.execute({ sql, args })).rows
  let ready = null
  const init = () =>
    (ready ??= run(`CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)`).catch((err) => {
      ready = null
      throw err
    }))

  return {
    async get(key) {
      await init()
      const [row] = await run(`SELECT value, expires_at FROM ${table} WHERE key = ?`, [key])
      if (!row) return null
      if (row.expires_at !== null && Number(row.expires_at) <= Date.now()) {
        await run(`DELETE FROM ${table} WHERE key = ?`, [key])
        return null
      }
      return JSON.parse(row.value)
    },
    async put(key, value, { ttl } = {}) {
      await init()
      await run(`INSERT INTO ${table} (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`, [
        key,
        JSON.stringify(value),
        ttl ? Date.now() + ttl * 1000 : null,
      ])
    },
    async delete(key) {
      await init()
      await run(`DELETE FROM ${table} WHERE key = ?`, [key])
    },
    async list(prefix, { limit = 100, cursor } = {}) {
      await init()
      const rows = await run(`SELECT key, value FROM ${table} WHERE key >= ? AND key < ? AND key > ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY key LIMIT ?`, [
        prefix,
        prefix + '￿',
        cursor ?? '',
        Date.now(),
        limit + 1,
      ])
      return page(rows, limit)
    },
  }
}

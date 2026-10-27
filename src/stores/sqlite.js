import { page } from './d1.js'

/**
 * Any synchronous SQLite handle with `prepare(sql).get(...)` / `.run(...)`: bun:sqlite,
 * better-sqlite3 and node:sqlite all fit. Creates its own table on first use.
 *
 * @param {{ prepare(sql: string): { get(...args: unknown[]): any, run(...args: unknown[]): unknown, all(...args: unknown[]): any[] } }} db
 * @param {{ table?: string }} [options]
 * @returns {import('../index.js').Store}
 */
export function sqlite(db, { table = 'slauth_kv' } = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`slauth: "${table}" isn't a valid table name.`)
  db.prepare(`CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)`).run()
  const select = db.prepare(`SELECT value, expires_at FROM ${table} WHERE key = ?`)
  const upsert = db.prepare(
    `INSERT INTO ${table} (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
  )
  const remove = db.prepare(`DELETE FROM ${table} WHERE key = ?`)
  let scan = null

  return {
    async get(key) {
      const row = select.get(key)
      if (!row) return null
      if (row.expires_at !== null && row.expires_at <= Date.now()) {
        remove.run(key)
        return null
      }
      return JSON.parse(row.value)
    },
    async put(key, value, { ttl } = {}) {
      upsert.run(key, JSON.stringify(value), ttl ? Date.now() + ttl * 1000 : null)
    },
    async delete(key) {
      remove.run(key)
    },
    async list(prefix, { limit = 100, cursor } = {}) {
      scan ??= db.prepare(`SELECT key, value FROM ${table} WHERE key >= ? AND key < ? AND key > ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY key LIMIT ?`)
      return page(scan.all(prefix, prefix + '\uffff', cursor ?? '', Date.now(), limit + 1), limit)
    },
  }
}

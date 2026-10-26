/**
 * Cloudflare D1. Creates its own table (`slauth_kv`) on first use, so there are no
 * migrations to run; it sits happily next to your app's own tables.
 *
 * @param {D1Database} db  the D1 binding, e.g. env.DB
 * @param {{ table?: string }} [options]
 * @returns {import('../index.js').Store}
 */
export function d1(db, { table = 'slauth_kv' } = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`slauth: "${table}" isn't a valid table name.`)
  let ready = null
  const init = () =>
    (ready ??= db
      .prepare(`CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)`)
      .run()
      .catch((err) => {
        ready = null
        throw err
      }))

  return {
    async get(key) {
      await init()
      const row = await db.prepare(`SELECT value, expires_at FROM ${table} WHERE key = ?`).bind(key).first()
      if (!row) return null
      if (row.expires_at !== null && row.expires_at <= Date.now()) {
        await db.prepare(`DELETE FROM ${table} WHERE key = ?`).bind(key).run()
        return null
      }
      return JSON.parse(row.value)
    },
    async put(key, value, { ttl } = {}) {
      await init()
      await db
        .prepare(`INSERT INTO ${table} (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`)
        .bind(key, JSON.stringify(value), ttl ? Date.now() + ttl * 1000 : null)
        .run()
    },
    async delete(key) {
      await init()
      await db.prepare(`DELETE FROM ${table} WHERE key = ?`).bind(key).run()
    },
    async list(prefix, { limit = 100, cursor } = {}) {
      await init()
      const { results } = await db
        .prepare(`SELECT key, value FROM ${table} WHERE key >= ? AND key < ? AND key > ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY key LIMIT ?`)
        .bind(prefix, prefix + '\uffff', cursor ?? '', Date.now(), limit + 1)
        .all()
      return page(results, limit)
    },
  }
}

/** Shared by the SQL stores: rows (one more than asked for) → a page and its cursor. */
export function page(rows, limit) {
  const items = rows.slice(0, limit).map((row) => ({ key: row.key, value: JSON.parse(row.value) }))
  return { items, cursor: rows.length > limit ? items.at(-1).key : null }
}

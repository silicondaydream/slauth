import { page } from './d1.js'

/**
 * Postgres: Neon, Supabase, Hyperdrive, RDS or your own. Works with any client that can
 * run a parameterised query; creates its own table (`slauth_kv`) on first use.
 *
 *   postgres(pool)                       node-postgres (pg) Pool or Client, PGlite: .query(text, params) → { rows }
 *   postgres(neon(env.DATABASE_URL))     @neondatabase/serverless: .query(text, params) → rows
 *   postgres(sql)                        postgres.js: .unsafe(text, params) → rows
 *   postgres((text, params) => …)        anything else: a function returning rows or { rows }
 *
 * The key column uses the "C" collation so prefix scans compare bytes, whatever the
 * database's default collation is.
 *
 * @param {any} db
 * @param {{ table?: string }} [options]
 * @returns {import('../index.js').Store}
 */
export function postgres(db, { table = 'slauth_kv' } = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`slauth: "${table}" isn't a valid table name.`)
  const run = runner(db)
  let ready = null
  const init = () =>
    (ready ??= run(`CREATE TABLE IF NOT EXISTS ${table} (key TEXT COLLATE "C" PRIMARY KEY, value TEXT NOT NULL, expires_at BIGINT)`, []).catch((err) => {
      ready = null
      throw err
    }))

  return {
    async get(key) {
      await init()
      const [row] = await run(`SELECT value, expires_at FROM ${table} WHERE key = $1`, [key])
      if (!row) return null
      // BIGINT comes back as a string from most drivers.
      if (row.expires_at !== null && Number(row.expires_at) <= Date.now()) {
        await run(`DELETE FROM ${table} WHERE key = $1`, [key])
        return null
      }
      return JSON.parse(row.value)
    },
    async put(key, value, { ttl } = {}) {
      await init()
      await run(
        `INSERT INTO ${table} (key, value, expires_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
        [key, JSON.stringify(value), ttl ? Date.now() + ttl * 1000 : null],
      )
    },
    async delete(key) {
      await init()
      await run(`DELETE FROM ${table} WHERE key = $1`, [key])
    },
    async list(prefix, { limit = 100, cursor } = {}) {
      await init()
      const rows = await run(
        `SELECT key, value FROM ${table} WHERE starts_with(key, $1) AND key > $2 AND (expires_at IS NULL OR expires_at > $3) ORDER BY key LIMIT $4`,
        [prefix, cursor ?? '', Date.now(), limit + 1],
      )
      return page(rows, limit)
    },
  }
}

/** Every client's way of running a query, as (text, params) → rows. */
function runner(db) {
  const rows = (result) => (Array.isArray(result) ? result : (result?.rows ?? []))
  if (typeof db === 'function' && typeof db.unsafe !== 'function' && typeof db.query !== 'function') return async (text, params) => rows(await db(text, params))
  if (typeof db?.unsafe === 'function') return async (text, params) => rows(await db.unsafe(text, params))
  if (typeof db?.query === 'function') return async (text, params) => rows(await db.query(text, params))
  throw new Error('slauth: postgres() needs a client with query(text, params), a postgres.js sql, or a (text, params) => rows function.')
}

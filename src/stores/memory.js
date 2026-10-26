/**
 * Keeps everything in memory. Lovely for tests and trying things out; everything is
 * forgotten when the process restarts, so use a real store before you ship.
 *
 * @returns {import('../index.js').Store}
 */
export function memory() {
  const rows = new Map()
  const live = (key) => {
    const row = rows.get(key)
    if (!row) return null
    if (row.expiresAt !== null && row.expiresAt <= Date.now()) {
      rows.delete(key)
      return null
    }
    return row
  }
  return {
    async get(key) {
      const row = live(key)
      return row ? structuredClone(row.value) : null
    },
    async put(key, value, { ttl } = {}) {
      rows.set(key, { value: structuredClone(value), expiresAt: ttl ? Date.now() + ttl * 1000 : null })
    },
    async delete(key) {
      rows.delete(key)
    },
  }
}

/**
 * Cloudflare Workers KV. Fine for small projects; note KV is eventually consistent
 * (a sign-in can take a moment to be seen in other regions) and its free tier allows
 * 1,000 writes a day. D1 is the better default on Workers.
 *
 * @param {KVNamespace} namespace  the KV binding, e.g. env.AUTH
 * @param {{ prefix?: string }} [options]
 * @returns {import('../index.js').Store}
 */
export function kv(namespace, { prefix = 'slauth:' } = {}) {
  return {
    get: (key) => namespace.get(prefix + key, 'json'),
    // KV can't expire anything sooner than 60 seconds.
    put: (key, value, { ttl } = {}) =>
      namespace.put(prefix + key, JSON.stringify(value), ttl ? { expirationTtl: Math.max(60, Math.ceil(ttl)) } : undefined),
    delete: (key) => namespace.delete(prefix + key),
    async list(keyPrefix, { limit = 100, cursor } = {}) {
      const page = await namespace.list({ prefix: prefix + keyPrefix, limit, cursor: cursor ?? undefined })
      const items = []
      for (const { name } of page.keys) {
        const value = await namespace.get(name, 'json')
        if (value !== null) items.push({ key: name.slice(prefix.length), value })
      }
      return { items, cursor: page.list_complete ? null : page.cursor }
    },
  }
}

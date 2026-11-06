// A no-dependencies smoke test for runtimes the full suite can't run on (Node 20 has no
// node:sqlite, which the store tests use): one email-code sign-in, start to finish.
//   node test/smoke.mjs
import assert from 'node:assert/strict'
import { slauth } from '../src/index.js'
import { memory } from '../src/stores/memory.js'

const mailbox = []
const auth = slauth({ secret: 'smoke-test-secret-123', store: memory(), email: { send: async (m) => void mailbox.push(m) }, passwords: { iterations: 1000 }, twoFactor: true, tokens: true })
const post = (path, body, cookie = '') =>
  auth.handle(new Request(`https://app.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.example', cookie }, body: JSON.stringify(body) }))

assert.equal((await post('/auth/email/start', { email: 'me@example.com' })).status, 200)
const verified = await post('/auth/email/verify', { email: 'me@example.com', code: mailbox[0].code })
assert.equal(verified.status, 200)
const cookie = verified.headers.get('set-cookie').split(';')[0]
const user = await auth.user(new Request('https://app.example/', { headers: { cookie } }))
assert.equal(user.email, 'me@example.com')
const { token } = await auth.createToken(user)
assert.equal((await auth.verifyToken(token)).sub, user.id)
console.log(`smoke test passed on Node ${process.versions.node}`)

// Browser end-to-end test against examples/workers-d1, with Chrome's virtual passkey
// authenticator. Run the example (npm run dev > dev.log), then:
//   OUT=/tmp node test/e2e-browser.mjs examples/workers-d1/dev.log
// Needs `playwright` installed wherever you run it from.

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const LOG = process.argv[2]
const BASE = 'http://localhost:8796'
let browser
try {
  browser = await chromium.launch()
} catch (e) { console.error(e); process.exit(1) }
const page = await browser.newPage()
const cdp = await page.context().newCDPSession(page)
await cdp.send('WebAuthn.enable')
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
page.on('dialog', (d) => d.accept())
const shot = (n) => (process.env.OUT ? page.screenshot({ path: `${process.env.OUT}/${n}.png` }) : null)

await page.goto(BASE)
await page.locator('slauth-sign-in').waitFor()
await shot('1-email')
await page.locator('slauth-sign-in input#email').fill('me@example.com')
await page.locator('slauth-sign-in button.primary').click()
await page.locator('slauth-sign-in input#code').waitFor()
await shot('2-code')
await new Promise((r) => setTimeout(r, 500))
const code = [...readFileSync(LOG, 'utf8').matchAll(/is (\d{6})/g)].pop()[1]
await page.locator('slauth-sign-in input#code').fill(code)
await page.locator('slauth-sign-in button.primary').click()
await page.locator('slauth-sign-in button[data-on="add"]').waitFor()
await shot('3-offer')
await page.locator('slauth-sign-in button[data-on="add"]').click()
await page.locator('#me').waitFor({ state: 'visible' })
console.log('signed in as:', await page.locator('#who').textContent())
await shot('4-signed-in')
await page.locator('#out').click()
await page.locator('slauth-sign-in').waitFor({ state: 'visible' })
console.log('signed out')
await page.locator('slauth-sign-in button[data-on="passkey"]').click()
await page.locator('#me').waitFor({ state: 'visible', timeout: 10000 })
console.log('passkey sign-in as:', await page.locator('#who').textContent())
await browser.close()

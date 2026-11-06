// Draws public/og.png, the share image, from the homepage's own sloth.
// Build and serve the site first (dist/ on http://localhost:4600), then:
//   node scripts/og-image.mjs public/og.png        (needs playwright)
import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' })
await p.goto('http://localhost:4600/')
const sloth = await p.locator('svg.hero-sloth').evaluate((el) => {
  const c = el.cloneNode(true); c.setAttribute('width', '330'); c.setAttribute('height', '345'); c.removeAttribute('class')
  for (const n of c.querySelectorAll('.line')) n.setAttribute('stroke', '#2b2118')
  return c.outerHTML
})
await p.setContent(`<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap">
<style>
body{margin:0;width:1200px;height:630px;background:#fdf6ec;font-family:'Bricolage Grotesque',system-ui,sans-serif;color:#2b2118;display:flex;align-items:center;justify-content:space-between;padding:0 64px;box-sizing:border-box;border:10px solid #2b2118}
h1{font-size:92px;line-height:.98;letter-spacing:-.04em;margin:0 0 22px;font-weight:800}
.hl{background:linear-gradient(transparent 58%,#f59e0b 58%,#f59e0b 90%,transparent 90%);padding:0 6px}
p{font-size:30px;margin:0 0 30px;color:#6b5d50;max-width:700px;line-height:1.3}
.pills{display:flex;gap:10px}.pill{white-space:nowrap;font-size:20px;font-weight:700;padding:6px 16px;border:3px solid #2b2118;border-radius:999px;background:#fff}
.pill:nth-child(2){background:#7aa340;color:#fff}.pill:nth-child(3){background:#f7b2c6}
</style></head><body><div><h1>slauth<br><span class="hl">auth you own</span></h1>
<p>Email codes &amp; passkeys in five minutes.<br>Providers, 2FA, orgs &amp; JWTs when you need them.</p>
<div class="pills"><span class="pill">open source · MIT</span><span class="pill">zero dependencies</span><span class="pill">your database</span></div></div>
${sloth}</body></html>`, { waitUntil: 'networkidle' }).catch(() => {})
await p.waitForTimeout(800)
await p.screenshot({ path: out })
await b.close()

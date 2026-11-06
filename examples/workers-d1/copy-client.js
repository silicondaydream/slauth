// The page loads <slauth-sign-in> straight from public/slauth/, no bundler needed.
// (With a bundler, just `import 'slauthjs/element'` in your front-end code instead.)
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const src = dirname(createRequire(import.meta.url).resolve('slauthjs/client'))
mkdirSync('public/slauth', { recursive: true })
for (const file of ['client.js', 'ui.js', 'element.js', 'account-element.js']) cpSync(join(src, file), join('public/slauth', file))
console.log('Copied the slauth browser files to public/slauth/')

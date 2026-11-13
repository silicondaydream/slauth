// Prints the CHANGELOG.md section for a version, and fails if there isn't one, so a
// release can't go out without notes. Used by the Release workflow and `pnpm release:check`.
//
//   node scripts/release-notes.mjs 2.1.0
import { readFileSync } from 'node:fs'

const version = process.argv[2] ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n')
const heading = (name) => lines.findIndex((line) => line.trim() === `## ${name}` || line.startsWith(`## ${name} `))
// A pre-release (2.1.0-rc.1) may use the coming version's notes, or Unreleased's.
let start = heading(version)
if (start === -1 && version.includes('-')) start = [heading(version.split('-')[0]), heading('Unreleased')].find((i) => i !== -1) ?? -1
if (start === -1) {
  console.error(`CHANGELOG.md has no "## ${version}" section. Rename "## Unreleased" to it in the release PR.`)
  process.exit(1)
}
const end = lines.findIndex((line, i) => i > start && line.startsWith('## '))
const notes = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim()
if (!notes) {
  console.error(`CHANGELOG.md's "## ${version}" section is empty.`)
  process.exit(1)
}
console.log(notes)

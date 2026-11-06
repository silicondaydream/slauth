// Plain-text views of the docs for AI assistants: https://llmstxt.org
import { getCollection, type CollectionEntry } from 'astro:content'
import { sidebar } from './sidebar.mjs'
import { NAME, SITE, SUMMARY, TAGLINE } from './seo'

type Doc = CollectionEntry<'docs'>

/** The docs in sidebar order, with their section. */
export async function orderedDocs(): Promise<{ section: string; doc: Doc }[]> {
  const docs = await getCollection('docs')
  const byId = new Map(docs.map((d) => [d.id, d]))
  const out: { section: string; doc: Doc }[] = []
  for (const group of sidebar) {
    for (const id of group.items) {
      const doc = byId.get(id)
      if (doc) out.push({ section: group.label, doc })
    }
  }
  return out
}

export const pageUrl = (doc: Doc) => `${SITE}/${doc.id}/`
export const markdownUrl = (doc: Doc) => `${SITE}/${doc.id}.md`

export function asMarkdown(doc: Doc) {
  const { title, description } = doc.data
  return `# ${title}\n\n> ${description ?? ''}\n\nSource: ${pageUrl(doc)}\n\n${(doc.body ?? '').trim()}\n`
}

export async function llmsTxt() {
  const lines = [`# ${NAME}`, '', `> ${TAGLINE}. ${SUMMARY}`, '']
  lines.push(
    'Install with `npm install slauthjs` (the npm name; the library is called slauth). The package is plain ESM with TypeScript types and no dependencies.',
    '',
    `Every docs page is also available as Markdown at the same address with \`.md\` (for example ${SITE}/docs/quickstart.md), and all of them together at ${SITE}/llms-full.txt.`,
    '',
  )
  let section = ''
  for (const { section: s, doc } of await orderedDocs()) {
    if (s !== section) {
      if (section) lines.push('')
      lines.push(`## ${s}`, '')
      section = s
    }
    lines.push(`- [${doc.data.title}](${markdownUrl(doc)}): ${doc.data.description ?? ''}`)
  }
  lines.push('', '## Optional', '', `- [How slauth compares with Auth.js and Clerk](${SITE}/compare/)`, `- [Source code (MIT)](https://github.com/silicondaydream/slauth)`, '')
  return lines.join('\n')
}

export async function llmsFullTxt() {
  const parts = [`# ${NAME}: the complete documentation\n\n> ${TAGLINE}. ${SUMMARY}\n`]
  for (const { doc } of await orderedDocs()) parts.push(asMarkdown(doc))
  return parts.join('\n---\n\n')
}

export const text = (body: string, type = 'text/plain') => new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8` } })

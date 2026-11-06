// Per-page extras for the docs: a share image, and schema.org data saying what each
// page is (a TechArticle in a breadcrumb trail), for search engines and AI assistants.
import { defineRouteMiddleware } from '@astrojs/starlight/route-data'
import { NAME, OG_IMAGE, SITE, canonical, jsonLd } from './lib/seo'

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute
  const { title, description } = route.entry.data
  const url = canonical(context.url.pathname)
  const head = route.head

  head.push(
    { tag: 'meta', attrs: { property: 'og:image', content: OG_IMAGE } },
    { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
    { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
    { tag: 'meta', attrs: { name: 'twitter:image', content: OG_IMAGE } },
    { tag: 'link', attrs: { rel: 'alternate', type: 'text/markdown', title: `${title} (Markdown)`, href: markdownPath(context.url.pathname) } },
  )

  const crumbs = [{ name: NAME, item: `${SITE}/` }, { name: 'Docs', item: `${SITE}/docs/` }]
  if (url !== `${SITE}/docs/`) crumbs.push({ name: title, item: url })
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: title,
      description,
      url,
      inLanguage: 'en',
      isPartOf: { '@type': 'WebSite', name: NAME, url: SITE },
      about: { '@type': 'SoftwareApplication', name: NAME, applicationCategory: 'DeveloperApplication' },
      publisher: { '@type': 'Organization', name: NAME, url: SITE, logo: `${SITE}/favicon.svg` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c })),
    },
  ]
  if (route.id === 'docs/faq') data.push(faq(route.entry.body ?? ''))
  for (const item of data) head.push({ tag: 'script', attrs: { type: 'application/ld+json' }, content: jsonLd(item) })
})

/** /docs/quickstart/ → /docs/quickstart.md (the plain-Markdown copy for AI tools). */
function markdownPath(pathname: string) {
  return `${pathname.replace(/\/$/, '') || '/docs'}.md`
}

/** FAQPage data from the FAQ's own "### Question" headings, so it never drifts. */
function faq(body: string) {
  const plain = (md: string) =>
    md
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*_]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const mainEntity = body
    .split(/^### /m)
    .slice(1)
    .map((chunk) => {
      const [question, ...rest] = chunk.split('\n')
      return { '@type': 'Question', name: plain(question), acceptedAnswer: { '@type': 'Answer', text: plain(rest.join('\n')) } }
    })
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity }
}

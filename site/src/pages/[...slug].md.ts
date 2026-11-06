// /docs/quickstart.md and friends: each docs page as plain Markdown, for AI tools.
import type { APIRoute, GetStaticPaths } from 'astro'
import { asMarkdown, orderedDocs, text } from '../lib/llms'

export const getStaticPaths: GetStaticPaths = async () =>
  (await orderedDocs()).map(({ doc }) => ({ params: { slug: doc.id }, props: { doc } }))

export const GET: APIRoute = ({ props }) => text(asMarkdown(props.doc), 'text/markdown')

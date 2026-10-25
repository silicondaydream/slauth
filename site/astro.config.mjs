import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// slauth.dev: the marketing pages live in src/pages, the docs (Starlight) under /docs.
export default defineConfig({
  site: 'https://slauth.dev',
  integrations: [
    starlight({
      title: 'slauth',
      disable404Route: true,
      description: 'Auth for side projects: email codes and passkeys, your own database, zero dependencies.',
      logo: { src: './src/assets/sloth.svg', alt: '' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/silicondaydream/slauth' }],
      customCss: ['./src/styles/docs.css'],
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=JetBrains+Mono:wght@400;600&display=swap',
          },
        },
      ],
      editLink: { baseUrl: 'https://github.com/silicondaydream/slauth/edit/main/site/' },
      sidebar: [
        { label: 'Start here', items: ['docs', 'docs/quickstart', 'docs/installation', 'docs/configuration'] },
        { label: 'Concepts', items: ['docs/concepts/how-it-works', 'docs/concepts/security'] },
        { label: 'Signing in', items: ['docs/sign-in/email-codes', 'docs/sign-in/passkeys', 'docs/sign-in/cloudflare-access', 'docs/sign-in/app-lock'] },
        { label: 'Plug in', items: ['docs/stores', 'docs/email'] },
        {
          label: 'Frameworks',
          items: [
            'docs/frameworks/cloudflare-workers',
            'docs/frameworks/hono',
            'docs/frameworks/astro',
            'docs/frameworks/nextjs',
            'docs/frameworks/bun',
            'docs/frameworks/deno',
            'docs/frameworks/node-express',
          ],
        },
        { label: 'In the browser', items: ['docs/client/sign-in-element', 'docs/client/helpers'] },
        {
          label: 'Recipes',
          items: ['docs/recipes/invite-only', 'docs/recipes/app-suite', 'docs/recipes/add-passkeys', 'docs/recipes/from-a-hardcoded-password'],
        },
        { label: 'Reference', items: ['docs/reference/api', 'docs/reference/routes', 'docs/reference/errors', 'docs/reference/storage-keys'] },
        { label: 'Help', items: ['docs/faq'] },
      ],
    }),
  ],
})

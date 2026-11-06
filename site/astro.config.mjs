import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import { sidebar } from './src/lib/sidebar.mjs'

// slauth.dev: the marketing pages live in src/pages, the docs (Starlight) under /docs.
export default defineConfig({
  site: 'https://slauth.dev',
  integrations: [
    starlight({
      title: 'slauth',
      disable404Route: true,
      description: 'Open-source auth you own: email codes, passkeys, providers, two-factor and organizations. Your database, zero dependencies.',
      logo: { light: './src/assets/sloth.svg', dark: './src/assets/sloth-dark.svg', alt: '' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/silicondaydream/slauth' }],
      customCss: ['./src/styles/docs.css'],
      routeMiddleware: './src/route-data.ts',
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
      sidebar,
    }),
  ],
})

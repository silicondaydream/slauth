// The docs sidebar, shared by astro.config.mjs and the llms.txt endpoints.
export const sidebar = [
  { label: 'Start here', items: ['docs', 'docs/quickstart', 'docs/installation', 'docs/configuration'] },
  { label: 'Concepts', items: ['docs/concepts/how-it-works', 'docs/concepts/security'] },
  {
    label: 'Signing in',
    items: [
      'docs/sign-in/email-codes',
      'docs/sign-in/passkeys',
      'docs/sign-in/providers',
      'docs/sign-in/magic-links',
      'docs/sign-in/passwords',
      'docs/sign-in/two-factor',
      'docs/sign-in/cloudflare-access',
      'docs/sign-in/app-lock',
    ],
  },
  {
    label: 'Accounts',
    items: ['docs/accounts/users', 'docs/accounts/sessions', 'docs/accounts/organizations', 'docs/accounts/tokens', 'docs/accounts/events'],
  },
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
  { label: 'In the browser', items: ['docs/client/sign-in-element', 'docs/client/account-element', 'docs/client/helpers'] },
  {
    label: 'Recipes',
    items: ['docs/recipes/invite-only', 'docs/recipes/app-suite', 'docs/recipes/add-passkeys', 'docs/recipes/from-a-hardcoded-password'],
  },
  { label: 'Reference', items: ['docs/reference/api', 'docs/reference/routes', 'docs/reference/errors', 'docs/reference/storage-keys'] },
  { label: 'Help', items: ['docs/faq'] },
]

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

## Variáveis de ambiente

Use o arquivo `.env.example` como base:

- copie para `.env.local`
- preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- para scripts/rotas internas server-side, configure também `SUPABASE_SERVICE_ROLE_KEY`

Por segurança, **não** comite `.env.local`.

## AI test routes (dev-only)

This project contains an internal route and page used for AI integration testing:

- POST /api/ai/test
- GET /ai-test

For safety, both are disabled by default and only work in development when this env var is explicitly enabled:

- ALLOW_AI_TEST_ROUTE=true

Recommendation: enable only locally via .env.local and never in production.

## Proxy (Next 16+) — padrão do projeto

Este projeto usa **Next.js Proxy** via o arquivo `proxy.ts` na raiz.

> No Next.js 16+, a convenção de arquivo `middleware.ts` foi **renomeada/deprecada** em favor de `proxy.ts`.

Links oficiais (pra não ter dúvida):

- https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy

Notas rápidas:

- Só existe **um** `proxy.ts` por projeto; use `config.matcher` para limitar onde roda.
- Neste repo, o `proxy.ts` **não intercepta** `/api/*` (Route Handlers devem responder com 401/403). Isso evita redirects 307 para `/login` quebrando `fetch`/SDKs.

Importante: aqui “Proxy” é uma feature do Next. Não confundir com as rotas internas de IA (ex.: **`/api/ai/chat`** e **`/api/ai/tasks/*`**) usadas pela camada de IA.

## Permissões (RBAC)

- Ver `docs/security/RBAC.md` (papéis: **admin** e **vendedor**, e o que cada um pode/não pode fazer).

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

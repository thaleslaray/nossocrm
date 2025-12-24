# Copilot instructions — NossoCRM (crmia-next)

## Visão geral (arquitetura real)
- **Next.js 16 (App Router)**: rotas e layouts em `app/` (ex.: `app/(protected)/*`, `app/api/*`).
- UI/DOMínio: componentes compartilhados em `components/`, páginas/fluxos maiores em `features/`.
- Estado/dados: contexts em `context/` (muitos são “fachadas” por cima de TanStack Query) e queries em `lib/query/`.
- Backend principal: **Supabase** (browser SSR client + server SSR client + service role em casos específicos).

## Convenções importantes do projeto
- **Proxy do Next 16+**: a autenticação/refresh/redirects rodam via `proxy.ts` (não `middleware.ts`).
  - Veja `proxy.ts` + `lib/supabase/middleware.ts` (`updateSession`).
  - O proxy **não intercepta `/api/*`** (Route Handlers devem responder 401/403; evitar redirect 307 quebrando `fetch`).
- **Supabase client boundary**:
  - Client: `lib/supabase/client.ts` pode retornar `null` quando `.env` não está configurado (log: `[supabase] Not configured`).
  - Server: `lib/supabase/server.ts` usa `server-only` e `createServerClient` (envs com `!`).
  - Service role (sem cookies): `createStaticAdminClient()` em `lib/supabase/server.ts` (usado por IA/ferramentas).

## Ambiente (env)
- Use `.env.example` como base e copie para `.env.local`.
- Obrigatórias no client/dev: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Server-only: `SUPABASE_SERVICE_ROLE_KEY` (nunca expor no client; usado por scripts e por `lib/ai/tools.ts`).

## IA (padrão atual)
- **Chat (AI SDK v6, streaming)**:
  - UI: `components/ai/UIChat.tsx` usa `useChat()` e chama `POST /api/ai/chat`.
  - API: `app/api/ai/chat/route.ts` aplica same-origin (`lib/security/sameOrigin.ts`), valida usuário, resolve `organizationId` via `profiles` e cria agente (`lib/ai/crmAgent.ts`).
  - Chave/modelo: **org-wide** em `organization_settings` (fonte de verdade).
    - Qualquer fallback para `user_settings` deve ser tratado como legado/compat e não como fluxo recomendado.
  - Ferramentas: `lib/ai/tools.ts` usa service role e **sempre filtra por `organization_id`** do contexto.
- **Tasks (AI SDK v6, output estruturado/JSON)**:
  - API: `app/api/ai/tasks/**/route.ts`.
  - Client: `lib/ai/tasksClient.ts`.
- Rotas internas de teste (dev-only): `ALLOW_AI_TEST_ROUTE=true` (ver README).

## Workflows do dia a dia
- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Testes: `npm run test:run` (Vitest). Config em `vitest.config.ts` roda **com DOM (happy-dom)** por padrão.

## Testes (particularidades)
- Setup: `test/setup.ts` (carrega `.env/.env.local` + fallback monorepo; mock de `server-only`).
- DOM setup: `test/setup.dom.ts` (matchers do jest-dom e polyfills básicos de `window/navigator`).

## Como contribuir sem quebrar padrões
- Ao mexer em auth/redirects: ajuste `proxy.ts` + `lib/supabase/middleware.ts` e **não** inclua `/api/*` no proxy.
- Ao mexer na IA:
  - mantenha o fluxo principal em `/api/ai/chat` + `lib/ai/*`.
  - se tocar em queries com service role, garanta filtro por `organization_id` (exemplos em `lib/ai/tools.ts`).

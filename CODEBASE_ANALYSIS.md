# Análise da codebase — `crmia-next`

Data: 2025-12-14

> Objetivo: documentar **arquitetura real**, fluxos críticos e principais riscos técnicos, com foco em Next.js + Supabase + camada de IA.

---

## Stack e dependências relevantes

- **Next.js 16.0.10** (App Router)
- **React 19.2.1**
- **TypeScript 5** (com `strict: false`, mas `strictNullChecks: true`)
- **TailwindCSS 4**
- **TanStack Query v5**
- **Supabase**
  - `@supabase/ssr` (browser + server SSR client)
  - `@supabase/supabase-js` (admin/static)
- **AI**
  - `ai` + `@ai-sdk/react` + `@ai-sdk/rsc` (AI SDK v6)
  - `@ai-sdk/google` (Gemini)
- Testes: **Vitest** (config atual executa apenas `test/**/*.ts`)

Observação importante: o roteamento é **100% Next App Router** (sem `react-router-dom` / sem Pages Router).

Nota de terminologia (evita confusão):

- **Proxy** = feature do Next (`proxy.ts` na raiz, ex-`middleware.ts`).
- **ai-proxy** = nome legado usado na codebase para um endpoint interno de IA (removido no corte seco). Hoje o padrão é `/api/ai/chat` (chat) e `/api/ai/tasks/*` (tasks).

---

## Visão geral da arquitetura (de fato)

A aplicação está estruturada em **Next App Router** (pasta `app/`) para rotas e layouts, enquanto `features/` e `components/` concentram UI e lógica de domínio reutilizável.

Não há runtime de React Router e não há `pages/` como roteador legado.

---

## Estrutura por pastas (mapa mental)

### `app/` (rotas Next)
- `app/layout.tsx`: root layout (font, theme base)
- `app/login/page.tsx`: login (Supabase browser client)
- `app/(protected)/layout.tsx`: providers + `Layout` (UI shell)
- `app/(protected)/*/page.tsx`: wrappers que fazem `dynamic(() => import('@/features/...'), { ssr:false })`
- `app/api/ai/chat/route.ts`: endpoint de chat com **AI SDK v6** + ferramentas (ToolLoopAgent)
- `app/api/chat/route.ts`: reexport do endpoint acima
- `app/auth/callback/route.ts`: callback de OAuth/magic link (exchange code)

### `components/`
- `Layout.tsx`: shell principal (sidebar/nav/header) usando `next/link` + `usePathname`
- `components/ai/UIChat.tsx`: chat UI via `@ai-sdk/react` consumindo `/api/ai/chat`

### `context/`
- `AuthContext.tsx`: sessão/usuário/perfil; também chama `rpc('is_instance_initialized')`
- `CRMContext.tsx`: “fachada” legada agregando deals/contacts/boards/settings/etc
- `AIContext.tsx`, `AIChatContext.tsx`: contexto do assistente e contexto de página

Além disso, existem contexts “por domínio” que hoje funcionam como **façade/adapter** por cima do TanStack Query:

- `context/boards/BoardsContext.tsx`: fonte de verdade = `useBoardsQuery`; mantém **apenas** estado de UI (`activeBoardId`) local.
- `context/deals/DealsContext.tsx`: fonte de verdade = `useDealsQuery`; expõe CRUD via `dealsService` e invalida cache.
- `context/contacts/ContactsContext.tsx`: fonte de verdade = `useContactsQuery`/`useCompaniesQuery`; expõe maps (`companyMap`, `contactMap`) e CRUD.
- `context/activities/ActivitiesContext.tsx`: fonte de verdade = `useActivitiesQuery`; expõe CRUD.
- `context/settings/SettingsContext.tsx`: ainda é majoritariamente **useState + fetchSettings** (não está no TanStack Query), com parte em Supabase (`user_settings`, `lifecycle_stages`) e parte ainda “local-only” (custom fields/tags/leads).

### `lib/supabase/`
- `client.ts`: browser client (retorna `null` se envs faltarem)
- `server.ts`: server client (usa `!` nos envs; pode quebrar se envs faltarem)
- `middleware.ts`: função `updateSession()` para refresh + redirects

Obs.: o antigo cliente “ai-proxy” foi removido no corte seco; IA agora usa `/api/ai/chat` e `/api/ai/tasks/*`.

Observação: há um `.env` no root com placeholders (e já está ignorado no git). Variáveis essenciais:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (somente servidor)

### `lib/ai/`
- `crmAgent.ts`: cria ToolLoopAgent (Google model) + injeta contexto
- `tools.ts`: implementa ferramentas (CRUD/queries) via **service role**
- `actions.tsx`: server action com `streamUI` (parece uma implementação paralela/legada)

### `lib/ai/tasks/`
- `schemas.ts`: contratos Zod das tasks
- `server.ts`: helper de auth/contexto (same-origin + profile/org settings)
- `tasksClient.ts`: cliente para chamar `POST /api/ai/tasks/*`

### `services/`

Obs.: a camada não-streaming legada foi removida; tarefas determinísticas agora vivem em `/api/ai/tasks/*`.

### `lib/query/` (TanStack Query)

Existe uma camada bem definida de cache/keys e hooks por entidade:

- `lib/query/index.tsx`: cria `QueryClient` com `staleTime`/`gcTime`, handlers globais e helper `useOptimisticMutation`.
- `lib/query/queryKeys.ts`: `queryKeys` centralizado via factories (`createQueryKeys` / `createExtendedQueryKeys`).
- `lib/query/hooks/*`: hooks por entidade (`useDealsQuery`, `useBoardsQuery`, `useContactsQuery`, `useActivitiesQuery`) + `useMoveDeal`.

Nota importante: boa parte dos filtros é **client-side** (o hook busca tudo via `getAll()` e filtra no client). Isso simplifica, mas vira gargalo com volume alto.

---

## Fluxos críticos

### 1) Autenticação (Supabase)

- **Client**: `lib/supabase/client.ts` cria `createBrowserClient` se `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` estiverem configuradas e não forem placeholder.
- **Server**: `lib/supabase/server.ts` usa `createServerClient` com `cookies()`; porém **não valida envs** (usa `!`).

### 2) Proteção de rotas

- Existe uma função de “middleware” (lógica de sessão) em `lib/supabase/middleware.ts`.
- A integração com o Next é feita via `proxy.ts` na raiz, seguindo a convenção oficial do **Next.js 16+**.

✅ Status (confirmado via docs oficiais do Next): `proxy.ts` **é** reconhecido pelo Next 16+ quando:
- o arquivo está na raiz do projeto (ou em `src/`)
- exporta **uma única função** (default export ou named `proxy`)
- `config.matcher` (se usado) contém **constantes** (valores dinâmicos são ignorados)

Links oficiais (deixar isso explícito evita confusão com `middleware.ts`):

- https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy

Observações importantes da doc:
- Mesmo que você exclua `/_next/data` via matcher negativo, o Next pode **ainda invocar** o Proxy para `/_next/data/*` por segurança (para evitar “buracos” onde a página está protegida mas o data route não).
- Proxy é “último recurso” e roda muito cedo na pipeline; evite lógica pesada e seja criterioso no matcher.

Além disso, o Proxy não deve substituir um sistema inteiro de autorização: use-o para redirects/headers/cookies e mantenha regras de acesso reais em Route Handlers, Server Components e/ou RLS no Supabase.

### 3) Chat/IA (implementação nova — AI SDK v6)

- UI: `components/ai/UIChat.tsx` usa `useChat()` e envia contexto (boardId/dealId/etc) no body.
- API: `app/api/ai/chat/route.ts`
  1. valida usuário (`supabase.auth.getUser()`)
  2. busca `organization_id` em `profiles`
  3. busca `ai_google_key` e `ai_model` em `organization_settings`
  4. cria agente via `lib/ai/crmAgent.ts` (ToolLoopAgent)
  5. stream via `createAgentUIStreamResponse`

Pontos fortes:
- chave do provedor é **por organização**, buscada server-side
- contexto é enriquecido (board/stages/métricas)

Pontos de atenção:
- `lib/ai/tools.ts` usa **service role** para bypass RLS.
  - Isso é aceitável se (e somente se) `organizationId` for confiável (hoje vem do profile server-side).
  - Ainda assim, exige auditoria: logs + validações + limites.

### 4) Tasks/IA (implementação atual — AI SDK v6, JSON)

- API: `app/api/ai/tasks/**/route.ts`
- Client: `lib/ai/tasksClient.ts`

Essas rotas cobrem tarefas determinísticas (ex.: wizards/modais/briefings) com validação de input/output (Zod) e execução via `generateObject`/`generateText`.

⚠️ Atenção: existe `app/api/ai/test/route.ts` (dev-only) com comentário "DELETE THIS FILE BEFORE PRODUCTION". Hoje ela está **desabilitada por padrão** e só habilita em desenvolvimento com `ALLOW_AI_TEST_ROUTE=true`, além de aplicar mitigação same-origin. Mesmo assim, trate como rota interna e nunca habilite em produção.

Isso tende a gerar divergência de comportamento e de schema (vide abaixo).

---

## Inconsistências técnicas relevantes (achados)

### A) Rotas públicas citadas vs rotas reais
- `updateSession()` trata `/join` como público.
- Não há rota `app/join` no App Router (nem `pages/join.tsx`).
- Há `pages/JoinPage.tsx`, mas esse arquivo parece ser **componente legada**, não rota Next.

### B) Next middleware possivelmente não ativo
- Arquivo “middleware” está como `proxy.ts`.
- Se isso não for suportado pelo Next, o comportamento real é:
  - sem refresh de sessão
  - sem redirect server-side

### C) Divergência de schema nas camadas de IA
- `lib/ai/tools.ts` consulta `deals`, `board_stages`, `organization_id`.
- `lib/ai/actions.tsx` (RSC streamUI) consulta `deals` com `.eq('user_id', user.id)` e usa `stages` (não `board_stages`).

Isso indica código “duplo” (antigo/novo) ou migração incompleta.

### D) Testes não cobrem o front
- `vitest.config.ts` roda apenas `test/**/*.{test,spec}.ts`.
- Existem testes `.test.tsx` em `components/` e `features/`, mas **não entram** no include.

### E) Duplicação/legado em “consent”

Há **três** implementações diferentes de consentimento:

1) `services/consentService.ts` (usada por `components/ConsentModal.tsx`): modelo por `consent_type` + `version` + `consented_at`.
2) `lib/supabase/consent.ts`: consentimento único `AI_CONSENT` com `grantConsent/hasConsent` e log via RPC.
3) `lib/supabase/consents.ts`: espera um schema diferente (`terms_accepted`, `privacy_accepted`, etc.) que **não bate** com `supabase/migrations/schema.sql`.

Pelo schema atual, (3) parece **obsoleto** e é candidato a remoção/arquivo morto.

### F) “Defense-in-depth” declarado vs implementado

`lib/supabase/activities.ts` afirma ter verificação extra de `organization_id`, mas na prática o CRUD está baseado apenas em RLS (não há checagem explícita do tenant no client). Não é necessariamente errado, mas o comentário está enganoso.

---

## Recomendações priorizadas

### P0 (segurança/produção)
1. Confirmar/ajustar Proxy do Next:
  - no Next 16+ a convenção correta é `proxy.ts` (não `middleware.ts`).
  - se precisar compatibilidade com Next < 16, aí sim considere manter/introduzir `middleware.ts` (ou rodar o codemod de migração no sentido inverso conforme necessidade do projeto).
2. Padronizar estratégia de proteção:
   - server-side via middleware + redirects
  - evitar depender de proteção client-only para garantir acesso (Route Handlers devem retornar 401/403).
3. Remover hardcode de URL Supabase em `components/ai/ToolInvocation.tsx`.

### P1 (coerência e manutenção)
1. Decidir um único “sistema de rotas” (Next App Router) e remover o que restou de React Router (ou isolar completamente).
2. Unificar camada de IA:
   - escolher `/api/ai/chat` (AI SDK v6) como caminho principal
   - migrar os casos do `geminiService` gradualmente ou manter o proxy como backend único
3. Consolidar schema e queries (`organization_id` vs `user_id`, `board_stages` vs `stages`).

### P2 (DX/qualidade)
1. Ajustar Vitest para incluir testes de UI (happy-dom) se desejado.
2. Subir `strict: true` gradualmente (há comentários indicando migração).

---

## “Como eu sei que isso é verdade?” (evidências)

- Rotas de IA: `app/api/ai/chat/route.ts` e reexport em `app/api/chat/route.ts`.
- Middleware/auth: `lib/supabase/middleware.ts` e `proxy.ts`.
- Proxy/auth: `proxy.ts` (Next) + `lib/supabase/middleware.ts` (refresh + redirects).
- Duas IAs: `services/geminiService.ts` + `lib/supabase/ai-proxy.ts` (legado) vs `lib/ai/*` (novo).


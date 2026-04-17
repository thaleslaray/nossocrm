# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server (porta 3000; se ocupada: fuser -k 3000/tcp)
npm run build        # Build de produção
npm run lint         # ESLint com zero warnings
npm run typecheck    # TypeScript (tsc --noEmit)
npm run test         # Vitest em watch mode
npm run test:run     # Vitest single run
npm run precheck     # lint + typecheck + test:run + build (pré-PR)
npm run precheck:fast # lint + typecheck + test:run (sem build)
npm run stories      # Rodar test/stories/ (testes de comportamento)
```

Teste específico:
```bash
npx vitest run path/to/file.test.ts
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL + Auth + Edge Functions) · TanStack Query v5 · Zustand v5 · Tailwind CSS v4 · Radix UI · Zod v4 · AI SDK v6 (multi-provider: Anthropic/OpenAI/Google)

## Arquitetura

### Estrutura de Diretórios

```
app/               # Next.js App Router
  (app)/           # Rotas autenticadas (layout principal)
  (protected)/     # Rotas protegidas por auth
  api/             # API Routes (ai/, messaging/, contacts/, settings/, etc.)
features/          # Módulos por domínio de negócio
  activities/ boards/ contacts/ dashboard/ deals/ inbox/
  messaging/ settings/ ai-hub/ decisions/ reports/
components/        # Componentes React compartilhados (não feature-specific)
  ui/              # Primitivos UI (button, modal, badge, etc.)
  ai/              # UIChat, chat-related
lib/               # Utilitários e serviços compartilhados
  ai/              # AI agent, briefing, few-shot, HITL, tools
  messaging/       # Providers (Meta, Evolution, Resend, Zapi)
  query/           # Query keys factory + hooks TanStack Query
  supabase/        # Clients e helpers Supabase (ver seção abaixo)
  stores/          # Zustand stores (somente UI state efêmero)
context/           # React context providers — fachadas sobre TanStack Query
  AuthContext.tsx  # Fornece user, profile, organizationId, signOut
supabase/
  functions/       # Edge Functions (webhooks de mensageria)
  migrations/      # Migrations SQL
proxy.ts           # Auth proxy Next.js 16+ (NÃO é middleware.ts)
```

### Auth e Routing (Next.js 16+)

**`proxy.ts` (não `middleware.ts`)**: No Next.js 16+, o arquivo de proxy chama-se `proxy.ts` (raiz do projeto). Ele apenas faz refresh de sessão Supabase SSR e redirect para `/login`. **Não intercepta `/api/*`** — Route Handlers respondem 401/403 diretamente (redirect 307 quebraria `fetch`).

```typescript
// proxy.ts usa:
import { updateSession } from '@/lib/supabase/middleware'
```

### Clientes Supabase

Há três clientes com propósitos distintos:

| Cliente | Arquivo | Uso |
|---------|---------|-----|
| Browser SSR | `lib/supabase/client.ts` | Componentes client-side; pode retornar `null` sem `.env` |
| Server SSR | `lib/supabase/server.ts` | Route Handlers e Server Components (usa `server-only`) |
| Service Role | `lib/supabase/staticAdminClient.ts` | IA/ferramentas sem cookies — ignora RLS, sempre filtrar por `organization_id` |

**Importar sempre de `@/lib/supabase`** (barrel export) — nunca de subcaminhos diretamente.

### Variáveis de Ambiente

Supabase introduziu novo formato de chaves (Nov 2025) com fallback de compatibilidade:

```
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  → fallback: NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY                   → fallback: SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SECRET_KEY` é server-only — nunca expor no client.

### Padrões Críticos

**cn utility**: importar de `@/lib/utils` (não `@/lib/utils/cn`)

**Auth**: `useAuth()` de `@/context/AuthContext` retorna `{ user, profile, organizationId, signOut }`

**Query Keys**: todas as queries usam o factory em `lib/query/queryKeys.ts`
```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.deals.all })
queryClient.invalidateQueries({ queryKey: queryKeys.deals.list({ boardId }) })
```

**Deals — source of truth única**:
```typescript
// DEALS_VIEW_KEY = [...queryKeys.deals.lists(), 'view']
// Usar esta key em TODOS os pontos de escrita (mutations, Realtime, otimismo)
queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, updater)  // preferível a invalidate
```
Nunca usar `queryKeys.deals.list({ filter })` para optimistic updates — são caches separados.

**AI SDK v6**: usar `generateText + Output.object({ schema })`, resultado em `result.output`
```typescript
// CORRETO
const result = await generateText({ ...options, output: Output.object({ schema: MySchema }) })
result.output // typed result

// ERRADO — API antiga
await generateObject({ ... })
```

**Chaves de API do AI**: ficam em `organization_settings` (banco), não em env vars
```typescript
const config = await getOrgAIConfig(orgId) // lê ai_google_key, ai_openai_key, ai_anthropic_key
const model = getModel(config.provider, config.apiKey, config.model)
```

**Realtime**: invalidação targeted em `lib/realtime/useRealtimeSync.ts` — nunca invalidar globalmente. UPDATE/DELETE usam debounce; INSERT não.

**Sanitize**: usar `sanitizePostgrestValue()` e `sanitizeUrl()` de `lib/utils/sanitize.ts`

**RLS defense-in-depth**: todas as queries filtram por `organization_id` além do RLS — especialmente crítico com service role (IA/tools).

**maybeSingle() vs single()**: usar `.maybeSingle()` para lookups que podem retornar 0 rows; `.single()` lança erro se não encontrar.

**Schema Supabase**: tabela `board_stages` (não `stages`), coluna `"order"` (não `position`)

### AI — Fluxo de Dados

Dois caminhos distintos:

1. **Chat interativo (streaming)**: `UIChat` → `POST /api/ai/chat` → `lib/ai/crmAgent.ts` → ferramentas em `lib/ai/tools.ts`
2. **Tasks / structured output**: `lib/ai/tasksClient.ts` → `app/api/ai/tasks/**/route.ts`

**HITL (Human-in-the-Loop)**:
- `confidence >= hitlThreshold` (default 0.85) → avança automaticamente
- `0.70 <= confidence < hitlThreshold` → cria `ai_pending_stage_advances` (aprovação humana)
- `confidence < 0.70` → não sugere avanço

**Segurança de prompt**: todo conteúdo de mensagem do usuário vai dentro de `<lead_message>` tags — nunca interpolar diretamente no system prompt.

### Supabase Edge Functions

Webhooks de mensageria são Edge Functions (não API Routes):
- `messaging-webhook-evolution` — Evolution API (WhatsApp)
- `messaging-webhook-meta` — Meta Cloud API (WhatsApp + Instagram)
- `messaging-webhook-resend` — Email via Resend
- `messaging-webhook-zapi` — Z-API (WhatsApp)

Webhooks retornam HTTP 200 mesmo em erros de processamento (evita retry storms).

### Credenciais de Canal

Credenciais nunca retornam ao client em list queries — só no detail query para edição, mascaradas.

### Feature Flags

Controladas por `instanceFlags` (operador) via `queryKeys.instanceFlags.byOrg(orgId)`.

### Testes

- Testes unitários: arquivos `.test.ts(x)` ao lado do código-fonte (features/components)
- Testes de comportamento (user stories): `test/stories/`
- Testes de integração/agent: diretamente em `test/`
- Setup: `test/setup.ts` (carrega `.env.local`, mock `server-only`) + `test/setup.dom.ts` (jest-dom, polyfills)
- Ambiente padrão: `happy-dom` (todos os testes rodam com DOM)

### Migrations

Migrations em `supabase/migrations/` com timestamp `YYYYMMDDHHMMSS`. Sempre idempotentes (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). Não deletar migrations históricas — tabelas legadas (`voice_calls`, `whatsapp_calls`) existem no banco sem código correspondente.

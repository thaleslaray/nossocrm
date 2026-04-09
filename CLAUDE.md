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

Para rodar um teste específico:
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
  api/             # API Routes
features/          # Módulos por domínio de negócio
  activities/ boards/ contacts/ dashboard/ deals/ inbox/
  messaging/ settings/ ai-hub/
lib/               # Utilitários e serviços compartilhados
  ai/              # AI agent, briefing, few-shot, HITL
  messaging/       # Providers (Meta, Evolution, Resend, Zapi)
  query/           # Query keys factory + hooks TanStack Query
  supabase/        # Clients e helpers Supabase
  stores/          # Zustand stores
context/           # React context providers (Auth, CRM, Messaging)
supabase/
  functions/       # Edge Functions (webhooks de mensageria)
  migrations/      # Migrations SQL
```

### Padrões Críticos

**Supabase client**: sempre importar de `@/lib/supabase` (não `@/lib/supabase/client`)

**cn utility**: importar de `@/lib/utils` (não `@/lib/utils/cn`)

**Auth**: `useAuth()` de `@/context/AuthContext` retorna `{ user, profile }`

**Query Keys**: todas as queries usam o factory em `lib/query/queryKeys.ts`
```typescript
// Pattern: queryKeys.entity.action(params)
queryClient.invalidateQueries({ queryKey: queryKeys.deals.all })
queryClient.invalidateQueries({ queryKey: queryKeys.deals.list({ boardId }) })
```

**AI SDK v6**: usar `generateText + Output.object({ schema })`, resultado em `result.output`
```typescript
// CORRETO
const result = await generateText({ ... output: Output.object({ schema }) })
result.output // typed result

// ERRADO — API antiga
await generateObject({ ... })
```

**Chaves de API do AI**: ficam em `organization_settings` (banco), não em env vars
```typescript
const config = await getOrgAIConfig(orgId) // lê ai_google_key, ai_openai_key, ai_anthropic_key
const model = getModel(config.provider, config.apiKey, config.model)
```

**Realtime**: invalidação targeted em `lib/realtime/useRealtimeSync.ts` — nunca invalidar globalmente

**Mutations**: sempre otimistas no Kanban; `DEALS_VIEW_KEY` é a única source of truth para deals

**Sanitize**: usar `sanitizePostgrestValue()` e `sanitizeUrl()` de `lib/utils/sanitize.ts`

**RLS defense-in-depth**: todas queries de messaging filtram por `organization_id` além do RLS

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

# Implementation Plan: WhatsApp Lite (Nativo)

**Branch**: `Featwhatsapp-lite-nativo` | **Date**: 2026-01-07 | **Spec**: `specs/Featwhatsapp-lite-nativo/spec.md`
**Input**: Feature specification from `specs/Featwhatsapp-lite-nativo/spec.md`

## Summary

Implementação do WhatsApp Lite (nativo) usando Supabase Edge Function (`supabase/functions/zapi-in`) para ingestão de webhooks Z-API, persistindo em tabelas `whatsapp_*`, e expondo APIs autenticadas no Next.js para leitura da thread e takeover humano.

- Ingestão: `POST /functions/v1/zapi-in/<token>` (token por `whatsapp_accounts.webhook_token`).
- Leitura: `GET /api/whatsapp/thread?contactId=<uuid>&dealId=<uuid?>`.
- Takeover: `POST /api/whatsapp/takeover`.

## Technical Context

**Language/Version**: TypeScript 5.x (repo), React 19, Next.js 16 (App Router)  
**Primary Dependencies**: Supabase (ssr + supabase-js), Zod (validação), libphonenumber-js (normalização telefone)  
**Storage**: Postgres (Supabase) + RLS  
**Testing**: Vitest (happy-dom) + Testing Library  
**Target Platform**: Web (Next.js) + Supabase Edge Functions (Deno runtime)  
**Project Type**: Web (Next.js App Router)  
**Performance Goals**: webhook p95 baixo; respostas rápidas (persistência + retorno 200)  
**Constraints**: multi-tenant obrigatório; rotas `/api/*` sem redirect; service role nunca no client  
**Scale/Scope**: por organização, 1 conta Z-API (singleton) e múltiplas conversas/mensagens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] Todas as queries/mutações filtram por `organization_id`.
- [x] Rotas `/api/*` retornam `401/403` (sem redirect) quando não autenticado.
- [x] Boundary do Supabase respeitada (server-only no server, client pode ser `null`).
- [x] Regras de cache respeitadas (esta feature não define caches TanStack diretamente; mutações/listas existentes não são alteradas aqui).
- [x] IA: não impacta fluxo principal; sem tools novas.
- [x] Qualidade: lint/typecheck/testes existentes; novos testes recomendados se mudar parsing/rotas.

## Project Structure

### Documentation (this feature)

```text
specs/Featwhatsapp-lite-nativo/
 plan.md
 spec.md
 research.md
 data-model.md
 quickstart.md
 contracts/
    openapi.yaml
 tasks.md
```

### Source Code (repository root)

```text
supabase/
 functions/
    zapi-in/index.ts
 migrations/
     20260104010000_whatsapp_core.sql
     20260104020000_whatsapp_zapi_singleton.sql

app/api/whatsapp/
 thread/route.ts
 takeover/route.ts

features/settings/
 components/WhatsAppSection.tsx
```

**Structure Decision**: manter ingestão no Supabase (edge function) por necessidade de service role e alta tolerância a payloads variáveis; manter leitura/takeover no Next.js como endpoints autenticados por cookie.

## Phase 0  Outline & Research (Output: `research.md`)

Objetivo: fechar decisões e reduzir ambiguidades do payload Z-API.

- Decidir estratégia de autenticação do webhook (token na URL via `whatsapp_accounts.webhook_token`).
- Confirmar idempotência/dedupe (unique index + upsert onConflict quando `provider_message_id` existe).
- Definir estratégia de threading (`provider_conversation_id` preferindo chatId/remoteJid; fallback por telefone).
- Confirmar normalização de telefone (BR -> E.164) e fallback seguro.

## Phase 1  Design & Contracts

### Data Model (Output: `data-model.md`)

Documentar entidades existentes (`whatsapp_accounts`, `whatsapp_conversations`, `whatsapp_messages`), relacionamentos, regras de validação e políticas RLS.

### API Contracts (Output: `contracts/openapi.yaml`)

Documentar endpoints:
- Supabase: `POST /functions/v1/zapi-in/{token}`
- Next.js: `GET /api/whatsapp/thread`
- Next.js: `POST /api/whatsapp/takeover`

### Quickstart (Output: `quickstart.md`)

Passo-a-passo para:
- aplicar migrations
- deploy da Edge Function
- criar `whatsapp_accounts`
- configurar webhook Z-API
- testar ponta-a-ponta

## Phase 2  Planning

`tasks.md` cobre as atividades (implementação, testes e validações). Este `/speckit.plan` termina após a geração de research/design/contratos/quickstart e atualização de contexto do agente.

## Post-Design Constitution Re-check

- Multi-tenant e boundary Supabase continuam obrigatórios.
- Rotas `/api/*` devem manter `401/403` e mitigação CSRF (`isAllowedOrigin`).
- Contratos e quickstart não podem sugerir expor service role no client.

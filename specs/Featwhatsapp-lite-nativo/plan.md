
# Implementation Plan: WhatsApp Lite (Nativo) — Auto-criação de contato + deal

**Branch**: `Featwhatsapp-lite-nativo` | **Date**: 2026-01-14 | **Spec**: `specs/Featwhatsapp-lite-nativo/spec.md`

## Summary

Evoluir a ingestão inbound do WhatsApp Lite (Z-API) para que, ao receber mensagem de um número ainda não cadastrado, o sistema crie automaticamente:

- um `contacts` (com `phone` normalizado em E.164 quando possível)
- um `deals` “aberto” associado ao contato, em um board/stage default

Depois, a conversa (`whatsapp_conversations`) passa a ser vinculada a `contact_id` e `deal_id`, evitando que a UI dependa de cadastros manuais para “nascer” um lead.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)  
**Primary Dependencies**: Next.js 16 (App Router), React 19, Supabase JS v2, Zod (no Next), libphonenumber-js (na Edge Function)  
**Storage**: Postgres (Supabase) com RLS e multi-tenant por `organization_id`  
**Testing**: Vitest (happy-dom) + React Testing Library; testes de regras multi-tenant em `test/`  
**Target Platform**: Web (Next.js) + Supabase Edge Functions (Deno)  
**Project Type**: Web (monorepo-like, mas com app na raiz)  
**Performance Goals**: Webhook rápido e idempotente (best-effort; foco em consistência, não throughput extremo)  
**Constraints**: Sem service role no client; tudo com filtro por `organization_id`; webhook é stateless e tolerante a payload variável  
**Scale/Scope**: Feature incremental; altera apenas ingestão e docs, sem outbound

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] Todas as queries/mutações filtram por `organization_id`.
- [x] Rotas `/api/*` retornam `401/403` (sem redirect) quando não autenticado.
- [x] Boundary do Supabase respeitada (service role apenas na Edge Function; server-only no server).
- [x] Regras de cache respeitadas (sem mudança de cache planejada nesta etapa).
- [x] IA não é impactada.
- [x] Qualidade: mudanças futuras devem manter `npm run lint` e `npm run typecheck` passando; adicionar testes se houver lógica não trivial.

## Project Structure

### Documentation (this feature)

```text
specs/Featwhatsapp-lite-nativo/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
app/
  api/whatsapp/
    account/
    thread/
    takeover/

features/settings/components/WhatsAppSection.tsx

supabase/functions/zapi-in/index.ts
supabase/migrations/*_whatsapp_*.sql
```

**Structure Decision**: Manter ingestão no Supabase Edge Function (`supabase/functions/zapi-in`) e expor apenas APIs autenticadas via Next.js em `app/api/whatsapp/*`.

## Complexity Tracking

N/A (sem violações justificadas)

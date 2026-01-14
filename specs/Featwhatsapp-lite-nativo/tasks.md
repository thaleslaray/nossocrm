---

description: "Tasks: WhatsApp Lite (Nativo)"
---

# Tasks: WhatsApp Lite (Nativo)

**Input**: Design documents from `specs/Featwhatsapp-lite-nativo/`
**Prerequisites**: `specs/Featwhatsapp-lite-nativo/plan.md` (required), `specs/Featwhatsapp-lite-nativo/spec.md` (required), plus `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Não incluir tarefas de testes automaticamente. Adicione testes apenas se explicitamente solicitado na spec.

**Organization**: Tasks agrupadas por user story (P1 primeiro), para permitir implementação e validação independentes.

## Phase 1: Setup (Documentação e alinhamento)

**Purpose**: Garantir que os artefatos de design estão completos e consistentes para guiar implementação/validação.

- [x] T001 [P] Consolidar user stories/FRs/edge cases em specs/Featwhatsapp-lite-nativo/spec.md
- [x] T002 [P] Consolidar arquitetura/decisões e gates em specs/Featwhatsapp-lite-nativo/plan.md
- [x] T003 [P] Validar decisões (auth token, threading, dedupe, phone) em specs/Featwhatsapp-lite-nativo/research.md
- [x] T004 [P] Validar entidades/índices/RLS em specs/Featwhatsapp-lite-nativo/data-model.md
- [x] T005 [P] Validar contrato OpenAPI e schemas em specs/Featwhatsapp-lite-nativo/contracts/openapi.yaml
- [x] T006 [P] Validar quickstart ponta-a-ponta em specs/Featwhatsapp-lite-nativo/quickstart.md

---

## Phase 2: Foundational (Bloqueantes / pré-requisitos)

**Purpose**: Infra e fundações que devem estar corretas antes das user stories.

- [x] T007 Validar schema/índices/RLS das tabelas `whatsapp_*` em supabase/migrations/20260104010000_whatsapp_core.sql
- [x] T008 Validar singleton Z-API (1 conta por organização) em supabase/migrations/20260104020000_whatsapp_zapi_singleton.sql
- [x] T009 [P] Garantir boundary Supabase (service role só no runtime) em supabase/functions/zapi-in/index.ts
- [x] T010 [P] Garantir UI de Settings para gerenciar `whatsapp_accounts` em features/settings/components/WhatsAppSection.tsx
- [x] T011 [P] Garantir mitigação CSRF + `401/403` (sem redirect) em app/api/whatsapp/thread/route.ts
- [x] T012 [P] Garantir mitigação CSRF + `401/403` (sem redirect) em app/api/whatsapp/takeover/route.ts

**Checkpoint**: Base pronta (banco + RLS + função + endpoints) para iniciar as user stories.

---

## Phase 3: User Story 1 — Receber mensagens via webhook (Priority: P1) — MVP

**Goal**: Receber eventos de mensagem via webhook Z-API e persistir conversa/mensagem com idempotência e isolamento multi-tenant.

**Independent Test**: executar o passo “Teste rápido do webhook” em specs/Featwhatsapp-lite-nativo/quickstart.md e validar inserts/updates em `whatsapp_conversations` e `whatsapp_messages`.

### Implementation (US1)

- [x] T013 [US1] Resolver token na URL e buscar `whatsapp_accounts` por `webhook_token` em supabase/functions/zapi-in/index.ts
- [x] T014 [US1] Validar account ativa e retornar `404` quando token inválido/inativa em supabase/functions/zapi-in/index.ts
- [x] T015 [US1] Parsing best-effort de texto (text/message/body/...) em supabase/functions/zapi-in/index.ts
- [x] T016 [US1] Parsing best-effort de remetente (phone/from/sender/...) e normalização E.164 (BR) em supabase/functions/zapi-in/index.ts
- [x] T017 [US1] Parsing best-effort de `provider_message_id` (messageId/id/msgId/...) em supabase/functions/zapi-in/index.ts
- [x] T018 [US1] Definir `provider_conversation_id` estável (chatId/remoteJid/...) com fallback seguro em supabase/functions/zapi-in/index.ts
- [x] T019 [US1] Resolver `contact_id` e `deal_id` best-effort a partir do telefone em supabase/functions/zapi-in/index.ts
- [x] T020 [US1] Upsert de conversa por `(organization_id, account_id, provider_conversation_id)` em supabase/functions/zapi-in/index.ts
- [x] T021 [US1] Upsert de mensagem com dedupe por `(conversation_id, provider_message_id)` quando disponível em supabase/functions/zapi-in/index.ts
- [x] T022 [US1] Atualizar `last_message_at/updated_at` best-effort após inserção em supabase/functions/zapi-in/index.ts
- [x] T023 [P] [US1] Manter quickstart com exemplos de payload/idempotência em specs/Featwhatsapp-lite-nativo/quickstart.md
- [x] T024 [P] [US1] Manter contrato OpenAPI coerente com response do webhook em specs/Featwhatsapp-lite-nativo/contracts/openapi.yaml

**Checkpoint**: ingestão funcionando e idempotente (quando `provider_message_id` existe).

---

## Phase 4: User Story 2 — Visualizar thread no CRM (Priority: P1)

**Goal**: Permitir que um usuário autenticado veja a conversa e mensagens de um contato.

**Independent Test**: com o app rodando e usuário logado, chamar `GET /api/whatsapp/thread?contactId=<uuid>` e validar ordenação por `sent_at`.

### Implementation (US2)

- [x] T025 [US2] Validar query params e retornar vazio quando `contactId` ausente em app/api/whatsapp/thread/route.ts
- [x] T026 [US2] Validar auth por cookie e retornar `401` quando não autenticado em app/api/whatsapp/thread/route.ts
- [x] T027 [US2] Resolver `organization_id` via `profiles` e fallback best-effort via `dealId` em app/api/whatsapp/thread/route.ts
- [x] T028 [US2] Consultar `whatsapp_conversations` por `organization_id` + `contact_id` e retornar a mais recente em app/api/whatsapp/thread/route.ts
- [x] T029 [US2] Consultar `whatsapp_messages` por `organization_id` + `conversation_id` e ordenar por `sent_at asc` em app/api/whatsapp/thread/route.ts
- [x] T030 [P] [US2] Manter contrato OpenAPI coerente com response de thread em specs/Featwhatsapp-lite-nativo/contracts/openapi.yaml

**Checkpoint**: thread retorna conversa+mensagens corretamente e com isolamento por organização.

---

## Phase 5: User Story 3 — Sinalizar takeover humano (Priority: P1)

**Goal**: Permitir que um usuário marque a conversa como em atendimento humano.

**Independent Test**: chamar `POST /api/whatsapp/takeover` com `{ conversationId }` e validar `human_takeover_at/by` na conversa.

### Implementation (US3)

- [x] T031 [US3] Validar auth por cookie e retornar `401` quando não autenticado em app/api/whatsapp/takeover/route.ts
- [x] T032 [US3] Validar payload `{ conversationId }` e retornar `400` quando ausente em app/api/whatsapp/takeover/route.ts
- [x] T033 [US3] Resolver `organization_id` via `profiles` e retornar `409` quando ausente em app/api/whatsapp/takeover/route.ts
- [x] T034 [US3] Atualizar takeover em `whatsapp_conversations` filtrando por `id` + `organization_id` em app/api/whatsapp/takeover/route.ts
- [x] T035 [P] [US3] Manter quickstart com exemplo de takeover em specs/Featwhatsapp-lite-nativo/quickstart.md

**Checkpoint**: takeover preenche campos corretamente e retorna erros esperados.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Consolidação, qualidade e consistência entre docs/contratos/código.

- [x] T036 [P] Revisar consistência docs vs código (schemas/endpoints) em specs/Featwhatsapp-lite-nativo/contracts/openapi.yaml
- [x] T037 [P] Revisar consistência do quickstart vs setup real do repo em specs/Featwhatsapp-lite-nativo/quickstart.md
- [x] T038 [P] Revisar gates de segurança (multi-tenant + `/api/*` sem redirect) em .specify/memory/constitution.md
- [x] T039 Executar `npm run lint` e corrigir issues relevantes em package.json
- [x] T040 Executar `npm run typecheck` e corrigir issues relevantes em package.json
- [x] T041 Executar `npm run test:run` e corrigir issues relevantes em package.json

---

## Dependencies & Execution Order

### User Story Dependencies (ordem recomendada para validação E2E)

`US1 (Webhook) -> US2 (Thread) -> US3 (Takeover)`

### Parallel Opportunities

- Setup: T001–T006 são paralelizáveis.
- Foundational: T009–T012 são paralelizáveis.
- US1: T023/T024 podem rodar em paralelo enquanto T013–T022 evoluem.
- US2: T030 pode rodar em paralelo enquanto T025–T029 evoluem.
- US3: T035 pode rodar em paralelo enquanto T031–T034 evoluem.

---

## Parallel Execution Examples (por história)

### US1

- T013–T022 em supabase/functions/zapi-in/index.ts (sequencial dentro do arquivo)
- T023 em specs/Featwhatsapp-lite-nativo/quickstart.md em paralelo
- T024 em specs/Featwhatsapp-lite-nativo/contracts/openapi.yaml em paralelo

### US2

- T025–T029 em app/api/whatsapp/thread/route.ts
- T030 em specs/Featwhatsapp-lite-nativo/contracts/openapi.yaml em paralelo

### US3

- T031–T034 em app/api/whatsapp/takeover/route.ts
- T035 em specs/Featwhatsapp-lite-nativo/quickstart.md em paralelo

---

## Implementation Strategy

### MVP (US1)

1. Concluir Phase 1 + Phase 2
2. Implementar US1 (Phase 3)
3. Validar US1 via specs/Featwhatsapp-lite-nativo/quickstart.md

### Incremental

- Adicionar US2 e validar com dados ingeridos.
- Adicionar US3 e validar takeover com uma conversa existente.
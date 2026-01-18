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

---

## Phase 7: User Story 4 — Onboarding simples via UI (Priority: P1)

**Goal**: Como admin, quero conectar a Z-API de forma guiada no CRM (sem SQL), para copiar a URL do webhook e configurar na Z-API.

**Independent Test**: (1) abrir Settings → WhatsApp (Z-API), (2) criar/carregar conexão, (3) copiar URL do webhook, (4) colar na Z-API (Ao receber), (5) enviar mensagem real e ver a conversa no Lead.

### Implementation (US4)
- [x] T042 [US4] Mapear e documentar `whatsapp_accounts.config` (jsonb) para Z-API em specs/Featwhatsapp-lite-nativo/data-model.md
- [x] T043 [US4] Criar `GET /api/whatsapp/account` (retorna conta Z-API + webhook URL) em app/api/whatsapp/account/route.ts
- [x] T044 [US4] Criar `POST /api/whatsapp/account` (cria conta Z-API se não existir; idempotente) em app/api/whatsapp/account/route.ts
- [x] T045 [US4] Persistir campos de configuração (ex.: `instance_id`, `instance_token`, `instance_api_base`) em `whatsapp_accounts.config` via `PUT /api/whatsapp/account` em app/api/whatsapp/account/route.ts
- [x] T046 [US4] Validar `same-origin` + `401/403` sem redirect em app/api/whatsapp/account/route.ts
- [x] T047 [US4] Garantir filtro por `organization_id` em todas as queries/mutações em app/api/whatsapp/account/route.ts
- [x] T048 [P] [US4] Refatorar Settings para consumir `/api/whatsapp/account` (sem usar Supabase client direto) em features/settings/components/WhatsAppSection.tsx
- [x] T049 [P] [US4] Implementar UX “wizard” mínimo (passos + copiar URL) em features/settings/components/WhatsAppSection.tsx
- [x] T050 [P] [US4] Atualizar quickstart separando: setup do sistema vs onboarding via UI em specs/Featwhatsapp-lite-nativo/quickstart.md

**Checkpoint**: Admin consegue copiar a URL do webhook sem tocar em SQL.

---

## Phase 8: User Story 5 — Rotação de token (Priority: P1)

**Goal**: Como admin, quero rotacionar o `webhook_token` com um clique para revogar webhooks antigos.

**Independent Test**: rotacionar token via UI e confirmar que a URL muda; webhook antigo passa a retornar `404`.

### Implementation (US5)

- [x] T051 [US5] Implementar ação `POST /api/whatsapp/account/rotate-token` (gera novo token e retorna nova URL) em app/api/whatsapp/account/rotate-token/route.ts
- [x] T052 [US5] Garantir idempotência e regras de acesso (admin only) em app/api/whatsapp/account/rotate-token/route.ts
- [x] T053 [P] [US5] Adicionar botão “Rotacionar token” com confirmação e atualização imediata em features/settings/components/WhatsAppSection.tsx
- [x] T054 [P] [US5] Atualizar quickstart com orientação de rotação/segurança em specs/Featwhatsapp-lite-nativo/quickstart.md

**Checkpoint**: Token antigo revogado e URL nova disponível.

---

## Phase 9: User Story 4 (Evolução) — Auto-criação de contato+deal no inbound (Priority: P1)

**Goal**: Quando chegar mensagem inbound de um número não cadastrado (telefone novo), criar automaticamente **contato + deal aberto** na organização, para que a conversa já nasça vinculada ao CRM.

**Independent Test**: enviar webhook com telefone novo (não cadastrado) e validar: (1) novo `contacts` criado, (2) novo `deals` aberto no board/stage default, (3) `whatsapp_conversations.contact_id/deal_id` preenchidos.

### Implementation (US4 Evolution)

- [ ] T065 [P] Selecionar board default (is_default=true, ou fallback primeiro por created_at) em supabase/functions/zapi-in/index.ts
- [ ] T066 [P] Selecionar stage default (menor order, ou is_default) do board selecionado em supabase/functions/zapi-in/index.ts
- [ ] T067 [US4] Quando não achar `contacts.phone` (E.164), criar contato com (name, phone, organization_id) em supabase/functions/zapi-in/index.ts
- [ ] T068 [US4] Quando contato foi criado, criar deal com (title, board_id, stage_id, contact_id, organization_id, is_won=false, is_lost=false) em supabase/functions/zapi-in/index.ts
- [ ] T069 [US4] Tratar duplicidade de deals no retry: se trigger retorna erro unique, buscar deal aberto existente do contato em supabase/functions/zapi-in/index.ts
- [ ] T070 [US4] Retornar `contact_id` e `deal_id` no response `200` do webhook em supabase/functions/zapi-in/index.ts
- [ ] T071 [P] Atualizar contrato OpenAPI para incluir `contact_id`, `deal_id` em response de webhook em specs/Featwhatsapp-lite-nativo/contracts/openapi.yaml
- [ ] T072 [P] Atualizar quickstart com exemplo de auto-criação (webhook com telefone novo) em specs/Featwhatsapp-lite-nativo/quickstart.md
- [ ] T073 Executar `npm run lint`, `npm run typecheck` e corrigir issues em package.json

**Checkpoint**: Lead nasce automaticamente (contato+deal) quando mensagem inbound vem de número novo.

---

## Phase 10: Optional — Configurar webhook automaticamente via API (Priority: P2)

**Goal**: Como admin, quero clicar "Configurar webhook automaticamente" e o CRM chamar a API da Z-API para setar a URL.

**Independent Test**: salvar credenciais e executar a ação; status deve indicar sucesso/erro e persistir em `whatsapp_accounts.config`.

- [ ] T074 [P] Investigar endpoint oficial da Z-API para setar webhooks e documentar em specs/Featwhatsapp-lite-nativo/research.md
- [ ] T075 Implementar `POST /api/whatsapp/account/configure-webhook` (server-side fetch com timeout) em app/api/whatsapp/account/configure-webhook/route.ts
- [ ] T076 [P] Persistir `webhook_config_status` em `whatsapp_accounts.config` em app/api/whatsapp/account/configure-webhook/route.ts
- [ ] T077 [P] Adicionar botão "Configurar webhook automaticamente" e exibir status em features/settings/components/WhatsAppSection.tsx

---

## Phase 11: Optional — Endpoint de teste de conexão (Priority: P2)

**Goal**: Como admin, quero testar credenciais (ping/status) para validar que a instância está ativa.

**Independent Test**: clicar “Testar conexão” e ver resultado 200/4xx coerente.

- [ ] T078 Implementar `GET /api/whatsapp/test-connection` (server-side fetch com timeout) em app/api/whatsapp/test-connection/route.ts
- [ ] T079 [P] Adicionar botão "Testar conexão" e exibir resultado em features/settings/components/WhatsAppSection.tsx

---

## Phase 12: Polish & Quality (Final)

**Purpose**: Qualidade, mensagens de erro úteis, docs e (se adotarmos) testes.

- [ ] T080 [P] Padronizar mensagens de erro acessíveis no wizard (aria + estados de loading) em features/settings/components/WhatsAppSection.tsx
- [ ] T081 [P] (Opcional) Adicionar testes Vitest dos route handlers (401/403, admin-only, org filter) em app/api/whatsapp/account/route.test.ts
- [ ] T082 [P] (Opcional) Adicionar testes RTL do wizard (fluxo básico) em features/settings/components/WhatsAppSection.test.tsx
- [ ] T083 Executar `npm run lint && npm run typecheck && npm run test:run` e corrigir issues relacionadas
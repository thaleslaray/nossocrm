# Feature Specification: WhatsApp Lite (Nativo)

**Feature Branch**: `Featwhatsapp-lite-nativo`  
**Created**: 2026-01-07  
**Status**: Draft  
**Input**: Integração WhatsApp Lite (nativo) via Z-API: receber mensagens por webhook (Supabase Edge Function), persistir em tabelas `whatsapp_*` e permitir visualizar a thread e sinalizar takeover humano no CRM.

## Scope & Boundaries

### In scope
- Ingestão inbound via webhook Z-API (Supabase Edge Function) e persistência em `whatsapp_accounts`, `whatsapp_conversations`, `whatsapp_messages`.
- Leitura da thread por contato via API autenticada no Next.js.
- Takeover humano (marcação de atendimento humano) via API autenticada no Next.js.

### Out of scope (explicitamente)
- Envio outbound de mensagens.
- Download/armazenamento de mídia (além de metadados; `media` permanece vazio nesta iteração).
- Criação automática de contato/deal (o vínculo é best-effort quando já existir).
- Integrações com Inbox/Atividades/IA além do que já existe no repo.

## External Actors & Systems

- **Usuário do CRM**: membro autenticado (cookies) que lê a thread e executa takeover.
- **Admin do CRM**: gerencia a conexão/conta Z-API (`whatsapp_accounts`).
- **Z-API / WhatsApp Lite (provider)**: sistema externo que envia webhooks.
- **Supabase Edge Functions**: runtime (Deno) que recebe o webhook e usa service role.
- **Supabase Postgres + RLS**: persistência com isolamento multi-tenant.
- **Next.js App Router**: APIs autenticadas por cookie em `/api/*`.

## Glossário

- **Webhook**: chamada HTTP `POST` do provider para o NossoCRM.
- **Token do webhook**: segredo na URL (`/functions/v1/zapi-in/<token>`) que identifica a conta (`whatsapp_accounts.webhook_token`).
- **Conversa**: thread em `whatsapp_conversations` agrupando mensagens por `(organization_id, account_id, provider_conversation_id)`.
- **Mensagem**: item em `whatsapp_messages` (in/out) com `sent_at`.
- **provider_message_id**: ID estável do provider para dedupe (quando disponível).
- **provider_conversation_id**: chave estável do provider para threading (ex.: `chatId`, `remoteJid`).
- **context_id (API)**: campo retornado no `GET /api/whatsapp/thread` que representa o identificador de contexto da conversa. Para WhatsApp nativo, mapeia para `provider_conversation_id`.
- **Takeover humano**: preenchimento de `human_takeover_at` e `human_takeover_by` na conversa.
- **Tenant**: organização (`organization_id`).

## Observabilidade, Segurança e Compliance

### Observabilidade
- Webhook retorna JSON com `conversation_id` e `message_id` (quando disponível) para troubleshooting.
- `raw_payload` é persistido na mensagem para inspeção posterior.
- Logs de execução devem ser consultados no painel/CLI do Supabase (Edge Function logs).

### Segurança
- O webhook é **service-to-service**: não depende de usuário logado e usa **service role apenas no runtime** da Edge Function.
- Rotas `/api/*` (Next.js) são autenticadas por cookie e devem retornar `401/403` (sem redirect) e bloquear CSRF por origem.
- Token do webhook deve ser tratado como segredo: deve ser aleatório e pode ser rotacionado alterando `whatsapp_accounts.webhook_token`.

### Replay / Duplicidade
- O provider pode reenviar eventos (retry). O sistema deve ser idempotente quando `provider_message_id` existir.
- Não há TTL/assinatura nesta iteração; a mitigação primária é segredo na URL + dedupe no banco.

### Rate limiting
- Não há rate limiting app-level nesta iteração; depender do provider/infra. Se houver abuso, mitigar via rotação do token e desativação de `whatsapp_accounts.active`.

### Retenção / LGPD
- Nesta iteração não há job automático de expurgo. Os dados permanecem no banco conforme necessidade operacional.
- Acesso é restrito por RLS (tenant) e pela autenticação do app.

## User Scenarios & Testing *(mandatory)*

### User Story 1  Receber mensagens via webhook (Priority: P1)
Como sistema, quero receber eventos de mensagens vindas do WhatsApp (Z-API) para persistir a conversa e permitir acompanhamento dentro do CRM.

**Why this priority**: sem ingestão confiável a thread não existe.

**Independent Test**: enviar payload de teste para `POST /functions/v1/zapi-in/<token>` e validar criação/atualização de `whatsapp_conversations` e `whatsapp_messages`.

**Acceptance Scenarios**:
1. **Given** um `whatsapp_accounts` ativo com `webhook_token` válido, **When** chega um webhook com `messageId` e `chatId`, **Then** a conversa é upsertada e a mensagem é deduplicada por `provider_message_id`.
2. **Given** um webhook duplicado (mesmo `messageId`), **When** reenviado, **Then** não cria mensagem duplicada.
3. **Given** um webhook sem `messageId`, **When** recebido, **Then** a mensagem é gravada (sem dedupe) e a conversa é atualizada best-effort.

### User Story 2  Visualizar thread no CRM (Priority: P1)
Como usuário autenticado, quero ver a conversa do WhatsApp de um contato dentro do CRM.

**Why this priority**: dá visibilidade operacional para suporte/vendas.

**Independent Test**: autenticar no app e chamar `GET /api/whatsapp/thread?contactId=<id>`; validar retorno ordenado por `sent_at`.

**Acceptance Scenarios**:
1. **Given** um contato com conversa registrada, **When** consulto a thread, **Then** recebo `conversation` + `messages` em ordem cronológica.
2. **Given** um contato sem conversa, **When** consulto a thread, **Then** recebo `conversation=null` e `messages=[]`.

### User Story 3  Sinalizar takeover humano (Priority: P1)
Como usuário autenticado, quero marcar que a conversa está sob atendimento humano (takeover) para que a operação saiba que não é para automatizar/responder via bot.

**Independent Test**: autenticar no app e chamar `POST /api/whatsapp/takeover` com `conversationId`; validar atualização de `human_takeover_at/by`.

**Acceptance Scenarios**:
1. **Given** uma conversa existente, **When** faço takeover, **Then** `human_takeover_at/by` são preenchidos.
2. **Given** uma conversa inexistente, **When** faço takeover, **Then** recebo `404`.

### Edge Cases
- Webhook com telefone inválido (não normaliza para E.164)  salvar conversa/mensagem mesmo assim, com `contact_phone=null`.
- Contact matching best-effort: se não achar contato por `contacts.phone`, `contact_id/deal_id` ficam `null`.
- Múltiplos deals do mesmo contato: associar o deal mais recente (best-effort).
- Account inativa ou token inválido  `404` (não revelar detalhes).
- Payload com campos diferentes (Z-API varia)  parser best-effort (texto, ids, timestamp).
- Mensagens fora de ordem: persistir `sent_at` best-effort e ordenar por `sent_at` na leitura; não reordenar no webhook.
- Payload parcialmente válido: persistir o que for possível (ex.: `text=null`) e sempre registrar `raw_payload`.
- Tipos de evento desconhecidos: tratar como payload genérico (best-effort), sem quebrar o endpoint.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: Expor endpoint de webhook via Supabase Edge Function `POST /functions/v1/zapi-in/<token>`.
- **FR-002**: Autenticar webhook por token na URL e resolver `whatsapp_accounts` por `webhook_token`.
- **FR-003**: Persistir/atualizar conversa em `whatsapp_conversations` por `(organization_id, account_id, provider_conversation_id)`.
- **FR-004**: Persistir mensagem em `whatsapp_messages` e deduplicar por `(conversation_id, provider_message_id)` quando disponível.
- **FR-005**: Normalizar telefone para E.164 (BR) quando possível.
- **FR-006**: Resolver `contact_id` e `deal_id` best-effort a partir do telefone.
- **FR-007**: Disponibilizar leitura da thread via `GET /api/whatsapp/thread?contactId=<uuid>&dealId=<uuid?>`.
- **FR-008**: Disponibilizar takeover via `POST /api/whatsapp/takeover` com `{ conversationId }`.
- **FR-009**: APIs autenticadas por cookie MUST retornar `401/403` (sem redirect) quando não autenticado/origem inválida.
- **FR-010**: Todas as leituras/escritas MUST respeitar `organization_id`.

### Non-Functional Requirements
- **NFR-001 (Idempotência)**: mensagens com `provider_message_id` não podem duplicar.
- **NFR-002 (Observabilidade)**: respostas do webhook devem indicar `conversation_id` e `message_id` quando disponível.
- **NFR-003 (Segurança)**: service role apenas no runtime da Edge Function; não expor no client.
- **NFR-004 (Ordem)**: a API de thread deve retornar mensagens ordenadas por `sent_at` asc.
- **NFR-005 (Erros HTTP)**: webhook e APIs devem retornar códigos 4xx/5xx consistentes com o contrato (sem redirects em `/api/*`).

## Success Criteria *(mandatory)*
- Webhook duplicado com mesmo `messageId` não cria segunda linha em `whatsapp_messages`.
- `GET /api/whatsapp/thread` retorna mensagens ordenadas por `sent_at`.
- `POST /api/whatsapp/takeover` preenche `human_takeover_at/by` na conversa.
- Não há query sem filtro por `organization_id` nas rotas/edge function relacionadas.

## Error Handling (contrato resumido)

### Webhook (Supabase Edge Function)
- `200`: processado com sucesso (persistência ok) e retorna IDs.
- `400`: JSON inválido.
- `404`: token ausente, account não encontrada ou inativa.
- `405`: método não permitido.
- `500`: erro interno (runtime/config/DB).

### APIs Next.js (`/api/*`)
- `401`: não autenticado.
- `403`: origem não permitida (mitigação CSRF).
- `409`: usuário sem `organization_id` resolvida.
- `500`: erro interno.

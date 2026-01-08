# Data Model — WhatsApp Lite (Nativo)

Baseado nas migrations:
- `supabase/migrations/20260104010000_whatsapp_core.sql`
- `supabase/migrations/20260104020000_whatsapp_zapi_singleton.sql`

## Entidades

### `whatsapp_accounts`
Conexão por provider (nesta feature: `provider='zapi'`).

**Campos principais**
- `id` (uuid, PK)
- `organization_id` (uuid, FK organizations)
- `provider` (text)
- `name` (text)
- `webhook_token` (text, unique)
- `active` (boolean)
- `config` (jsonb)
- `created_at`, `updated_at` (timestamptz)

**Regras/validações**
- `webhook_token` MUST ser único.
- Para Z-API: singleton por organização via índice parcial em `organization_id` (onde `provider='zapi'`).

**RLS**
- Admins da organização podem gerenciar (FOR ALL) quando `profiles.role='admin'`.

### `whatsapp_conversations`
Thread de conversa por contato/chave do provider.

**Campos principais**
- `id` (uuid, PK)
- `organization_id` (uuid)
- `account_id` (uuid, FK whatsapp_accounts)
- `provider_conversation_id` (text)
- `channel` (text, default 'WHATSAPP')
- `contact_phone` (text, E.164 quando possível)
- `contact_id` (uuid, FK contacts, nullable)
- `deal_id` (uuid, FK deals, nullable)
- `human_takeover_at` (timestamptz, nullable)
- `human_takeover_by` (uuid, FK profiles, nullable)
- `last_message_at` (timestamptz, nullable)
- `created_at`, `updated_at` (timestamptz)

**Relacionamentos**
- N conversas por account.
- 0..1 contato e 0..1 deal associados (best-effort).

**Índices**
- Unique: `(organization_id, account_id, provider_conversation_id)`.
- Listagem: `(organization_id, contact_id, last_message_at desc)` e `(organization_id, deal_id, last_message_at desc)`.

**RLS**
- Membros da organização podem SELECT.
- Membros podem UPDATE (inclui takeover) — filtrado por organização.

### `whatsapp_messages`
Mensagens inbound/outbound.

**Campos principais**
- `id` (uuid, PK)
- `organization_id` (uuid)
- `conversation_id` (uuid, FK whatsapp_conversations)
- `provider_message_id` (text, nullable)
- `direction` (text, ex.: 'in' | 'out')
- `role` (text, ex.: 'user' | 'assistant')
- `text` (text, nullable)
- `media` (jsonb)
- `raw_payload` (jsonb)
- `sent_at` (timestamptz)
- `created_at` (timestamptz)

**Regras/validações**
- Quando `provider_message_id` existe: dedupe por `(conversation_id, provider_message_id)`.

**Índices**
- Unique parcial: `(conversation_id, provider_message_id)` WHERE `provider_message_id IS NOT NULL`.
- Leitura por thread: `(conversation_id, sent_at asc)`.

**RLS**
- Membros da organização podem SELECT.

## Transições de estado (takeover)

- `human_takeover_at/by` em `whatsapp_conversations` muda de `NULL` -> preenchido quando o usuário executa takeover.
- Não há “undo” definido nesta feature (pode ser adicionado futuramente).

# Quickstart — WhatsApp Lite (Nativo)

## Pré-requisitos

- Variáveis client (dev): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Para Edge Function: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (ou `CRM_SUPABASE_URL` / `CRM_SUPABASE_SERVICE_ROLE_KEY`)
- Migrations aplicadas no seu projeto Supabase

## 1) Aplicar migrations

As tabelas/RLS/índices estão em:
- `supabase/migrations/20260104010000_whatsapp_core.sql`
- `supabase/migrations/20260104020000_whatsapp_zapi_singleton.sql`

Aplique via fluxo padrão do seu setup (CLI Supabase ou SQL editor do Supabase).

## 2) Deploy da Edge Function

Deploy da function `zapi-in` (via Supabase CLI):
- `supabase functions deploy zapi-in`

Garanta que as env vars de runtime estejam configuradas no projeto.

## 3) Criar um `whatsapp_accounts` (provider zapi)

No banco (mesma `organization_id` do seu usuário), crie a conta:

- `provider`: `zapi`
- `webhook_token`: gere um token aleatório (ex.: UUID)
- `active`: `true`

Exemplo (SQL):

```sql
insert into public.whatsapp_accounts (organization_id, provider, name, webhook_token, active)
values ('<ORG_UUID>', 'zapi', 'WhatsApp', '<TOKEN>', true);
```

## 4) Configurar o webhook no provider (Z-API)

Aponte o webhook para:

- `https://<SUPABASE_PROJECT>.supabase.co/functions/v1/zapi-in/<TOKEN>`

## 5) Teste rápido do webhook

Exemplo de payload mínimo (ajuste aos campos que sua Z-API envia):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"text":"oi","phone":"+55 11 99999-0000","messageId":"m-123","chatId":"c-456","timestamp":1735948800000}' \
  "https://<SUPABASE_PROJECT>.supabase.co/functions/v1/zapi-in/<TOKEN>"
```

Valide no banco:
- existe uma linha em `whatsapp_conversations`
- existe uma linha em `whatsapp_messages` (e não duplica ao reenviar o mesmo payload)

### Teste de idempotência (evento duplicado)

- Reenvie o mesmo `curl` com o mesmo `messageId`.
- Valide que **não** foi criada uma segunda linha para o mesmo `(conversation_id, provider_message_id)`.

### Teste de payload parcial (sem messageId)

- Envie um payload sem `messageId`.
- Valide que a mensagem pode ser persistida (sem dedupe) e que `raw_payload` fica registrado.

### Teste de erros

- Token inválido/inativo: esperado `404`.
- JSON inválido: esperado `400`.

## 6) Ler thread pelo Next.js

Com o app rodando (`npm run dev`) e logado:

- `GET /api/whatsapp/thread?contactId=<CONTACT_UUID>`

## 7) Takeover humano

- `POST /api/whatsapp/takeover` com body:

```json
{ "conversationId": "<CONVERSATION_UUID>" }
```

Deve preencher `human_takeover_at` e `human_takeover_by`.

## Notas de segurança

- Nunca use `SUPABASE_SERVICE_ROLE_KEY` no client.
- Rotas `/api/*` devem retornar `401/403` (sem redirects).
- Todas as queries devem filtrar por `organization_id`.

## Observabilidade (dicas)

- Para investigar erros no webhook, consulte os logs da Edge Function no Supabase.
- O webhook retorna `conversation_id` e `message_id` (quando disponível) para correlação.

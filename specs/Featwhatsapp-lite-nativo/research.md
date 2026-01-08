# Research — WhatsApp Lite (Nativo)

## Decisões

### 1) Endpoint de ingestão: Supabase Edge Function
- **Decision**: manter ingestão do webhook Z-API em `supabase/functions/zapi-in/index.ts` com rota `POST /functions/v1/zapi-in/{token}`.
- **Rationale**: precisa de service role para gravar em `whatsapp_*` sem depender de cookies; ambiente Deno é adequado para webhook stateless e payloads variáveis.
- **Alternatives considered**:
  - Next.js Route Handler (`/api/...`) com service role: rejeitado por aumentar acoplamento e risco de vazamento de chave; além de lidar com cookies/CSRF sem necessidade.

### 2) Autenticação do webhook
- **Decision**: autenticar por token na URL e resolver `whatsapp_accounts` por `webhook_token`.
- **Rationale**: simples, compatível com providers que não assinam payload; permite rotacionar token sem alterar schema.
- **Alternatives considered**:
  - Assinatura HMAC no header: depende de suporte do provider.
  - IP allowlist: frágil, costuma mudar.

### 3) Idempotência / dedupe
- **Decision**: deduplicar por `(conversation_id, provider_message_id)` quando `provider_message_id` existir (unique index + upsert com `onConflict`).
- **Rationale**: webhooks são frequentemente reenviados; dedupe no banco é a proteção mais confiável.
- **Alternatives considered**:
  - Dedupe em memória/cache: não garante em múltiplas instâncias.

### 4) Threading (provider_conversation_id)
- **Decision**: usar `chatId/remoteJid/conversationId/from` quando presente; fallback best-effort por telefone ou `messageId`.
- **Rationale**: precisa ser estável para agrupar mensagens; fallback evita perda de dados quando o payload vem incompleto.
- **Alternatives considered**:
  - Gerar UUID sempre: quebra threading.

### 5) Normalização de telefone
- **Decision**: normalizar telefone para E.164 assumindo BR (via `libphonenumber-js`), com fallback seguro.
- **Rationale**: melhora match com `contacts.phone` e reduz duplicidade de formatos.
- **Alternatives considered**:
  - Armazenar somente dígitos: perde informação de país; pior para integrações.

### 6) Vincular contato/deal (best-effort)
- **Decision**: buscar `contacts` por match exato em E.164 e vincular o deal mais recente do contato.
- **Rationale**: melhora UX sem exigir mudanças no fluxo de cadastro.
- **Alternatives considered**:
  - Criar contato automaticamente: arriscado (dados incompletos/duplicados) e pode violar regras de negócio.

## Padrões de segurança do repo (relevantes)

- Rotas Next autenticadas por cookie devem mitigar CSRF via `isAllowedOrigin(req)` e retornar `401/403` (sem redirect).
- Service role apenas no server/edge runtime; nunca no client.
- Multi-tenant: todas as queries e mutações devem filtrar por `organization_id`.

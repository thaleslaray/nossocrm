# Plano: Evolution API Provider

**Branch:** `feature/003-evolution-api-provider`  
**Data:** 2026-04-07  
**Status:** Planejado

---

## Objetivo

Adicionar Evolution API como terceiro provider de WhatsApp no NossoCRM, seguindo exatamente o padrão já estabelecido por Z-API e Meta Cloud API. O AI agent, HITL, pipeline e todas as demais features funcionam automaticamente — apenas os adaptadores de entrada/saída mudam.

## Por que Evolution API

- **Gratuito e self-hosted** — sem custo por instância (vs Z-API ~R$50-500/mês)
- **Dados em infra própria** — sem dependência de terceiro
- **Suporte a grupos** — criar e gerenciar grupos WhatsApp (Z-API é limitado)
- **19+ eventos de webhook** — mais granular que Z-API
- **Multi-instâncias nativas** — ideal para clientes multi-tenant

## Arquitetura (inalterada)

```
Qualquer plataforma → webhook normalizado → BaseChannelProvider.handleWebhook()
                                         → MessageReceivedEvent (interno)
                                         → processIncomingMessage()
                                         → AI agent decision
                                         → BaseChannelProvider.sendMessage()
                                         → API da plataforma
```

Evolution API é apenas mais um adaptador nas pontas. Nada muda no core.

---

## Referência Técnica: Evolution API

### Autenticação

```
Header: apikey: {AUTHENTICATION_API_KEY}
URL base: https://{server-url}
```

### Formato remoteJid

| Tipo | Formato | Exemplo |
|------|---------|---------|
| Individual | `{phone}@s.whatsapp.net` | `5511999999999@s.whatsapp.net` |
| Grupo | `{id}@g.us` | `120363456789@g.us` |
| Status | `status@broadcast` | — |
| LID (bug) | `{lid}@lid` | usar `senderPn` como fallback |

### Payload Webhook — MESSAGES_UPSERT

```json
{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "id": "3EB0ABC123",
      "fromMe": false
    },
    "pushName": "João Silva",
    "message": {
      "conversation": "Olá!"
    },
    "messageType": "conversation",
    "messageTimestamp": 1712519880,
    "instanceId": "uuid",
    "source": "android"
  }
}
```

### Tipos de messageType e campos

| messageType | Campo em `message` | Campo de texto/URL |
|-------------|-------------------|-------------------|
| `conversation` | `message.conversation` | texto direto |
| `extendedTextMessage` | `message.extendedTextMessage.text` | texto com link preview |
| `imageMessage` | `message.imageMessage.url` | `caption` opcional |
| `audioMessage` | `message.audioMessage.url` | — |
| `videoMessage` | `message.videoMessage.url` | `caption` opcional |
| `documentMessage` | `message.documentMessage.url` | `fileName`, `caption` |
| `stickerMessage` | `message.stickerMessage.url` | — |
| `locationMessage` | `message.locationMessage` | `degreesLatitude`, `degreesLongitude`, `name` |
| `reactionMessage` | `message.reactionMessage.text` | emoji |

### Payload Webhook — MESSAGES_UPDATE (status)

```json
{
  "event": "messages.update",
  "instance": "minha-instancia",
  "data": [
    {
      "key": { "remoteJid": "...", "id": "...", "fromMe": true },
      "update": { "status": 4 }
    }
  ]
}
```

Status codes: `1=ERROR, 2=PENDING, 3=SERVER_ACK, 4=DELIVERY_ACK, 5=READ, 6=DELETED, 7=PLAYED`

Mapeamento para tipos internos: `3→sent, 4→delivered, 5→read`

### REST API — Enviar Mensagens

#### Texto
```
POST /message/sendText/{instanceName}
{ "number": "5511999999999", "text": "...", "delay": 1000 }
```

#### Mídia (imagem/vídeo/documento)
```
POST /message/sendMedia/{instanceName}
{ "number": "...", "mediatype": "image", "media": "https://...", "caption": "..." }
```

#### Áudio (PTT — Push to Talk)
```
POST /message/sendWhatsAppAudio/{instanceName}
{ "number": "...", "audio": "https://..." }
```

#### Localização
```
POST /message/sendLocation/{instanceName}
{ "number": "...", "latitude": -23.5, "longitude": -46.6, "name": "...", "address": "..." }
```

#### Reação
```
POST /message/sendReaction/{instanceName}
{ "key": { "id": "...", "remoteJid": "...", "fromMe": false }, "reaction": "😂" }
```

### Response de envio (todos os tipos)
```json
{
  "key": { "id": "3EB0ABC123", "remoteJid": "...", "fromMe": true },
  "messageType": "conversation",
  "messageTimestamp": 1712519880,
  "status": "PENDING"
}
```
→ `key.id` é o `externalMessageId`

### Status da Conexão
```
GET /instance/connectionState/{instanceName}
Response: { "instance": { "instanceName": "...", "state": "open" } }
States: "open" | "close" | "connecting" | "refused"
```

### QR Code
```
GET /instance/connect?instanceName={instanceName}
Response: { "qrcode": { "base64": "data:image/png;base64,...", "code": "..." } }
```

### Configurar Webhook
```
POST /webhook/set/{instanceName}
{
  "enabled": true,
  "url": "https://...",
  "byEvents": true,
  "events": ["messages.upsert", "messages.update", "connection.update"]
}
```

### Diferenças críticas vs Z-API

| Campo | Z-API | Evolution API |
|-------|-------|--------------|
| Telefone | `data.phone` | `data.key.remoteJid.split('@')[0]` |
| Texto simples | `data.text.message` | `data.message.conversation` |
| Nome remetente | `data.senderName` | `data.pushName` |
| ID mensagem | `data.messageId` | `data.key.id` |
| Minha mensagem | `data.fromMe` | `data.key.fromMe` |
| Status update | evento separado com `data.ids` + `data.status` | `messages.update` com `data[].update.status` |
| Autenticação envio | header `Client-Token` | header `apikey` |

### Credenciais (campos no banco)

```typescript
interface EvolutionCredentials {
  serverUrl: string;    // http://localhost:8080
  instanceName: string; // nome da instância
  apiKey: string;       // AUTHENTICATION_API_KEY do servidor Evolution
}
```

---

## Plano de Implementação

### Tarefa 1 — `evolution.provider.ts`
**Arquivo:** `lib/messaging/providers/whatsapp/evolution.provider.ts`

Implementar `EvolutionWhatsAppProvider extends BaseChannelProvider` com:

- `initialize()` — extrair `serverUrl`, `instanceName`, `apiKey` das credentials
- `getStatus()` — GET `/instance/connectionState/{instance}` → mapear states
- `getQrCode()` — GET `/instance/connect?instanceName={instance}` → extrair `qrcode.base64`
- `sendMessage()` — switch por `content.type`:
  - `text` → POST `/message/sendText/{instance}` 
  - `image/video` → POST `/message/sendMedia/{instance}` com `mediatype`
  - `audio` → POST `/message/sendWhatsAppAudio/{instance}`
  - `document` → POST `/message/sendMedia/{instance}` com `mediatype: "document"` + `fileName`
  - `location` → POST `/message/sendLocation/{instance}`
  - `reaction` → POST `/message/sendReaction/{instance}`
  - `sticker` → POST `/message/sendMedia/{instance}` com `mediatype: "image"` (webp)
- `handleWebhook()` — switch por `payload.event`:
  - `messages.upsert` + `!fromMe` → `MessageReceivedEvent`
  - `messages.update` → `StatusUpdateEvent`
  - outros → `error` (ignorado)
- `configureWebhook()` — POST `/webhook/set/{instance}`
- `validateConfig()` — verificar `serverUrl`, `instanceName`, `apiKey`

**Helper crítico:** `normalizePhone(remoteJid: string): string`
```typescript
// Lidar com @lid bug
function normalizePhone(remoteJid: string, senderPn?: string): string {
  if (remoteJid.includes('@lid') && senderPn) return senderPn;
  return remoteJid.split('@')[0];
}
```

### Tarefa 2 — Registrar no factory
**Arquivo:** `lib/messaging/providers/index.ts`

Adicionar:
```typescript
import { EvolutionWhatsAppProvider } from './whatsapp';

registerProvider({
  channelType: 'whatsapp',
  providerName: 'evolution',
  constructor: EvolutionWhatsAppProvider,
  displayName: 'Evolution API',
  description: 'WhatsApp via Evolution API (self-hosted, gratuito)',
  configFields: [
    { key: 'serverUrl', label: 'URL do servidor', type: 'text', required: true },
    { key: 'instanceName', label: 'Nome da instância', type: 'text', required: true },
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
  ],
  features: ['media', 'read_receipts', 'qr_code', 'groups'],
});
```

### Tarefa 3 — Edge Function de Webhook
**Arquivo:** `supabase/functions/messaging-webhook-evolution/index.ts`

Seguir o mesmo padrão de `messaging-webhook-zapi`. A Edge Function:
1. Recebe POST da Evolution API
2. Extrai `instanceName` do payload (`payload.instance`)
3. Busca channel pelo `external_identifier = instanceName` + `provider = 'evolution'`
4. Instancia `EvolutionWhatsAppProvider` e chama `handleWebhook(payload)`
5. Se `MessageReceivedEvent` → upsert contact/conversation → insert message → dispara AI process
6. Se `StatusUpdateEvent` → update status da mensagem
7. Retorna 200 (sempre, mesmo com erro interno — evita retry storm)

### Tarefa 4 — Exportar tipos
**Arquivo:** `lib/messaging/providers/whatsapp/index.ts`

Adicionar export de `EvolutionWhatsAppProvider` e `EvolutionCredentials`.

### Tarefa 5 — Testes
- Subir Evolution API local via Docker
- Configurar instância e apontar webhook para `ngrok` ou tunnel local
- Testar `sendMessage` para número real
- Testar recebimento via webhook
- Testar `getStatus` e `getQrCode`
- Testar tipos: texto, imagem, áudio, documento, localização

---

## Ordem de execução

1. `evolution.provider.ts` (maior parte do trabalho)
2. `whatsapp/index.ts` (exports)
3. `providers/index.ts` (registration)
4. Edge Function (webhook handler)
5. Testes

---

## Docker para desenvolvimento

```yaml
# docker-compose.evolution.yml
services:
  evolution:
    image: atendai/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      SERVER_PORT: 8080
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://...
      AUTHENTICATION_API_KEY: ncrm_evolution_dev_key
      WEBHOOK_GLOBAL_URL: https://{ngrok-url}/functions/v1/messaging-webhook-evolution
      WEBHOOK_GLOBAL_ENABLED: true
      WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS: true
```

---

## Notas de risco

1. **@lid bug** — Evolution às vezes retorna `{lid}@lid` em vez do número. O helper `normalizePhone()` já trata isso com o fallback `senderPn`.
2. **`extendedTextMessage`** — Mensagens com link preview chegam como `extendedTextMessage`, não `conversation`. O provider deve checar ambos para extrair o texto.
3. **Grupos** — `remoteJid` termina em `@g.us`. O provider deve ignorar ou tratar diferente de mensagens 1:1 (dependendo de requisito futuro).
4. **Status codes numéricos** — Evolution usa `1-7` numericamente. Z-API usa strings `SENT/DELIVERED/READ`. Mapear corretamente.

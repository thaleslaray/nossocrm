## Webhooks (Integrações) — Guia (leigo-friendly)

Este documento é para quem quer "ligar" automações sem precisar ser técnico.

- **Entrada de Leads**: você cola uma URL/"senha" no Hotmart/n8n/Make e os leads entram no seu funil automaticamente.
- **Follow-up**: quando o lead muda de etapa, o CRM avisa seu sistema (n8n/Make/WhatsApp).

> **Acesso**: configurações de Webhooks são **admin-only**.

---

## Onde configurar (na UI)

- Vá em `Configurações → Integrações → Webhooks`.
- Você verá dois cards:
  - **Entrada de Leads (Webhook)** (inbound)
  - **Follow-up (Webhook de saída)** (outbound)

Na UI você consegue:

- **Editar** (board/etapa do inbound, URL do outbound)
- **Ativar/Desativar**
- **Excluir**
- **Copiar URL** e **Copiar secret**

---

## Guia rápido (sem técnico)

### Entrada de Leads (Entrada automática no funil)

1) Clique em **Ativar entrada de leads** e escolha:
- **qual funil** (Board)
- **qual etapa** (Estágio)

2) Copie:
- **URL do webhook**
- **Secret** (a "senha")

3) No Hotmart/n8n/Make:
- crie um passo "Enviar para URL (HTTP Request)"
- cole a URL
- cole o Secret no header `X-Webhook-Secret` (ou `Authorization: Bearer <secret>`)
- envie o lead com pelo menos **e-mail ou telefone**

### Follow-up (Aviso quando muda de etapa)

1) Clique em **Conectar follow-up** e cole a URL do seu destino (n8n/Make/etc).

2) Pronto: o CRM vai avisar sua URL quando o lead mudar de etapa.

3) No seu destino, valide o header `X-Webhook-Secret` (ou `Authorization: Bearer ...`) — é a "senha" do aviso.

### Se não funcionar (checklist)

- URL correta?
- Secret correto?
- Você testou com um lead real?
- No Follow-up: você **moveu o lead de etapa**? (só dispara quando muda)

---

## Detalhes técnicos (avançado)

## 1) Entrada de Leads (Webhook) — Inbound

### URL do endpoint

Quando você cria a "Entrada de Leads", o CRM gera um `source_id` e a URL fica no formato:

- `POST https://drgsnhbtucwocpeiwdth.supabase.co/functions/v1/webhook-in/<source_id>`

> A UI monta essa URL a partir do `NEXT_PUBLIC_SUPABASE_URL`.

### Autenticação (obrigatória)

Você **precisa** enviar o header:

- `X-Webhook-Secret: <secret>`
  - (alternativa) `Authorization: Bearer <secret>`

Esse secret é o "token" do webhook. Trate como senha.

### Headers recomendados

- `Content-Type: application/json`
- `X-Webhook-Secret: ...` (ou `Authorization: Bearer ...`)

### Payload (JSON)

Todos os campos são opcionais, mas recomenda-se enviar pelo menos `email` ou `phone`.

#### Campos de identificação do lead

| Campo             | Tipo   | Descrição                                          |
| ----------------- | ------ | -------------------------------------------------- |
| `name`            | string | Nome completo do contato                           |
| `nome`            | string | Alias PT-BR de `name`                              |
| `email`           | string | E-mail (também aceita campo `contato`)             |
| `phone`           | string | Telefone/WhatsApp (E.164 ou formato livre)         |
| `source`          | string | Canal de origem livre (ex.: `"hotmart"`, `"n8n"`)  |
| `notes`           | string | Observações gerais                                 |
| `external_event_id` | string | ID único do evento (para idempotência em retry)  |

#### Campos de viagem (agência de viagens)

| Campo                  | Tipo          | Valores aceitos / observação                                             |
| ---------------------- | ------------- | ------------------------------------------------------------------------ |
| `destino_viagem`       | string        | Destino desejado (ex.: `"Cancún"`, `"Paris"`, `"Fernando de Noronha"`)   |
| `data_viagem`          | string / date | Data prevista — aceita `DD/MM/AAAA`, `AAAA-MM-DD` ou texto livre        |
| `quantidade_adultos`   | number        | Número de adultos (mínimo 1)                                             |
| `quantidade_criancas`  | number        | Número de crianças (mínimo 0, padrão 0)                                  |
| `idade_criancas`       | string        | Idades das crianças (ex.: `"4 e 8 anos"`) — obrigatório se `quantidade_criancas > 0` |
| `categoria_viagem`     | string (enum) | `"economica"` · `"intermediaria"` · `"premium"`                          |
| `urgencia_viagem`      | string (enum) | `"imediato"` · `"curto_prazo"` · `"medio_prazo"` · `"planejando"`        |
| `origem_lead`          | string (enum) | `"instagram"` · `"facebook"` · `"google"` · `"site"` · `"whatsapp"` · `"indicacao"` · `"outro"` |
| `indicado_por`         | string        | Nome de quem indicou — usar quando `origem_lead === "indicacao"`         |
| `observacoes_viagem`   | string        | Observações adicionais (orçamento estimado, preferências de hotel, etc.) |

> **Aliases aceitos pelo webhook**: o handler normaliza variações de nome em português.
> - `destino` → `destino_viagem`
> - `data` → `data_viagem`
> - `urgencia` → `urgencia_viagem`
> - `categoria` → `categoria_viagem`
> - `origem` → `origem_lead`
> - `viajantes` / `numero_viajantes` → `quantidade_adultos` + `quantidade_criancas`
> - `orcamento` / `orcamento_categoria` → armazenado em `observacoes_viagem`

#### Campos do negócio (deal)

| Campo          | Tipo          | Descrição                                    |
| -------------- | ------------- | -------------------------------------------- |
| `deal_title`   | string        | Nome do negócio (padrão: `"Nome | Destino"`) |
| `deal_value`   | number/string | Valor estimado do negócio                    |
| `contact_name` | string        | Alias de `name`                              |

### Comportamento (o que o CRM faz)

Ao receber o `POST`, o handler (`supabase/functions/webhook-in/index.ts`):

- valida `X-Webhook-Secret`
- registra auditoria em `webhook_events_in` quando `external_event_id` existe (idempotência para retry)
- faz **upsert de contato** por `email` e/ou `phone` (na mesma `organization_id`)
- mapeia os campos de viagem para as colunas do schema com normalização de enums
- cria ou **atualiza** um **deal em aberto** no **board** configurado
- grava metadados em `deals.custom_fields`: `inbound_source_id`, `inbound_external_event_id`

### Exemplo (cURL) — Payload mínimo

```bash
curl -X POST 'https://drgsnhbtucwocpeiwdth.supabase.co/functions/v1/webhook-in/<source_id>' \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Secret: <secret>' \
  -d '{
    "nome": "João Silva",
    "email": "joao@email.com",
    "destino_viagem": "Paris"
  }'
```

### Exemplo (cURL) — Payload completo (agência de viagens)

```bash
curl -X POST 'https://drgsnhbtucwocpeiwdth.supabase.co/functions/v1/webhook-in/<source_id>' \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Secret: <secret>' \
  -d '{
    "nome": "Ana Paula Santos",
    "email": "ana@email.com",
    "phone": "+5511999999999",
    "destino_viagem": "Maldivas",
    "data_viagem": "2026-09-15",
    "quantidade_adultos": 2,
    "quantidade_criancas": 1,
    "idade_criancas": "8 anos",
    "categoria_viagem": "premium",
    "urgencia_viagem": "curto_prazo",
    "origem_lead": "instagram",
    "observacoes_viagem": "Prefere resorts all-inclusive. Orçamento ~R$ 25.000."
  }'
```

### Resposta (200)

```json
{
  "ok": true,
  "message": "Recebido! Criamos um novo negócio no funil configurado.",
  "action": { "contact": "created|updated|none", "deal": "created|updated" },
  "organization_id": "...",
  "contact_id": "...",
  "deal_id": "..."
}
```

### Rotação do secret (inbound)

Atualmente, o inbound **não possui "regenerar secret"** na UI. Para trocar o secret:

- **Exclua** a configuração de "Entrada de Leads"
- **Crie novamente** (isso gera um novo `source_id` e um novo `secret`)

---

## 2) Follow-up (Webhook de saída) — Outbound

### Quando dispara

O CRM dispara quando um **deal muda de etapa** (`deals.stage_id` muda).

Implementação: trigger no Postgres (`notify_deal_stage_changed`) via migration  
`supabase/migrations/20251226010000_integrations_webhooks_product.sql`.

### URL de destino

Você informa na UI uma URL (ex.: n8n/Make/WhatsApp provider webhook) e o CRM faz:

- `POST <sua_url>`

### Autenticação (obrigatória)

O CRM envia o header:

- `X-Webhook-Secret: <secret do endpoint>`

> Se você regenerar o secret na UI, precisa atualizar também no seu sistema (n8n/Make/etc).

### Payload enviado (JSON)

```json
{
  "event_type": "deal.stage_changed",
  "occurred_at": "2025-12-26T00:00:00.000Z",
  "deal": {
    "id": "...",
    "title": "...",
    "value": 0,
    "board_id": "...",
    "board_name": "...",
    "from_stage_id": "...",
    "from_stage_label": "...",
    "to_stage_id": "...",
    "to_stage_label": "...",
    "contact_id": "..."
  },
  "contact": {
    "name": "...",
    "phone": "...",
    "email": "...",
    "destino_viagem": "...",
    "categoria_viagem": "...",
    "urgencia_viagem": "..."
  }
}
```

### Entrega (pg_net) e status

O envio é feito via `pg_net` (async):

- a entrega é registrada em `webhook_deliveries`
- `webhook_deliveries.request_id` guarda o id do `net.http_post(...)`
- em caso de exceção no disparo, a delivery é marcada como `failed`

> **MVP**: não existe retry/backoff automático no banco.

---

## 3) Auditoria e troubleshooting

As tabelas principais:

- `integration_inbound_sources`: configurações de inbound (admin-only)
- `integration_outbound_endpoints`: configurações de outbound (admin-only)
- `webhook_events_in`: auditoria de eventos inbound
- `webhook_events_out`: auditoria de eventos outbound
- `webhook_deliveries`: tentativas de entrega outbound

### Queries úteis (Supabase SQL editor)

Últimos inbound recebidos:

```sql
select id, received_at, status, external_event_id, error
from webhook_events_in
order by received_at desc
limit 50;
```

Últimos outbound gerados:

```sql
select id, created_at, event_type, deal_id
from webhook_events_out
order by created_at desc
limit 50;
```

Entregas outbound:

```sql
select d.id, d.attempted_at, d.status, d.request_id, d.response_status, d.error
from webhook_deliveries d
order by d.attempted_at desc
limit 50;
```

---

## 4) Segurança (recomendações)

- **Nunca** exponha o `secret` em client-side público/landing pages.
- No seu endpoint (n8n/Make/servidor), valide o header `X-Webhook-Secret`.
- Gere `external_event_id` no provedor de origem para garantir **idempotência**.
- Se suspeitar de vazamento:
  - inbound: recrie a configuração (gera novo `source_id` e secret)
  - outbound: use **Regenerar secret** e atualize o destino

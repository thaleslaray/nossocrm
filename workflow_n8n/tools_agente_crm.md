# Tools do Agente CRM — Empório Fonseca

## Arquitetura

Sofia (atendimento IA) chama as tools abaixo para movimentar deals, consultar dados e registrar pedidos no CRM.
Endpoint de movimentação: `POST /api/public/v1/deals/move-stage-by-identity`
Auth: `X-Api-Key` header com token do CRM.

---

## Tools de Movimentação CRM

### `crm_triagem`
**Stage**: `Triagem e Dúvidas` (order 0)
**Quando**: No INÍCIO de toda conversa, quando a Sofia está identificando a intenção do cliente.

### `crm_reserva_mesa`
**Stage**: `Reserva de Mesas` (order 1)
**Quando**: Cliente solicita reserva de mesa. Deal PERMANECE neste stage até humano mover.

### `crm_evento`
**Stage**: `Planejamento de Eventos` (order 2)
**Quando**: Cliente solicita evento, aniversário, confraternização. Deal PERMANECE neste stage.

### `crm_pedido_retirada`
**Stage**: `Pedidos Retirada` (order 3)
**Quando**: Pedido para retirada confirmado. Deal PERMANECE neste stage para Débora verificar.

### `crm_transferir_humano`
**Stage**: `Atendimento Humano` (order 4)
**Quando**: Reclamação, cliente pediu humano, restrição alimentar complexa, objetos esquecidos, dúvida fora do escopo.

### `crm_finalizado`
**Stage**: `Confirmação e Fidelização` (order 5)
**Quando**: Atendimento concluído sem pendências (dúvida simples respondida).

**Todos usam o body**:
```json
{
  "board_key_or_id": "gestao-de-atendimento-emporio-forseca",
  "phone": "<contato>",
  "email": "<contato>",
  "to_stage_label": "<nome do stage>",
  "ai_summary": "<resumo da IA>"
}
```

---

## Tools de Consulta

### `treinamento` (Supabase Vector Store)
**Tipo**: retrieve-as-tool
**Tabela**: `documents`
**Metadata filter**: `organization_id = 0ba344eb-8c40-403e-93e0-f6171e1cf06e`
**Quando**: Perguntas factuais (horários, políticas, FAQ). NUNCA para cardápio/pedidos.

### `buscar_cardapio` (Products API)
**Método**: GET
**URL**: `{CRM-Host}/api/public/v1/products?active=true`
**Quando**: Consultar itens e preços para montar pedidos. ÚNICO fonte para pedidos.
**Tags**: Produtos têm tags semânticas (refrigerante, cerveja, entrada, carne, frutos do mar, etc.) para busca inteligente.

### `buscar_deals`
**Método**: GET
**URL**: `{CRM-Host}/api/public/v1/deals?phone={phone}&board_key={key}`
**Quando**: Obter deal_id antes de adicionar produtos ao deal.

---

## Tools de Ação

### `adicionar_produto_deal`
**Método**: POST
**URL**: `{CRM-Host}/api/public/v1/deals/{deal_id}/items`
**Body**: `{ product_id, name, quantity, price }`
**Quando**: Adicionar item do pedido ao deal. 1x por item. Só após cliente terminar de pedir. NUNCA duplicar.

### `update_contato`
**Método**: PATCH
**URL**: `{CRM-Host}/api/public/v1/contacts/{contact_id}`
**Body**: `{ name, email, phone }` — campos vazios são ignorados
**Quando**: Cliente fornecer dados novos. IMPORTANTE no Instagram (sem celular).

### `registrar_agendamento_crm`
**Método**: POST
**URL**: `{CRM-Host}/api/public/v1/activities`
**Quando**: Registrar reserva como atividade (tipo: meeting).

### `Think`
**Tipo**: Raciocínio interno do agente. Usar para analisar resultados de `buscar_cardapio`.

---

## Notificações de Stage

Trigger no Supabase (`trg_notify_stage_change`) dispara webhook para n8n (`3uxs1Pdmsn17f0ke`) em toda mudança de stage (API, UI manual, qualquer fonte).

**Canal**: WhatsApp via Evolution API (`comercial lagosta`)

| Stage | Débora | Kairo | Telegram |
|-------|--------|-------|----------|
| Reserva de Mesas | — | ✅ | ✅ |
| Planejamento de Eventos | ✅ | ✅ | ✅ |
| Pedidos Retirada | ✅ | — | ✅ |
| Atendimento Humano | ✅ | ✅ | ✅ |

---

## Notas Técnicas

- Auth: header `X-Api-Key` (NÃO `Authorization: Bearer`)
- Credencial n8n: "Emporio Fonseca CRM" (id: `hMuD5EXfhyt72zjh`) em TODOS os 11 nodes
- Instagram: contato sem celular → email sintético `instagram-{id}@chat.local` → Sofia pede celular via chat
- Body dos tools: campo `parameters.jsonBody` (NÃO `parameters.body`)
- System prompt: `parameters.options.systemMessage` (NÃO top-level)
- AI toggle: label `atendimento-humano` no Chatwoot pausa a Sofia

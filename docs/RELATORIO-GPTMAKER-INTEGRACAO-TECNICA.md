# Relatório Técnico — Integração GPTMaker + NossoCRM

> **Projeto:** NossoCRM - CRM Inteligente para Agência de Viagens
> **Cliente:** Kleber Yascom
> **Base de análise:** Testes reais via API GPTMaker + código atual do NossoCRM
> **Última verificação:** 2026-04-08
>
> **AVISO:** Versão anterior deste relatório continha endpoints incorretos (`/api/public/v1/`) de outro sistema. Este documento foi corrigido com dados verificados.

---

## 1. Base URL correta da API

```
https://api.gptmaker.ai/v2
```

A URL `/api/public/v1/` retorna **503** e **não é da GPTMaker**. Todos os endpoints funcionais usam `/v2/`.

---

## 2. Autenticação

```
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

A chave de API está armazenada em `.env` do projeto:

```
GPTMAKER_API_KEY=eyJ...
```

---

## 3. Endpoints verificados e funcionais

Todos testados em 2026-04-08 com a conta de produção do cliente.

### 3.1 Workspace

| Método | Endpoint                              | Resultado                           |
| :----- | :------------------------------------ | :---------------------------------- |
| GET    | `/v2/workspaces`                      | Lista workspaces — 1 ativo          |
| GET    | `/v2/workspace/{workspaceId}/credits` | TRIAL, 1.000 créditos               |
| GET    | `/v2/workspace/{workspaceId}/agents`  | Lista agentes — agente "Isa"        |

**Workspace ID do cliente:** `3F15B76D670D8043E46932DE6B387D16`

### 3.2 Agente

| Método | Endpoint                              | Resultado                                   |
| :----- | :------------------------------------ | :------------------------------------------ |
| GET    | `/v2/agent/{agentId}`                 | Detalhes completos do agente                |
| GET    | `/v2/agent/{agentId}/settings`        | Modelo: GPT_5_MINI, TZ: America/Sao_Paulo   |
| GET    | `/v2/agent/{agentId}/webhooks`        | Todos os webhooks vazios (não configurados) |
| GET    | `/v2/agent/{agentId}/trainings`       | Vazio (nenhum treinamento adicionado)       |

**Agent ID do cliente (Isa):** `3F15B8140244706AFB3132DE6B387D16`

### 3.3 Conversa e contexto

| Método | Endpoint                              | Resultado                             |
| :----- | :------------------------------------ | :------------------------------------ |
| POST   | `/v2/agent/{agentId}/conversation`    | Conversa com a Isa — responde em PT-BR |
| POST   | `/v2/agent/{agentId}/add-message`     | Injeta contexto na conversa           |

---

## 4. Integração atual: como o fluxo funciona

O NossoCRM já tem a integração implementada na Edge Function `gptmaker-in`. O fluxo é:

```
Conversa (WhatsApp/Widget)
       ↓
   Agente Isa (GPTMaker)
       ↓ coleta dados de viagem
   Webhook → Edge Function gptmaker-in
       ↓
   NossoCRM (Supabase)
       ├─ Cria/atualiza contato
       └─ Abre deal no board "Captação de Leads"
```

### 4.1 Lógica de classificação do lead (Edge Function)

A função `gptmaker-in` classifica automaticamente:

| Condição                              | Classificação | Stage no CRM   |
| :------------------------------------ | :------------ | :------------- |
| Tem datas + urgência alta + orçamento | Quente        | Interessado    |
| Tem 2 dos 3 critérios acima           | Morno         | Novo Contato   |
| Tem 0 ou 1 critério                   | Frio          | Novo Contato   |

### 4.2 Campos recebidos pelo webhook

O payload esperado pela `gptmaker-in`:

```json
{
  "nome": "string",
  "contato": "telefone ou email",
  "destino": "string",
  "data_ida": "YYYY-MM-DD",
  "data_volta": "YYYY-MM-DD",
  "numero_viajantes": "string",
  "tipo_viagem": "string",
  "orcamento_categoria": "economica|intermediaria|premium",
  "urgencia": "string",
  "pipeline": "Captação de Leads",
  "classificacao": "opcional — sobrescreve classificação automática"
}
```

Header obrigatório: `X-Organization-ID: ca59a888-02e3-4761-9370-20bf9f25b375`

---

## 5. Configuração pendente: webhooks GPTMaker → NossoCRM

Os webhooks do agente Isa estão **todos vazios**. Para completar a integração, é necessário configurar no painel do GPTMaker:

| Evento              | URL a configurar                                                              |
| :------------------ | :---------------------------------------------------------------------------- |
| Lead qualificado    | `https://<projeto>.supabase.co/functions/v1/gptmaker-in`                      |
| Conversa encerrada  | `https://<projeto>.supabase.co/functions/v1/gptmaker-in`                      |

O header `X-Organization-ID` deve ser enviado em todas as chamadas.

---

## 6. Mapeamento de entidades

| GPTMaker       | NossoCRM           | Observação                                    |
| :------------- | :----------------- | :-------------------------------------------- |
| Workspace      | Organization       | `ca59a888-02e3-4761-9370-20bf9f25b375`        |
| Agent (Isa)    | —                  | Origem dos leads; não mapeado como entidade    |
| Conversa       | Deal               | Cada conversa qualificada gera 1 deal          |
| Contato (Isa)  | Contact            | Criado/atualizado por email ou telefone        |
| Board pipeline | Board "Captação de Leads" | Board com stages: Novo Contato, Interessado, Em Negociação, Fechou a Viagem |

---

## 7. Dados da conta de produção

> Estes dados são sensíveis. Não compartilhar publicamente.

| Item              | Valor                                    |
| :---------------- | :--------------------------------------- |
| Workspace ID      | `3F15B76D670D8043E46932DE6B387D16`       |
| Agent ID (Isa)    | `3F15B8140244706AFB3132DE6B387D16`       |
| Organization ID   | `ca59a888-02e3-4761-9370-20bf9f25b375`   |
| Supabase ref      | `drgsnhbtucwocpeiwdth`                   |
| Status de créditos | TRIAL — 1.000 créditos                  |

---

## 8. Próximos passos

1. **Configurar webhooks** do GPTMaker no painel web (seção Webhooks do agente Isa)
2. **Testar fluxo completo** end-to-end: conversa → webhook → deal criado no CRM
3. **Adicionar treinamentos** à Isa (informações da agência, produtos, políticas)
4. **Monitorar créditos** — conta TRIAL com 1.000 créditos; planejar upgrade antes de produção

---

## 9. Fontes

- Testes reais com API GPTMaker — 2026-04-08
- Código: `supabase/functions/gptmaker-in/index.ts`
- `.env` do projeto NossoCRM

# Goal-Oriented Agent — Design Spec

**Data:** 2026-04-09  
**Branch:** feature/004-goal-oriented-agent  
**Status:** Aprovado

---

## Contexto e Motivação

O sistema atual configura a IA por estágio do funil (`stage_ai_config`). Isso cria três problemas reais:

1. **Respostas erradas**: o agente responde quando não deveria — sem confidence gate por default, sem dry run
2. **Avanço incorreto de estágio**: critérios frágeis por estágio, sem visão holística da conversa
3. **Complexidade de configuração**: N estágios × M boards = configuração exponencial que nenhum usuário real vai fazer bem

A nova abordagem é **Goal-Oriented**: uma configuração por board, o agente decide autonomamente com base no objetivo, e humanos só orquestram (aprovam avanços de alto risco, recebem alertas de circuit breaker).

---

## Arquitetura

### Antes (Stage-Based)
```
Board → Stage → stage_ai_config → prompt por estágio → AI responde
```

### Depois (Goal-Oriented)
```
Board → board_ai_config (1 config) → Agent com objetivo → decide autonomamente
                                                         → usa RAG para contexto
                                                         → avalia avanço holístico
```

O agente conhece todos os estágios do board, a posição atual do lead, e o objetivo final — ele decide o que fazer sem depender de config por estágio.

---

## Data Model

### Nova tabela: `board_ai_config`

```sql
CREATE TABLE board_ai_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- Identidade do agente
  agent_name      text NOT NULL DEFAULT 'Assistente',
  business_context text,          -- "Escritório de advocacia, clientes são CEOs..."
  agent_goal      text,           -- "Qualificar leads, agendar reunião com o sócio..."
  persona_prompt  text,           -- Gerado automaticamente a partir de business_context

  -- Base de conhecimento (Google File Search Store)
  knowledge_store_id text,        -- ID do File Search Store no Google
  knowledge_store_name text,      -- Display name

  -- Modo de operação
  agent_mode      text NOT NULL DEFAULT 'observe'
                  CHECK (agent_mode IN ('observe', 'respond')),

  -- Safety
  circuit_breaker_threshold int NOT NULL DEFAULT 3,  -- erros consecutivos → pausa
  hitl_threshold  numeric NOT NULL DEFAULT 0.85,
  hitl_min_confidence numeric NOT NULL DEFAULT 0.70,
  hitl_expiration_hours int NOT NULL DEFAULT 24,

  -- Handoff
  handoff_keywords text[] NOT NULL DEFAULT '{}',
  max_messages_before_handoff int NOT NULL DEFAULT 10,

  -- Delay de resposta
  response_delay_seconds int NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (board_id)
);
```

### Tabela existente mantida: `stage_ai_config`
Mantida apenas para critérios de avanço de estágio (o único dado que faz sentido por estágio). O prompt e persona saem daqui e vão para `board_ai_config`.

### Nova coluna em `messaging_conversations`
```sql
ALTER TABLE messaging_conversations
  ADD COLUMN consecutive_ai_errors int NOT NULL DEFAULT 0;
```
Usado pelo circuit breaker.

---

## Dois SDKs, dois domínios

| Domínio | SDK | Justificativa |
|---|---|---|
| CRM Pilot (ferramentas, structured output) | `@ai-sdk/google` (Vercel AI SDK) | `generateText`, `streamText`, tool calling nativo |
| Messaging Agent (RAG, File Search) | `@google/genai` (Google SDK) | File Search Store, persistência de embeddings |

O Messaging Agent usa `@google/genai` para retrieval e pode chamar `generateText` do Vercel SDK com o contexto já resolvido — ou rodar tudo pelo `@google/genai`.

### Por que o Vercel AI SDK não serve para RAG
O `@ai-sdk/google` não expõe o **File Search Tool** (lançado em nov/2025 via Gemini Developer API). Esse recurso só está disponível no `@google/genai`.

---

## File Search Tool (Google RAG Gerenciado)

Substitui pipeline manual de embeddings/chunking/retrieval.

**Como funciona:**
```typescript
import { GoogleGenAI } from '@google/genai';

const client = new GoogleGenAI({ apiKey });

// Uma vez: criar store e fazer upload
const store = await client.fileSearchStores.create({
  displayName: `${boardId}-knowledge`
});
await client.fileSearchStores.uploadToFileSearchStore(
  store.name, { filePath: 'faq.pdf' }
);

// Em cada conversa: usar como ferramenta
const response = await client.models.generateContent({
  model: 'gemini-2.5-flash',
  tools: [{ fileSearch: { fileSearchStoreNames: [store.name] } }],
  contents: userMessage,
});
```

**Persistência:** store permanente (sem TTL), $0.15/1M tokens no upload, retrieval cobrado como tokens normais.

**Limite:** 1GB no tier gratuito, até 1TB nos tiers pagos. Recomendado manter abaixo de 20GB para latência ótima.

---

## Safety Layer

### 1. Confidence Gate (existente, mantido)
- Resposta: `shouldRespond: false` ou confidence baixa → skipa, não envia
- Avanço: thresholds HITL (0.70 / 0.85) já implementados

### 2. Circuit Breaker por conversa
**Trigger:** 3 erros consecutivos na mesma conversa (sem resposta do lead, handoff keyword detectada, bounce de mensagem)

**Comportamento:**
- Pausa IA para aquela conversa (`ai_paused: true` em `contacts`)
- Incrementa `consecutive_ai_errors` em `messaging_conversations`
- Notifica o humano responsável (Telegram, se configurado)
- Reset manual pelo usuário ou automático após 24h

### 3. Dry Run Mode (`agent_mode: 'observe'`)
- Agente processa tudo normalmente
- Loga em `ai_conversation_log` o que *teria* feito (campo `dry_run: true`)
- **Não envia mensagem, não avança estágio**
- Usuário valida o comportamento em relatório antes de ativar

**Default:** novos boards começam em `observe`. Transição para `respond` é explícita.

---

## Onboarding UX

Fluxo em 3 telas para configurar um novo agente:

### Tela 1 — Contexto do negócio
Campo de texto livre:
> "Descreva seu negócio em uma frase"

Exemplos sugeridos:
- "Escritório de advocacia empresarial, clientes são CEOs e CFOs, tom formal"
- "Escola de surf, clientes são turistas e entusiastas, tom leve e animado"

O modelo gera automaticamente: persona, tom, saudação padrão, palavras a evitar, `persona_prompt`.

### Tela 2 — Objetivo do agente
Campo de texto livre:
> "O que esse agente deve fazer?"

Exemplos sugeridos:
- "Qualificar leads, agendar reunião com o sócio, nunca prometer prazos processuais"
- "Vender pacote de aulas, confirmar disponibilidade, passar para humano se perguntar sobre parcelamento"

Gera automaticamente: `agent_goal`, keywords de handoff, critérios de avanço sugeridos por estágio.

### Tela 3 — Base de conhecimento (opcional)
Upload de arquivos (PDF, DOCX, TXT):
- FAQ, scripts de vendas, manual do produto, políticas
- File Search Store criado automaticamente via `@google/genai`
- ID do store salvo em `board_ai_config.knowledge_store_id`

### Preview ao vivo
Antes de salvar: simulação de 3 mensagens com o agente configurado.
- Mostra exatamente o que o agente responderia
- Permite ajustar persona/objetivo antes de ativar

---

## Fluxo de processamento (Messaging Agent)

```
Mensagem recebida
  → Verificar circuit breaker (consecutive_errors >= threshold → abort)
  → Verificar agent_mode ('observe' → log only, não envia)
  → Buscar board_ai_config do deal
  → Retrieval via File Search Store (se knowledge_store_id configurado)
  → generateText com persona_prompt + agent_goal + contexto RAG + histórico
  → Confidence gate (shouldRespond?)
  → Se respond: enviar mensagem, reset consecutive_errors
  → Se skip: logar, não enviar
  → Avaliar avanço de estágio (HITL thresholds)
  → Log em ai_conversation_log
```

---

## Migração do sistema atual

1. `stage_ai_config` mantida — critérios de avanço por estágio ficam aqui
2. `persona`, `system_prompt`, `tone` saem de `stage_ai_config` → `board_ai_config`
3. Script de migração: para cada board com stage_ai_config, cria um `board_ai_config` com a configuração do estágio mais avançado como base
4. UI de configuração por estágio simplificada: apenas critérios de avanço (não mais prompt/persona)

---

## O que NÃO muda

- Tabela `ai_conversation_log` e CHECK constraint (incluindo `stage_evaluation`)
- Tabela `ai_pending_stage_advances` e fluxo HITL
- `lib/ai/agent/stage-evaluator.ts` — lógica de avaliação de avanço
- `lib/ai/agent/hitl-stage-advance.ts` — módulo HITL
- Webhooks de mensageria (Evolution, Z-API, Meta)
- SDK Vercel AI para CRM Pilot tools

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Agente responde errado sem dry run | Default `observe` — usuário ativa explicitamente |
| File Search Store com custo inesperado | Cap de 1GB grátis, alertar antes de extrapolar |
| Migração quebra configs existentes | `stage_ai_config` mantida, migração não-destrutiva |
| Dois SDKs aumentam complexidade | Encapsular em módulos separados — `lib/ai/messaging/` e `lib/ai/crm/` |

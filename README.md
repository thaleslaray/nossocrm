# NossoCRM — Agência de Viagens

> CRM inteligente com assistente de IA e integração GPTMaker. Gerencie leads e pipeline de vendas para agências de viagens.

---

## Origem do Projeto

Este repositório é um **fork especializado** de [thaleslaray/nossocrm](https://github.com/thaleslaray/nossocrm), adaptado para o cliente **Kleber Yascom — Viagens +**.

### Relação com o repositório base

| Aspecto                     | Base (`thaleslaray/nossocrm`)              | Este fork (`kleberyascom/nossocrm`)             |
| :-------------------------- | :----------------------------------------- | :---------------------------------------------- |
| **Foco**                    | CRM genérico multi-segmento                | CRM especializado para agências de viagens      |
| **Campos de contato**       | Genéricos                                  | +10 campos de viagem (destino, datas, categoria, urgência) |
| **Integração IA**           | Google Gemini consolidado                  | GPTMaker + agente Isa (pré-qualificação)        |
| **Webhook inbound**         | Genérico                                   | `gptmaker-in` + classificação por temperatura   |
| **Messaging**               | Evolution API / Meta / Z-API               | Portado do base (mantido sem uso ativo)         |
| **Pipeline**                | Configurável                               | Fixo: Novo Contato → Interessado → Em Negociação → Fechou |

### Política de sincronização

- **Customizações locais** (travel-first, GPTMaker, Isa) têm prioridade e **nunca devem ser sobrescritas** por merges do base.
- **Atualizações do base** são portadas pontualmente via `git checkout upstream/main -- <path>` para arquivos específicos.
- O remote `upstream` aponta para `https://github.com/thaleslaray/nossocrm` e deve ser mantido para facilitar comparações.

```bash
# Verificar divergência com o base
git fetch upstream
git diff --name-only HEAD..upstream/main

# Portar arquivo específico do base (sem sobrescrever customizações)
git checkout upstream/main -- <caminho/do/arquivo>
```

---

## Índice

- [Sobre](#sobre)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Integração GPTMaker](#integração-gptmaker)
- [Instalação](#instalação)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Desenvolvimento Local](#desenvolvimento-local)
- [Documentação](#documentação)

---

## Sobre

**NossoCRM** é um CRM desenvolvido para agências de viagens, com foco em:

- Captação e qualificação de leads via IA (agente Isa, GPTMaker)
- Gestão de contatos com campos específicos de viagem
- Pipeline Kanban com estágios do funil de vendas
- Assistente de IA integrado para consultas e análises
- Painel multi-tenant com isolamento por organização

**Cliente:** Kleber Yascom — Viagens +

---

## Funcionalidades

### Gestão de Contatos

Cada contato armazena dados completos de viagem:

| Campo                 | Descrição                                           |
| :-------------------- | :-------------------------------------------------- |
| Nome, telefone, e-mail | Dados básicos                                      |
| Destino da viagem     | Cidade/país de interesse                            |
| Data prevista         | Data aproximada da viagem                           |
| Categoria             | Econômica / Intermediária / Premium & Luxo          |
| Urgência              | Imediato (≤30d) / Curto prazo / Médio prazo / Planejando |
| Viajantes             | Número de adultos + crianças (com idades)           |
| Origem do lead        | Instagram / Facebook / Google / Site / WhatsApp / Indicação |
| Indicado por          | Nome de quem indicou (quando origem = Indicação)    |
| Observações           | Preferências, restrições, datas flexíveis (até 1.000 chars) |

### Pipeline Kanban

Estágios do funil configurados:

1. **Novo Contato** — Lead recém-chegado
2. **Interessado** — Demonstrou interesse concreto
3. **Em Negociação** — Proposta em andamento
4. **Fechou a Viagem** — Venda concluída

### Assistente de IA (CRM Agent)

Integrado via AI SDK. Permite consultar e operar o CRM via linguagem natural:

- "Mostre contatos com destino Orlando"
- "Quais leads têm urgência imediata?"
- "Crie um contato para Ana Silva, destino Paris, categoria premium"
- "Analise o pipeline e me dê insights"

### Integração GPTMaker

O agente **Isa** (GPTMaker) faz pré-qualificação automática de leads via chat. Ao final da conversa, envia os dados para a Edge Function `gptmaker-in`, que classifica o lead e cria o deal no pipeline.

---

## Arquitetura

```
Next.js 15 (App Router)
├── app/                    Rotas e layouts
│   ├── (auth)/             Login / registro
│   ├── (dashboard)/        Área autenticada
│   └── api/                API Routes
│       ├── contacts/       CRUD de contatos
│       ├── ai/             Proxy do CRM Agent
│       └── webhooks/       Webhooks inbound
├── features/
│   ├── contacts/           Listagem, formulário, drawer de detalhes
│   ├── pipeline/           Kanban de deals
│   └── inbox/              Briefing diário
├── lib/
│   ├── ai/                 CRM Agent (tools + prompts + catalog)
│   └── validations/        Schemas Zod
└── supabase/
    ├── migrations/         Migrations SQL
    └── functions/
        ├── gptmaker-in/    Edge Function: recebe leads do GPTMaker
        └── webhook-in/     Edge Function: webhooks genéricos

Banco de dados: Supabase Cloud (PostgreSQL)
Deploy: Vercel
```

---

## Integração GPTMaker

### Fluxo

```
Cliente conversa com Isa (WhatsApp/Widget)
         ↓
   GPTMaker coleta dados da viagem
         ↓
   Webhook → POST /functions/v1/gptmaker-in
   Header: X-Organization-ID: <org-id>
         ↓
   Edge Function classifica o lead:
   ├── Quente (datas + urgência + orçamento) → stage: Interessado
   └── Morno / Frio                          → stage: Novo Contato
         ↓
   Cria/atualiza contato + abre deal no board "Captação de Leads"
```

### Payload esperado

```json
{
  "nome": "Ana Souza",
  "contato": "+5511999999999",
  "destino": "Orlando",
  "data_ida": "2026-07-10",
  "data_volta": "2026-07-20",
  "numero_viajantes": "2 adultos, 1 criança (8 anos)",
  "orcamento_categoria": "intermediaria",
  "urgencia": "alta",
  "pipeline": "Captação de Leads"
}
```

### Conta GPTMaker (cliente)

| Campo          | Valor                                  |
| :------------- | :------------------------------------- |
| Workspace ID   | `3F15B76D670D8043E46932DE6B387D16`     |
| Agent ID (Isa) | `3F15B8140244706AFB3132DE6B387D16`     |
| Modelo         | GPT_5_MINI                             |
| Status         | TRIAL — verificar créditos antes de produção |

> Detalhes completos: `docs/RELATORIO-GPTMAKER-INTEGRACAO-TECNICA.md`

---

## Instalação

### Pré-requisitos

- Node.js 18+
- pnpm
- Conta Supabase Cloud
- Conta Vercel (deploy)
- Chave de API GPTMaker (opcional — para integração Isa)

### Deploy na Vercel

1. Fork deste repositório
2. Importe no Vercel (framework: Next.js)
3. Configure as variáveis de ambiente (veja seção abaixo)
4. Deploy automático

### Banco de dados

```bash
# Instalar Supabase CLI
pnpm add -g supabase

# Aplicar migrations
supabase db push --project-ref <PROJECT_REF>

# Deploy das Edge Functions
supabase functions deploy gptmaker-in --project-ref <PROJECT_REF>
supabase functions deploy webhook-in --project-ref <PROJECT_REF>
```

---

## Variáveis de Ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# IA (pelo menos um provedor)
GOOGLE_GENERATIVE_AI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...

# GPTMaker (opcional)
GPTMAKER_API_KEY=eyJ...

# Rate limiting (opcional)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## Desenvolvimento Local

```bash
# Instalar dependências
pnpm install

# Iniciar servidor de desenvolvimento
pnpm dev

# Verificar tipos TypeScript
pnpm typecheck

# Lint
pnpm lint

# Build de produção
pnpm build
```

---

## Documentação

| Documento                                              | Conteúdo                                         |
| :----------------------------------------------------- | :----------------------------------------------- |
| `docs/relatorio-implementacao-agencia-viagens.md`      | Relatório completo PDF spec vs executado         |
| `docs/RELATORIO-GPTMAKER-DOCUMENTACAO.md`              | Documentação da plataforma GPTMaker              |
| `docs/RELATORIO-GPTMAKER-INTEGRACAO-TECNICA.md`        | Endpoints verificados e fluxo de integração      |
| `docs/RELATORIO-ENTREGA-Webhook-Leads.md`              | Relatório de entrega — webhooks de leads         |
| `docs/webhooks.md`                                     | Guia de configuração de webhooks                 |
| `docs/public-api.md`                                   | Documentação da API pública                      |

---

## Stack

| Camada       | Tecnologia                                      |
| :----------- | :---------------------------------------------- |
| Frontend     | Next.js 15, React 19, TypeScript, Tailwind CSS  |
| Backend      | Next.js API Routes, Supabase Edge Functions     |
| Banco        | Supabase Cloud (PostgreSQL)                     |
| Auth         | Supabase Auth                                   |
| IA           | AI SDK v4 — Google Gemini / OpenAI / Anthropic  |
| Deploy       | Vercel                                          |
| Integração   | GPTMaker (agente Isa)                           |

---

## Licença

Projeto privado. Todos os direitos reservados — Kleber Yascom / Viagens +.

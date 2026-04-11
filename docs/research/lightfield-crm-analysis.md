# Lightfield CRM - Análise Completa

> **Data da Pesquisa**: 2026-02-07
> **Propósito**: Benchmark para evolução do NossoCRM
> **Fontes**: lightfield.app, support.lightfield.app, Contrary Research, VentureBeat

---

## 1. Sobre a Empresa

| Aspecto | Detalhe |
|---------|---------|
| **Fundadores** | Keith Peiris (CEO) e Henri Liriani (CPO) - ex-Product Managers do Meta |
| **Origem** | Pivotaram do Tome (app de apresentações com 25M usuários) em 2025 |
| **Sede** | San Francisco |
| **Equipe** | 28 pessoas |
| **Funding** | $81M total (Series B a $300M valuation) |
| **Status** | Private beta com centenas de times |

### Por que o Nome "Lightfield"?

Em fotografia/óptica, **light field** captura toda informação luminosa de uma cena, permitindo reconstruir qualquer perspectiva depois. O CRM Lightfield faz o mesmo: **captura tudo** e permite consultar de qualquer ângulo depois.

---

## 2. História e Pivot

Keith e Henri criaram o Tome em 2022, um app de apresentações com AI que chegou a 25M de usuários. Descobriram que os usuários mais engajados eram **equipes de vendas enterprise**.

Ao investigar, perceberam que o problema real não era geração de conteúdo:

> *"O problema era ingerir, organizar e fazer sentido de dados de vendas fragmentados"*

Sobre CRMs tradicionais:

> *"Talvez o software mais complexo e com menor satisfação do planeta"*

---

## 3. Filosofia Central

### Princípio #1: Automação surge da compreensão

> *"You can't automate what you don't understand. You can't train an AI SDR on context that doesn't exist."*

### Princípio #2: Evitar abstração prematura

> *"We deliberately avoid premature abstraction. Summaries, fields, and dashboards are derived views—not the source of truth."*

### Princípio #3: Human-in-the-Loop

> *"We want the human attached to the record update"*

Usuários confiam no CRM porque sempre há confirmação humana para mudanças importantes.

---

## 4. Os 3 Pilares (Fundações)

| Pilar | Descrição |
|-------|-----------|
| **Contexto Completo** | Lê emails, transcrições, registros - histórico integral |
| **World Model** | Modelo que entende negócio, produto e mercado |
| **Schema-less** | Captura tudo desde dia 1, schema evolui depois |

---

## 5. Arquitetura Técnica

### 5.1 Fontes de Dados
- Email (Gmail, Outlook)
- Calendário
- Slack
- Transcrições de reuniões
- Tickets de suporte
- Analytics de produto

### 5.2 Schema Flexível

> *"As schema changes, new data is backfilled accordingly"*

Quando requisitos de negócio mudam, o sistema re-analiza dados históricos automaticamente.

### 5.3 Modelo de Privacidade

Privacy per-object desde a concepção - LLMs só veem o que o usuário individual pode acessar.

### 5.4 Modelos de AI Suportados
- Gemini 3 Pro (~1M token context window)
- Claude Opus 4.5
- GPT 5.1

---

## 6. Padrões de Design

### 6.1 Lossless Memory
Nunca perder contexto. Summaries e dashboards são views derivadas, não source of truth.

### 6.2 Chronology + Attribution + Causality
- **Chronology**: Ordem completa dos eventos preservada
- **Attribution**: Quem disse o quê, quando e por quê
- **Causality**: Como ações passadas levam a resultados presentes
- **State Evolution**: Rastrear evolução de confiança, momentum, intenção

### 6.3 Automatic Data Infrastructure
Dados ingeridos automaticamente sem entrada manual - o CRM se preenche sozinho.

### 6.4 Suggested Record Updates
Updates sugeridos aparecem inline com a fonte, permitindo aceitar/rejeitar rapidamente.

### 6.5 AI-Filled Fields
Descreva o campo em linguagem natural ("Qual CRM esta empresa usa?") e o sistema preenche automaticamente.

### 6.6 Agentic Workflows
Workflows com "agent step" que tem acesso a:
- Querying/analyzing records
- Creating/editing records
- Web research
- Custom field population

### 6.7 Zero Migration Cost
Agentes Python para migrações automáticas. Custo de migração aproximando-se de zero.

### 6.8 MCP Integration
Model Context Protocol para integrações em dias, não meses.

---

## 7. 3 Tipos de AI CRM

| Tipo | Característica | Limitação |
|------|----------------|-----------|
| **Tipo 1** | IA "colada" em CRM legado | AI raciocina sobre sombra da realidade |
| **Tipo 2** | Transcrição + auto-fill | Captura ≠ compreensão |
| **Tipo 3** | IA como fundação | Entende, sintetiza, raciocina sobre tudo |

Lightfield se posiciona como Tipo 3.

---

## 8. 5 Testes para Avaliar um AI CRM

1. **Teste de Captura** - Quanto do que acontece o sistema realmente sabe?
2. **Teste de Síntese** - Identifica padrões em toda base?
3. **Teste do "Por quê"** - Explica causas, não só eventos?
4. **Teste de Query** - Aceita perguntas em linguagem natural?
5. **Teste de Ação** - Transforma insights em ações?

---

## 9. Data Model

### 9.1 Três Tipos de Registros

| Tipo | Descrição | Criação |
|------|-----------|---------|
| **Accounts** | Empresas/organizações | Automático via email/calendário |
| **Contacts** | Pessoas nas organizações | Automático via email/calendário |
| **Opportunities** | Negociações potenciais | Manual ou via chat |

### 9.2 Customizações

- Campos personalizados (ARR, ICP tier, funding stage, tech stack)
- AI Fill com descrição em linguagem natural
- Estágios de oportunidade customizáveis
- Apenas Admins podem editar
- Arquivar campo mantém dados históricos

---

## 10. Workflows

### 10.1 Triggers Disponíveis
- Criação de objetos (meetings, tasks, notes)
- Updates de objetos
- Webhooks de sistemas externos
- Triggers manuais

### 10.2 Steps Disponíveis
- **Find Step**: Busca em reuniões, tarefas, notas, emails
- **Agent Step**: AI executa ações com ferramentas completas
- **HTTP Out**: Push dados para outros serviços
- **Create**: Notas, tarefas, registros
- **Delay**: Com unidades configuráveis

### 10.3 Exemplo de Workflow

```
1. Webhook recebe lead de sistema externo
2. Agent step cria Account + Contact + Opportunity
3. Auto-preenche custom fields com AI
4. Notifica via HTTP para Slack
```

---

## 11. Features Principais

| Feature | Descrição |
|---------|-----------|
| **Meeting Recorder** | Gravação, transcrição, resumo automático |
| **Backsync** | Até 2 anos de histórico retroativo |
| **Enrichment** | Via Exa web search + waterfall de providers |
| **Suggested Tasks** | Extrai tarefas de reuniões e emails |
| **Up Next** | View de próximas reuniões + tarefas + sugestões |
| **Dark Mode** | Lançado Jan 2026 |
| **File Uploads** | Docs em Accounts/Opportunities como contexto |
| **Natural Language Queries** | Com citações de conversas específicas |

---

## 12. Pricing

| Plano | Preço | Target | Limites |
|-------|-------|--------|---------|
| **Startup** | $36/user/mês | Founder sales | 10K records, 1K workflow events |
| **Pro** | $99/user/mês (anual) | Scaling companies | 50K records, 10K workflow events |

Ambos incluem: Call recording, email sync, agent queries ilimitadas, workflow builder.

---

## 13. Competidores

| Competitor | Foco | Diferencial |
|------------|------|-------------|
| **Attio** | CRM moderno | Customizável, user-managed |
| **Clay** | Data enrichment | 100+ data sources |
| **People.ai** | Sales intelligence | Camada sobre Salesforce |
| **Salesforce Agentforce** | AI agents | Incumbente, 1000+ deals fechados |
| **Microsoft Sales Agent** | AI agents | Integração Office |

**Vantagem Lightfield**: Captura empresas **antes** que HubSpot/Salesforce pensem nelas.

---

## 14. Oportunidades de Mercado

1. **Consolidação econômica**: Substituir 10+ tools ($3-5K/seat) por solução única ($20-30/seat)
2. **Produtividade**: Sales reps gastam 65% do tempo em atividades não-vendas
3. **TAM**: CRM market $73.4B (2024) → $163.2B (2030)

---

## 15. Riscos Identificados

1. **Competição**: Salesforce e Microsoft adicionando AI agressivamente
2. **Feature completeness**: Precisa construir basics enterprise (forecasting, territory)
3. **Fragmentação**: Milhares de AI agents emergindo para casos específicos

---

## 16. Changelog Highlights (2025-2026)

| Data | Feature | Impacto |
|------|---------|---------|
| Nov 2025 | GA Launch | Disponibilidade geral |
| Nov 2025 | Suggested Record Updates | UX de aprovação inline |
| Dez 2025 | Meeting Recorder | Gravação + transcrição |
| Dez 2025 | Gemini 3 Pro Support | 1M token context |
| Dez 2025 | Enrichment Overhaul | Exa + waterfall |
| Dez 2025 | Microsoft Outlook | Email + calendário |
| Jan 2026 | Webhook Workflows | Triggers externos |
| Jan 2026 | HTTP Requests | Integração outbound |
| Jan 2026 | Up Next View | Tarefas + sugestões |
| Jan 2026 | Agentic Workflows | Agent step no builder |
| Jan 2026 | Dark Mode | UX noturna |

---

## 17. Citações Importantes

### Sobre CRMs Tradicionais
> *"The last three conversations feel like your entire market — decisions based on recent impressions, not real patterns"*

### Sobre Timing
> *"Each day you wait, you lose irrecoverable context. Early conversations contain pure signals about real problems."*

### Sobre Data Moats
> *"The cost of data migration is rapidly approaching zero... mediocre products lose their ability to lock customers into extractive long-term contracts."*

### Sobre Automação
> *"Sales representatives spend 65% of time on non-selling activities"*

---

## 18. Links e Referências

- [Lightfield Official](https://lightfield.app/)
- [Lightfield Blog](https://lightfield.app/blog)
- [Lightfield Support](https://support.lightfield.app)
- [Contrary Research](https://research.contrary.com/company/lightfield)
- [VentureBeat Article](https://venturebeat.com/ai/tomes-founders-ditch-viral-presentation-app-with-20m-users-to-build-ai)
- [Demo Video](https://www.youtube.com/watch?v=Idmapqa9vYk)

---

## 19. Aplicação no NossoCRM

Ver documento separado: `lightfield-ideas-for-nossocrm.md`

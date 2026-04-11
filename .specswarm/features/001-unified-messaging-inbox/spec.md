---
parent_branch: fix/react-code-verification
feature_number: 001
status: In Progress
created_at: 2026-02-05T14:30:00-03:00
prd_reference: /Users/thaleslaray/.claude/plans/elegant-knitting-star.md
---

# Feature: Inbox Unificado de Messaging Omnichannel

## Overview

### Problema
Vendedores do NossoCRM atualmente precisam alternar entre o CRM e múltiplos aplicativos externos (WhatsApp, Instagram) para se comunicar com clientes. Isso resulta em:
- Perda de contexto e histórico de conversas
- Tempo desperdiçado alternando entre aplicativos
- Dificuldade em manter registro centralizado de interações
- Impossibilidade de vincular conversas a negociações (deals) existentes

### Solução
Criar um **Inbox Unificado** dentro do NossoCRM onde vendedores podem:
- Visualizar todas as conversas de todos os canais em um único lugar
- Enviar e receber mensagens diretamente do CRM
- Ver automaticamente qual contato/deal está associado à conversa
- Acompanhar status de entrega das mensagens (enviado/entregue/lido)

### Valor para o Usuário
| Benefício | Impacto Esperado |
|-----------|-----------------|
| Centralização | Elimina alternância entre apps |
| Contexto | Histórico completo visível durante atendimento |
| Produtividade | Redução de 50% no tempo de resposta |
| Rastreabilidade | 100% das interações registradas no CRM |

---

## User Scenarios

### Cenário 1: Vendedor Recebe Mensagem do WhatsApp
**Ator**: Vendedor (usuário do CRM)

**Fluxo**:
1. Cliente envia mensagem via WhatsApp para o número +55 11 9999-0001 (Comunidade de Automação)
2. Sistema identifica que este número pertence à Business Unit "Comunidade de Automação"
3. Vendedor (com acesso à unit) vê notificação de nova mensagem no inbox
4. Vendedor seleciona a Business Unit "Comunidade de Automação" no filtro
5. Vendedor abre a conversa e vê:
   - Nome e foto do contato
   - Business Unit: Comunidade de Automação
   - Boards disponíveis da unit para criar deal
   - Histórico completo da conversa
6. Vendedor responde diretamente pelo CRM
7. Cliente recebe a resposta no WhatsApp

**Resultado Esperado**: Vendedor atende cliente dentro do contexto da Business Unit correta

### Cenário 2: Vendedor Inicia Conversa com Lead
**Ator**: Vendedor

**Fluxo**:
1. Vendedor está visualizando um contato no CRM
2. Vendedor clica em "Enviar Mensagem" e seleciona WhatsApp
3. Sistema abre nova conversa vinculada ao contato
4. Vendedor digita e envia mensagem
5. Conversa aparece no inbox com vínculo ao contato

**Resultado Esperado**: Nova conversa criada e vinculada automaticamente

### Cenário 3: Admin Cria Business Unit e Configura Canal
**Ator**: Administrador

**Fluxo**:
1. Admin acessa Configurações > Business Units
2. Admin clica em "Criar Business Unit"
3. Admin preenche: Nome ("Comunidade de Automação"), descrição
4. Admin seleciona boards existentes para vincular OU cria novos
5. Admin acessa aba "Canais" da Business Unit
6. Admin clica em "Adicionar Canal" > WhatsApp
7. Sistema exibe opções de provedor (setup rápido vs oficial)
8. Admin insere credenciais conforme provedor escolhido
9. Para provedor não-oficial: Admin escaneia QR Code com celular
10. Sistema confirma conexão bem-sucedida
11. Canal aparece como "Conectado" vinculado à Business Unit

**Resultado Esperado**: Business Unit criada com canal configurado, pronta para receber mensagens que irão para os boards corretos

### Cenário 4: Vendedor Filtra Conversas por Status
**Ator**: Vendedor

**Fluxo**:
1. Vendedor acessa inbox unificado
2. Vendedor aplica filtro "Não lidas" ou "Por canal"
3. Sistema exibe apenas conversas que correspondem ao filtro
4. Vendedor pode ordenar por "Mais recente" ou "Mais antiga"

**Resultado Esperado**: Vendedor encontra rapidamente conversas prioritárias

### Cenário 5: Sistema Vincula Automaticamente Conversa a Contato
**Ator**: Sistema (automático)

**Fluxo**:
1. Nova mensagem chega de número desconhecido no canal da Business Unit "Mentoria"
2. Sistema identifica a Business Unit através do canal receptor
3. Sistema busca contato pelo número de telefone (normalizado E.164)
4. Se encontrar: Vincula conversa ao contato existente
5. Se não encontrar: Cria automaticamente novo contato com nome e telefone do WhatsApp
6. Conversa é vinculada ao contato e à Business Unit "Mentoria"
7. Ao criar deal, sistema sugere apenas boards da Business Unit "Mentoria"
8. Usuário pode editar dados do contato ou vincular a contato diferente depois

**Resultado Esperado**: Contatos criados automaticamente, conversas vinculadas ao contexto correto da Business Unit

---

## Functional Requirements

### FR-0: Business Units (Unidades de Negócio)
- **FR-0.1**: Administradores podem criar Business Units (ex: "Comunidade de Automação", "Mentoria")
- **FR-0.2**: Cada Business Unit agrupa: canais de comunicação, boards/pipelines, configuração de IA
- **FR-0.3**: Boards existentes podem ser atribuídos a uma Business Unit
- **FR-0.4**: Sistema cria automaticamente uma "Business Unit Padrão" na primeira organização que usa messaging (para conversas de canais ainda não configurados ou fallback)
- **FR-0.5**: Administradores podem definir quais membros têm acesso a cada Business Unit
- **FR-0.6**: Ao selecionar uma Business Unit, usuário vê apenas conversas, deals e boards daquela unit

### FR-1: Gerenciamento de Canais
- **FR-1.1**: Administradores podem adicionar canais de comunicação (WhatsApp inicialmente)
- **FR-1.2**: Cada canal deve ser vinculado a uma Business Unit específica
- **FR-1.3**: Sistema suporta múltiplos provedores para o mesmo tipo de canal
- **FR-1.4**: Sistema exibe status de conexão do canal (conectado/desconectado/erro)
- **FR-1.5**: Sistema permite reconectar canal desconectado
- **FR-1.6**: Sistema armazena credenciais criptografadas no banco (Supabase Vault ou AES-256)
- **FR-1.7**: Cada canal pode ter sua própria configuração de IA/Bot (herdada da Business Unit ou customizada)

### FR-2: Recebimento de Mensagens
- **FR-2.1**: Sistema recebe mensagens em tempo real via webhooks
- **FR-2.2**: Sistema exibe notificação visual de nova mensagem
- **FR-2.3**: Sistema suporta mensagens de texto
- **FR-2.4**: Sistema suporta recebimento de imagens, documentos e áudios
- **FR-2.5**: Sistema exibe preview de mídia na conversa

### FR-3: Envio de Mensagens
- **FR-3.1**: Usuários podem enviar mensagens de texto
- **FR-3.2**: Usuários podem enviar imagens e documentos
- **FR-3.3**: Sistema exibe status de envio (enviando/enviado/entregue/lido)
- **FR-3.4**: Sistema permite responder a mensagem específica (reply)
- **FR-3.5**: Usuários podem deletar mensagens enviadas (recall) - sistema tenta deletar no provedor se API suportar

### FR-4: Inbox Unificado
- **FR-4.1**: Sistema exibe lista de todas as conversas ordenadas por última mensagem
- **FR-4.2**: Cada conversa exibe: nome do contato, canal, Business Unit, preview da última mensagem, timestamp
- **FR-4.3**: Conversas com mensagens não lidas são destacadas visualmente
- **FR-4.4**: Sistema permite filtrar por: Business Unit, canal, status (`open`/`resolved`), não lidas
- **FR-4.5**: Sistema permite buscar conversas por nome ou conteúdo
- **FR-4.6**: Todos os usuários da organização podem visualizar todas as conversas (sem restrição por atribuição)
- **FR-4.7**: Sistema exibe indicador de presença quando outro usuário está visualizando/digitando na mesma conversa
- **FR-4.8**: Seletor de Business Unit permite alternar rapidamente entre contextos

### FR-5: Vinculação com CRM
- **FR-5.1**: Sistema vincula automaticamente conversas a contatos existentes por telefone
- **FR-5.2**: Se contato não existir, sistema cria automaticamente novo contato com nome e telefone do WhatsApp
- **FR-5.3**: Usuário pode vincular manualmente conversa a um contato diferente
- **FR-5.4**: Usuário pode vincular conversa a múltiplos deals (relação 1:N)
- **FR-5.5**: Ao abrir conversa, sistema exibe painel lateral com dados do contato (nome, empresa, telefone, deals, atividades)
- **FR-5.6**: Ao criar deal a partir da conversa, sistema exibe apenas boards da Business Unit do canal
- **FR-5.7**: Deal criado a partir da conversa herda a Business Unit automaticamente
- **FR-5.8**: Admin pode configurar criação automática de deal por Business Unit (ativa/desativa)
- **FR-5.9**: Se deal automático ativado, cria no board padrão definido na config da Business Unit
- **FR-5.10**: Conversa exibe duas abas: "Mensagens" e "Atividades" (atividades do contato/deal)

### FR-6: Janela de Resposta (Específico WhatsApp)
- **FR-6.1**: Sistema exibe indicador visual da janela de 24h (quando aplicável)
- **FR-6.2**: Sistema alerta quando janela está prestes a expirar
- **FR-6.3**: Sistema bloqueia envio de mensagens livres quando janela expirada

### FR-7: Atribuição de Conversas
- **FR-7.1**: Conversas podem ser atribuídas a usuários específicos
- **FR-7.2**: Sistema registra quem e quando atribuiu a conversa
- **FR-7.3**: Usuários podem ver apenas conversas atribuídas a eles (filtro opcional)

---

## Success Criteria

### Critérios Funcionais (MVP)

| Critério | Métrica de Sucesso |
|----------|-------------------|
| **Business Units** | Admin consegue criar Business Unit e vincular canal/boards em menos de 3 minutos |
| **Recebimento de mensagens** | Mensagens aparecem no inbox em menos de 5 segundos após envio |
| **Envio de mensagens** | Mensagens enviadas são entregues ao destinatário com sucesso em 95%+ dos casos |
| **Vinculação automática** | 90%+ das conversas com contatos existentes são vinculadas automaticamente |
| **Status de entrega** | Sistema exibe corretamente sent/delivered/read em 100% das mensagens (quando suportado pelo provedor) |
| **Conexão de canal** | Admin consegue configurar e conectar canal em menos de 5 minutos |
| **Contexto correto** | 100% das conversas são associadas à Business Unit correta baseado no canal receptor |

### Critérios de Experiência do Usuário

| Critério | Métrica de Sucesso |
|----------|-------------------|
| **Tempo de resposta** | Vendedores reduzem tempo médio de resposta em 50% |
| **Adoção** | 80%+ dos usuários ativos utilizam o inbox em 30 dias |
| **Satisfação** | NPS do recurso > 40 |
| **Centralização** | 100% das conversas de canais configurados visíveis no CRM |

### Critérios de Confiabilidade

| Critério | Métrica de Sucesso |
|----------|-------------------|
| **Disponibilidade** | Sistema de messaging disponível 99.5% do tempo |
| **Perda de mensagens** | Zero mensagens perdidas (todas registradas mesmo se webhook falhar temporariamente) |
| **Reconexão** | Canal reconecta automaticamente após desconexão em menos de 2 minutos |

---

## Key Entities

### Business Unit (Unidade de Negócio) - NOVO
- Agrupamento lógico de pipelines, canais e configurações
- Exemplos: "Comunidade de Automação", "Mentoria", "Onboarding Clientes"

**Atributos:**
- `id`: UUID (PK)
- `organization_id`: UUID (FK → organizations)
- `key`: TEXT (slug único por org, ex: 'comunidade', 'mentoria') - **OBRIGATÓRIO**
- `name`: TEXT (nome amigável)
- `description`: TEXT (opcional)
- `created_at`, `updated_at`: TIMESTAMPTZ

**Relacionamentos:**
- Organization → Business Units (1:N)
- Business Unit → Boards (1:N) - board.business_unit_id
- Business Unit → Channels (1:N) - channel.business_unit_id
- Business Unit → Members (N:N) - business_unit_members

**Regras de Acesso:**
- Admin vê todas as Business Units da organização
- Vendedor vê apenas units onde foi adicionado como membro
- Contatos são globais (org), podem ter conversas em qualquer unit

**Configurações da Unit:**
- `auto_create_deal`: BOOLEAN - Criar deal automaticamente em nova conversa
- `default_board_id`: UUID - Board padrão para deals automáticos

**Fluxo de Criação:**
1. Admin cria Business Unit (name, key, description)
2. Admin cria/vincula boards à unit
3. Admin define board padrão (para deals automáticos)
4. Admin adiciona canais à unit
5. Admin adiciona membros (vendedores) à unit
6. Admin ativa/desativa criação automática de deal

### Conversation (Conversa)
- Representa uma thread de mensagens com um contato externo
- Vinculada a: Canal, Business Unit, Contato, Deal (opcional), Usuário atribuído (opcional)
- **Estados**: `open` (aberta), `resolved` (resolvida) - MVP apenas estes dois
- Estados futuros (pós-MVP): `pending`, `snoozed`

### Message (Mensagem)
- Unidade individual de comunicação dentro de uma conversa
- Direção: Entrada (do cliente) ou Saída (para o cliente)
- Tipos: Texto, Imagem, Vídeo, Áudio, Documento, Sticker, Localização
- Estados de entrega: Pendente, Enviado, Entregue, Lido, Falhou

### Channel (Canal)
- Configuração de um meio de comunicação (ex: WhatsApp da empresa)
- Um canal = um número/conta conectada
- **Pertence a uma Business Unit específica**
- Estados: Pendente, Conectando, Conectado, Desconectado, Erro

### External Contact (Contato Externo)
- Identificador do cliente no canal externo (telefone, username)
- Pode ou não estar vinculado a um Contact do CRM

### Contact-Conversation Relationship
- **Um contato pode ter múltiplas conversas** em diferentes Business Units
- Cada conversa herda a Business Unit do canal receptor
- Exemplo: João pode ter conversa na "Mentoria" E na "Comunidade" (mesmo contato, conversas separadas)

---

## Assumptions

### Sobre o Negócio
1. **Volume inicial**: Estimativa de até 100 conversas ativas simultâneas por organização
2. **Canais prioritários**: WhatsApp é o canal mais importante (90%+ do uso esperado)
3. **Usuários**: Média de 5 vendedores por organização usando o inbox
4. **Horário**: Maior uso durante horário comercial (9h-18h)

### Sobre Provedores
1. **Disponibilidade**: Provedores de WhatsApp têm SLA de 99.9%
2. **Webhooks**: Webhooks são entregues em ordem cronológica (sem garantia de idempotência)
3. **Rate limits**: Provedores oficiais limitam 80 mensagens/segundo

### Sobre Comportamento do Usuário
1. **Resposta rápida**: Vendedores respondem em média em 5 minutos durante horário ativo
2. **Conversas curtas**: Maioria das conversas tem menos de 20 mensagens
3. **Mídia**: 70% das mensagens são texto, 30% incluem mídia

### Decisões de Design
1. **Matching por telefone**: Usar formato E.164 normalizado para matching de contatos
2. **Histórico**: Armazenar histórico completo (sem limite de mensagens antigas)
3. **Soft delete**: Conversas "resolvidas" não são deletadas, apenas arquivadas
4. **Multi-tenant**: Dados isolados por organização com segurança em nível de linha
5. **Tempo real**: Novas mensagens aparecem instantaneamente sem refresh manual

### Sobre Business Units
1. **Hierarquia**: Organização → Business Units → Canais + Boards
2. **Sem legado**: Sistema é novo, não há migração de dados existentes
3. **Relação 1:N**: Board pertence a exatamente uma Business Unit
4. **Acesso por role**: Admin vê todas units, vendedor vê apenas units onde é membro
5. **Múltiplos canais**: Cada Business Unit pode ter múltiplos canais do mesmo tipo (ex: 2 WhatsApps)
6. **Contatos globais**: Contatos pertencem à org, podem ter conversas em qualquer unit
7. **Slug obrigatório**: Cada unit tem key único (ex: 'comunidade', 'mentoria')

---

## Scope Boundaries

### Incluído no MVP
- ✅ **Business Units** para agrupar canais, boards e configurações
- ✅ WhatsApp como primeiro canal
- ✅ Provedor não-oficial (Z-API) para setup rápido
- ✅ Inbox unificado com lista de conversas
- ✅ Filtro por Business Unit no inbox
- ✅ Envio e recebimento de mensagens de texto
- ✅ Envio e recebimento de imagens e documentos
- ✅ Status de entrega (sent/delivered/read)
- ✅ Vinculação automática com contatos por telefone
- ✅ Vinculação manual com deals (filtrado por Business Unit)
- ✅ Filtros básicos (canal, não lidas)
- ✅ Atribuição de conversas

### Não Incluído no MVP (Fases Futuras)
- ❌ Meta Cloud API (provedor oficial) - Fase 2
- ❌ Instagram como canal - Fase 2
- ❌ Templates WhatsApp pré-aprovados - Fase 2
- ❌ Email como canal - Fase 3
- ❌ SMS como canal - Fase 3
- ❌ **Agente de IA com instruções dinâmicas por stage** - Fase 4 (ver documentação abaixo)
- ❌ Chatbot / Auto-respostas - Fase 4
- ❌ Sugestões de resposta com IA - Fase 4
- ❌ Workflows de automação - Fase 5
- ❌ Análise de sentimento - Fase 5
- ❌ **Analytics & Reports** - Fase 6 (baseado em benchmark de mercado)
- ❌ **Bulk Messaging / Broadcast** - Fase 6
- ❌ **CSAT / Customer Feedback** - Fase 6
- ❌ **WhatsApp Flows (carrosséis, botões)** - Fase 6

---

## Configurações Admin (Documentação de Design)

### Hierarquia de Navegação

```
Settings (existente)
└── Business Units (NOVO)
    ├── Lista de Units
    │   ├── [+ Criar Business Unit]
    │   └── [Unit Card] → Clica abre config
    │
    └── Config da Unit (página dedicada)
        ├── Geral
        │   ├── Nome, Key (slug), Descrição
        │   ├── Board padrão (para deals automáticos)
        │   └── [x] Criar deal automaticamente
        │
        ├── Canais
        │   ├── Lista de canais conectados
        │   ├── [+ Adicionar Canal]
        │   │   └── Wizard por provedor
        │   └── Status de cada canal
        │
        ├── Membros
        │   ├── Lista de usuários com acesso
        │   └── [+ Adicionar Membro]
        │
        ├── Boards
        │   ├── Lista de boards da unit
        │   └── [+ Criar Board] ou [Vincular existente]
        │
        └── Snippets
            ├── Lista de respostas rápidas
            └── [+ Criar Snippet]
```

### Wizard de Configuração de Canal

#### Z-API (Não-oficial)
```
Passo 1: Provedor
┌─────────────────────────────────────────┐
│  Escolha o provedor WhatsApp:           │
│                                         │
│  [●] Z-API (Rápido, sem verificação)    │
│  [ ] Meta Cloud API (Oficial)           │
│                                         │
│                        [Próximo →]      │
└─────────────────────────────────────────┘

Passo 2: Credenciais Z-API
┌─────────────────────────────────────────┐
│  Insira suas credenciais Z-API:         │
│                                         │
│  Instance ID: [________________]        │
│  Token:       [________________]        │
│  Client Token:[________________]        │
│                                         │
│  [← Voltar]            [Próximo →]      │
└─────────────────────────────────────────┘

Passo 3: QR Code
┌─────────────────────────────────────────┐
│  Escaneie o QR Code com seu WhatsApp:   │
│                                         │
│       ┌─────────────────┐               │
│       │  ▓▓▓▓▓▓▓▓▓▓▓▓▓  │               │
│       │  ▓▓▓▓▓▓▓▓▓▓▓▓▓  │               │
│       │  ▓▓▓▓▓▓▓▓▓▓▓▓▓  │  ← QR Code    │
│       │  ▓▓▓▓▓▓▓▓▓▓▓▓▓  │               │
│       └─────────────────┘               │
│                                         │
│  Expira em: 20 segundos [🔄 Atualizar]  │
│                                         │
│  [← Voltar]      [Aguardando conexão...] │
└─────────────────────────────────────────┘

Passo 4: Sucesso
┌─────────────────────────────────────────┐
│  ✅ Canal conectado com sucesso!        │
│                                         │
│  Número: +55 11 99999-0001              │
│  Status: Conectado                      │
│                                         │
│                          [Concluir]     │
└─────────────────────────────────────────┘
```

#### Meta Cloud API (Oficial)
```
Passo 1: Provedor
[Mesmo do Z-API, seleciona Meta Cloud API]

Passo 2: Requisitos
┌─────────────────────────────────────────┐
│  Requisitos para Meta Cloud API:        │
│                                         │
│  [ ] Conta Meta Business verificada     │
│  [ ] App criado no Meta for Developers  │
│  [ ] WhatsApp Business API habilitada   │
│                                         │
│  📖 Guia de configuração                │
│                                         │
│  [← Voltar]            [Próximo →]      │
└─────────────────────────────────────────┘

Passo 3: Credenciais Meta
┌─────────────────────────────────────────┐
│  Credenciais do Meta Business:          │
│                                         │
│  Phone Number ID:   [________________]  │
│  Access Token:      [________________]  │
│  App Secret:        [________________]  │
│  Webhook Verify:    [________________]  │
│                                         │
│  [← Voltar]            [Conectar →]     │
└─────────────────────────────────────────┘

Passo 4: Webhook
┌─────────────────────────────────────────┐
│  Configure o webhook no Meta:           │
│                                         │
│  URL: https://api.nossocrm.com/webhook  │
│  Verify Token: abc123xyz                │
│                                         │
│  [📋 Copiar URL]                        │
│                                         │
│  [← Voltar]            [Verificar →]    │
└─────────────────────────────────────────┘

Passo 5: Sucesso
[Mesmo do Z-API]
```

### Gerenciamento de Snippets

```
Criar/Editar Snippet
┌─────────────────────────────────────────┐
│  Resposta Rápida                        │
│                                         │
│  Comando: /[saudacao____________]       │
│                                         │
│  Conteúdo:                              │
│  ┌─────────────────────────────────────┐│
│  │Olá {nome}! 👋                       ││
│  │                                     ││
│  │Obrigado por entrar em contato.      ││
│  │Como posso ajudar?                   ││
│  └─────────────────────────────────────┘│
│                                         │
│  Variáveis disponíveis:                 │
│  {nome} {empresa} {email} {telefone}    │
│                                         │
│  [Cancelar]              [Salvar]       │
└─────────────────────────────────────────┘
```

---

## UI/UX do Inbox (Documentação de Design)

### Layout Principal (3 Colunas)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Logo] NossoCRM    [🔔 3]    [Avatar ▼]                               │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌───────────────────────────┐ ┌───────────────────┐ │
│ │  COLUNA 1      │ │  COLUNA 2                 │ │  COLUNA 3         │ │
│ │  Lista Conv.   │ │  Thread de Mensagens      │ │  Painel Contato   │ │
│ │                │ │                           │ │                   │ │
│ │ ┌────────────┐ │ │ ┌─────────────────────┐   │ │ ┌───────────────┐ │ │
│ │ │[▼ Unit]    │ │ │ │ João Silva          │   │ │ │ [Avatar]      │ │ │
│ │ └────────────┘ │ │ │ WhatsApp • Online   │   │ │ │ João Silva    │ │ │
│ │ ┌────────────┐ │ │ └─────────────────────┘   │ │ │ Empresa ABC   │ │ │
│ │ │🔍 Buscar   │ │ │                           │ │ │ +55 11 9999   │ │ │
│ │ └────────────┘ │ │ ┌─────────────────────┐   │ │ └───────────────┘ │ │
│ │                │ │ │ Olá, preciso de     │   │ │                   │ │
│ │ [Filtros ▼]    │ │ │ ajuda com...        │←──│ │ [Mensagens|Ativ.]│ │
│ │                │ │ └─────────────────────┘   │ │                   │ │
│ │ ┌────────────┐ │ │                           │ │ Deals Vinculados: │ │
│ │ │[WA] João   │ │ │ ┌─────────────────────┐   │ │ • Proposta #123   │ │
│ │ │Olá, preci..│ │ │ │      Claro! Vou te  │   │ │ • Renovação #456  │ │
│ │ │14:32 • 2   │ │ │ │      ajudar com... │──→│ │                   │ │
│ │ └────────────┘ │ │ └─────────────────────┘   │ │ [+ Criar Deal]    │ │
│ │ ┌────────────┐ │ │                           │ │                   │ │
│ │ │[WA] Maria  │ │ │ ┌─────────────────────┐   │ │ Últimas Ativid.:  │ │
│ │ │Bom dia!    │ │ │ │ [📎] [😊] [/snippet]│   │ │ • Call 02/01      │ │
│ │ │10:15       │ │ │ │ Digite mensagem...  │   │ │ • Email 01/01     │ │
│ │ └────────────┘ │ │ │              [Enviar]│   │ │                   │ │
│ │                │ │ └─────────────────────┘   │ │                   │ │
│ └────────────────┘ └───────────────────────────┘ └───────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Componentes Principais

| Componente | Descrição |
|------------|-----------|
| **Unit Dropdown** | Seletor de Business Unit no topo da coluna 1 |
| **Lista de Conversas** | Cards com avatar + ícone canal, nome, preview, timestamp, badge não lidas |
| **Filtros** | Canal, status (aberta/resolvida), não lidas, atribuição |
| **Thread** | Bolhas de mensagem com status (✓ enviado, ✓✓ entregue, ✓✓ azul lido) |
| **Painel Contato** | Abas: Mensagens / Atividades, dados do contato, deals vinculados |
| **Input** | Anexo, emoji, /snippets, formatação, Enter=enviar |

### Notificações

| Tipo | Comportamento | Configurável |
|------|---------------|--------------|
| **Badge** | Número no menu lateral "Inbox (3)" | ✅ |
| **Som** | Ding ao receber mensagem | ✅ |
| **Toast** | Popup no canto "Nova mensagem de João" | ✅ |
| **Push** | Notificação do browser (requer permissão) | ✅ |

### Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Enter` | Enviar mensagem |
| `Shift+Enter` | Quebra de linha |
| `Ctrl+B` | **Negrito** (formata WhatsApp) |
| `Ctrl+I` | *Itálico* (formata WhatsApp) |
| `Ctrl+K` | Inserir link |
| `/` | Abrir menu de snippets |
| `Esc` | Fechar modais/menus |

### Indicadores Visuais

| Indicador | Visual |
|-----------|--------|
| **Canal** | Ícone pequeno (WhatsApp verde, Instagram rosa) sobre avatar |
| **Não lida** | Card destacado (fundo azul claro) + badge numérico |
| **Janela 24h** | Badge amarelo "Expira em 2h" no header da conversa |
| **Digitando** | "João está digitando..." no header |
| **Online** | Bolinha verde no avatar (se disponível do provedor) |

---

## Arquitetura de Fluxo de Mensagens (Documentação Técnica)

### Recebimento de Mensagens (Inbound)

```
Provedor (Z-API/Meta)
       │
       ▼
┌──────────────────────┐
│  Edge Function       │ ← Webhook receiver
│  /messaging-webhook  │
│  - Valida assinatura │
│  - Responde 200 OK   │
│  - Salva em queue    │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Supabase Queues     │ ← pgmq (nativo)
│  messaging_inbound   │
│  - Evento bruto JSON │
│  - Retry automático  │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Worker Function     │ ← Processa fila
│  - Parse payload     │
│  - Match contato     │
│  - Cria/atualiza msg │
│  - Download mídia    │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Supabase Storage    │ ← Mídia
│  messaging/media/    │
│  - Bucket privado    │
│  - URL assinada      │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Supabase Realtime   │ ← Notifica UI
│  messaging_messages  │
│  - WebSocket         │
│  - Broadcast         │
└──────────────────────┘
```

### Envio de Mensagens (Outbound)

```
UI (MessageInput)
       │
       ▼
┌──────────────────────┐
│  API Route           │
│  POST /api/messages  │
│  - Valida conteúdo   │
│  - Salva msg pending │
│  - Adiciona na fila  │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Supabase Queues     │
│  messaging_outbound  │
│  - message_id        │
│  - Retry config      │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Worker Function     │
│  - Busca channel     │
│  - Chama provider    │
│  - Atualiza status   │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Provider API        │
│  Z-API / Meta Cloud  │
│  - Envia mensagem    │
│  - Retorna ID        │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Supabase Realtime   │
│  - Status: sent      │
│  - UI atualiza       │
└──────────────────────┘
```

### Atualização de Status (Delivery Receipts)

```
Provedor → Webhook → Queue → Worker → DB Update → Realtime → UI
           (async)            (sent → delivered → read)
```

### Tecnologias Utilizadas

| Componente | Tecnologia | Justificativa |
|------------|------------|---------------|
| Webhook receiver | Supabase Edge Function | Serverless, escala automática |
| Fila | Supabase Queues (pgmq) | Nativo, retry automático, DLQ |
| Worker | Supabase Edge Function | Processa jobs da fila |
| Storage mídia | Supabase Storage | Integrado, URLs assinadas |
| Real-time | Supabase Realtime | WebSocket nativo, já usado no CRM |
| Banco | PostgreSQL (Supabase) | RLS, triggers, consistência |

---

## Database Best Practices (Validado com Supabase Guidelines)

Baseado na análise das [Supabase Postgres Best Practices](https://supabase.com/docs/guides/database), as seguintes recomendações devem ser aplicadas:

### 1. Índices em Foreign Keys (CRÍTICO)

Postgres **NÃO** cria índices automaticamente em FKs. Sem eles, JOINs e CASCADE são lentos.

```sql
-- Todas as FKs do schema de messaging precisam de índice
CREATE INDEX idx_channels_business_unit ON messaging_channels(business_unit_id);
CREATE INDEX idx_channels_org ON messaging_channels(organization_id);
CREATE INDEX idx_conversations_channel ON messaging_conversations(channel_id);
CREATE INDEX idx_conversations_contact ON messaging_conversations(contact_id);
CREATE INDEX idx_conversations_deal ON messaging_conversations(deal_id);
CREATE INDEX idx_conversations_assigned ON messaging_conversations(assigned_user_id);
CREATE INDEX idx_messages_conversation ON messaging_messages(conversation_id);
CREATE INDEX idx_messages_reply ON messaging_messages(reply_to_message_id);
CREATE INDEX idx_webhook_events_channel ON messaging_webhook_events(channel_id);
CREATE INDEX idx_business_units_org ON business_units(organization_id);
CREATE INDEX idx_business_unit_members_unit ON business_unit_members(business_unit_id);
CREATE INDEX idx_business_unit_members_user ON business_unit_members(user_id);
```

### 2. RLS Otimizado (CRÍTICO)

Funções como `auth.uid()` são chamadas **por linha** se não forem wrappadas em SELECT.

```sql
-- ❌ ERRADO (chamado N vezes):
CREATE POLICY "..." USING (auth.uid() = user_id);

-- ✅ CORRETO (chamado 1 vez, cacheado):
CREATE POLICY "..." USING ((SELECT auth.uid()) = user_id);

-- Exemplo para messaging_conversations:
CREATE POLICY "Users can view org conversations"
  ON messaging_conversations FOR SELECT
  USING (
    organization_id = (
      SELECT organization_id
      FROM profiles
      WHERE id = (SELECT auth.uid())
    )
  );
```

### 3. GIN Index para JSONB (ALTO IMPACTO)

Campos JSONB sem índice GIN causam full table scan.

```sql
-- Índices GIN para campos JSONB
CREATE INDEX idx_messages_content_gin ON messaging_messages USING gin(content);
CREATE INDEX idx_messages_metadata_gin ON messaging_messages USING gin(metadata);
CREATE INDEX idx_channels_credentials_gin ON messaging_channels USING gin(credentials);
CREATE INDEX idx_channels_settings_gin ON messaging_channels USING gin(settings);
```

### 4. Composite Index para Queries Frequentes (ALTO IMPACTO)

Queries com múltiplas colunas no WHERE devem ter índice composto.

```sql
-- Lista de conversas por org + status + ordenação
CREATE INDEX idx_conversations_org_status_date
  ON messaging_conversations(organization_id, status, last_message_at DESC);

-- Lista de conversas por business unit + status
CREATE INDEX idx_conversations_unit_status_date
  ON messaging_conversations(business_unit_id, status, last_message_at DESC);

-- Mensagens por conversa ordenadas
CREATE INDEX idx_messages_conversation_date
  ON messaging_messages(conversation_id, created_at DESC);

-- Busca de canal por org + tipo + status
CREATE INDEX idx_channels_org_type_status
  ON messaging_channels(organization_id, channel_type, status);
```

### 5. Partial Index para Status (MÉDIO IMPACTO)

Índices parciais são menores e mais rápidos para queries filtradas.

```sql
-- Apenas conversas abertas (90% das queries)
CREATE INDEX idx_conversations_open
  ON messaging_conversations(last_message_at DESC)
  WHERE status = 'open';

-- Apenas webhooks não processados
CREATE INDEX idx_webhook_unprocessed
  ON messaging_webhook_events(created_at)
  WHERE processed = false;

-- Apenas canais conectados
CREATE INDEX idx_channels_connected
  ON messaging_channels(organization_id, channel_type)
  WHERE status = 'connected';
```

### 6. Cursor-Based Pagination (MÉDIO IMPACTO)

OFFSET fica lento em páginas profundas. Usar cursor com last_id/last_date.

```sql
-- ❌ ERRADO (lento em página 100):
SELECT * FROM messaging_messages
ORDER BY created_at DESC
LIMIT 20 OFFSET 1980;

-- ✅ CORRETO (sempre O(1)):
SELECT * FROM messaging_messages
WHERE conversation_id = $1
  AND (created_at, id) < ($last_date, $last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

### 7. Connection Pooling via Supabase

Supabase já oferece pooling via PgBouncer na porta 6543. O código deve:
- Usar `DATABASE_URL` que aponta para o pooler
- Não usar prepared statements named (apenas unnamed)
- Configurar `idle_timeout` no cliente

### 8. Tabela de Business Units Otimizada

```sql
CREATE TABLE business_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  auto_create_deal BOOLEAN DEFAULT false,
  default_board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT business_units_org_key_unique UNIQUE (organization_id, key)
);

-- Índice na FK
CREATE INDEX idx_business_units_org ON business_units(organization_id);

-- RLS otimizado
ALTER TABLE business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_units FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users view their org units"
  ON business_units FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins manage units"
  ON business_units FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = business_units.organization_id
        AND role = 'admin'
    )
  );
```

### Checklist de Validação

| Item | Status |
|------|--------|
| Índices em todas as FKs | ⬜ Implementar |
| RLS com `(SELECT auth.uid())` | ⬜ Implementar |
| GIN em todos os JSONB | ⬜ Implementar |
| Composite index para queries principais | ⬜ Implementar |
| Partial index para status filtrados | ⬜ Implementar |
| Cursor pagination no frontend | ⬜ Implementar |
| Connection pooling via Supabase | ✅ Já disponível |

---

## Fase 4: Agente de IA com Instruções Dinâmicas (Documentação Técnica)

### Requisito de Negócio
O agente de IA deve ter **instruções diferentes por estágio do funil**, permitindo que o comportamento do bot se adapte conforme o lead avança no pipeline. O histórico completo da conversa deve ser preservado através de todos os estágios.

**Exemplo de uso:**
- **Prospecção**: "Qualifique o lead, pergunte orçamento, necessidade, timeline"
- **Negociação**: "Foque em objeções, ofereça demo, negocie preço"
- **Fechamento**: "Foque em contrato, onboarding, próximos passos"

### Solução Técnica

#### Arquitetura
```
Business Unit
├── AI Config Global (prompt base)
└── Boards
    └── Stages
        └── Stage AI Config (instruções específicas do stage)
            └── Thread (histórico preservado)
```

#### Implementação com OpenAI Assistants API / Vercel AI SDK

O NossoCRM já usa Vercel AI SDK. A solução usa o parâmetro `additional_instructions` que permite **instruções dinâmicas por execução** mantendo o histórico:

```typescript
// lib/messaging/ai/stage-aware-agent.ts
import { openai } from '@ai-sdk/openai';

interface StageContext {
  dealId: string;
  currentStage: string;
  stagePrompt: string;      // Instruções específicas do stage
  businessUnitPrompt: string; // Prompt base da Business Unit
  conversationHistory: Message[];
}

async function generateStageAwareResponse(
  userMessage: string,
  context: StageContext
) {
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: `
      ${context.businessUnitPrompt}

      --- CONTEXTO DO ESTÁGIO ATUAL ---
      Estágio: ${context.currentStage}
      ${context.stagePrompt}
    `,
    messages: [
      ...context.conversationHistory,
      { role: 'user', content: userMessage }
    ]
  });

  return text;
}
```

#### Modelo de Dados

```sql
-- Configuração de IA por Business Unit (prompt base)
CREATE TABLE business_unit_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id),
  base_prompt TEXT NOT NULL,           -- Instruções gerais da unit
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature FLOAT DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuração de IA por Stage (instruções específicas)
CREATE TABLE stage_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES stages(id),
  board_id UUID NOT NULL REFERENCES boards(id),
  stage_prompt TEXT NOT NULL,          -- Instruções específicas do stage
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_id)
);
```

#### Fluxo de Execução

1. **Mensagem recebida** → Sistema identifica deal vinculado
2. **Busca stage atual** → `deal.stage_id`
3. **Carrega prompts** →
   - `business_unit_ai_config.base_prompt` (contexto geral)
   - `stage_ai_config.stage_prompt` (instruções do stage)
4. **Monta contexto** → Combina prompts + histórico completo da conversa
5. **Gera resposta** → IA responde com comportamento apropriado ao stage
6. **Deal muda de stage** → Próxima resposta usa novo `stage_prompt`, histórico preservado

#### Benefícios da Solução

| Aspecto | Benefício |
|---------|-----------|
| **Histórico preservado** | Conversa inteira disponível para contexto |
| **Flexibilidade** | Admin configura prompts por stage via UI |
| **Consistência** | Prompt base da unit + customização por stage |
| **Economia** | Usa gpt-4o-mini por padrão (custo baixo) |
| **Extensível** | Pode adicionar ferramentas (RAG, busca) depois |

#### Referências
- [OpenAI Assistants API - Runs](https://platform.openai.com/docs/api-reference/runs) - Suporte a `additional_instructions`
- [Vercel AI SDK](https://sdk.vercel.ai/docs) - Integração existente no NossoCRM
- [Kommo Salesbot](https://www.kommo.com/support/crm/ai-power-up/) - Benchmark de ativação por stage

---

## Benchmark de Mercado (Validação 2026-02-05)

Análise comparativa com principais players do mercado para validar alinhamento da spec.

### Concorrentes Analisados

| Player | Tipo | Foco |
|--------|------|------|
| [HubSpot](https://www.hubspot.com/products/whatsapp-integration) | Enterprise CRM | Sales + Marketing |
| [Intercom](https://www.intercom.com/suite/helpdesk/omnichannel) | Support Platform | Customer Support |
| [Kommo](https://www.kommo.com/unified-inbox/) | Messenger CRM | WhatsApp-first Sales |
| [Pipedrive](https://support.pipedrive.com/en/article/pipedrive-integration-whatsapp-by-twilio) | Sales CRM | Pipeline Management |
| [Freshworks](https://www.freshworks.com/live-chat-software/integrations/whatsapp/) | Enterprise Suite | Omnichannel Support |
| [Chatwoot](https://github.com/chatwoot/chatwoot) | Open Source | Self-hosted Support |

### Matriz de Comparação

| Feature | HubSpot | Intercom | Kommo | Freshworks | Chatwoot | **NossoCRM** |
|---------|---------|----------|-------|------------|----------|--------------|
| Unified Inbox | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| WhatsApp nativo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-provider WhatsApp | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ ⭐ |
| Instagram DM | ❌ | ✅ | ✅ | ✅ | ✅ | 🔜 Fase 2 |
| Janela 24h visual | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Status entrega | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto-match contato | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vinculação deal | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Templates WhatsApp | ✅ | ✅ | ✅ | ✅ | ✅ | 🔜 Fase 2 |
| AI chatbot | ✅ | ✅ | ✅ | ✅ | ✅ | 🔜 Fase 4 |
| Workflows | ✅ | ✅ | ✅ | ✅ | ✅ | 🔜 Fase 5 |
| Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | 🔜 Fase 6 |
| **Business Units** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ ⭐⭐ |

### Diferenciais Competitivos

#### 1. Business Units (ÚNICO no mercado) ⭐⭐
Nenhum concorrente oferece segmentação por contexto de negócio. Permite:
- Múltiplos WhatsApps para diferentes produtos/serviços
- Boards/pipelines separados por contexto
- IA configurável por unit

#### 2. Multi-provider WhatsApp ⭐
Suporte a Z-API (não-oficial, setup rápido) + Meta Cloud API (oficial) no mesmo sistema.
Apenas Chatwoot e Kommo oferecem algo similar.

#### 3. CRM-first (vs Support-first)
Integração nativa com deals e pipeline, diferente de Intercom/Chatwoot que são support-focused.

### Gaps Identificados (Roadmap)

| Gap | Benchmark | Fase Planejada |
|-----|-----------|----------------|
| Analytics & Reports | Kommo oferece funnel reports, team productivity | Fase 6 |
| Bulk Messaging | Kommo oferece broadcast com 98% open rate | Fase 6 |
| CSAT/Feedback | Intercom captura CSAT no WhatsApp | Fase 6 |
| WhatsApp Flows | Kommo oferece carrosséis, botões, menus | Fase 6 |

### Conclusão

**Alinhamento: 85%** - Spec cobre features essenciais do mercado com diferenciais únicos (Business Units).
Gaps identificados estão planejados para fases futuras.

---

## Dependencies

### Dependências Internas (NossoCRM)
1. **Contatos**: Sistema de contatos existente para vinculação
2. **Deals**: Sistema de deals existente para associação
3. **Boards**: Sistema de boards existente para vincular a Business Units
4. **Autenticação**: Sistema de auth existente para controle de acesso
5. **Organizações**: Multi-tenancy existente para isolamento de dados
6. **Business Units**: Nova entidade a ser criada como parte deste MVP

### Dependências Externas
1. **Provedor de WhatsApp**: Conta ativa em provedor (Z-API ou similar)
2. **Número de WhatsApp**: Número de telefone dedicado para o negócio
3. **Endpoint HTTPS**: URL pública para receber webhooks

---

## Risks and Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Provedor não-oficial bloqueado | Média | Alto | Arquitetura permite trocar provedor facilmente |
| Alto volume de webhooks | Baixa | Médio | Processamento assíncrono com fila |
| Perda de mensagens | Baixa | Alto | Persistir webhook antes de processar, retry automático |
| Latência na entrega | Média | Médio | Otimização de queries, cache de conversas ativas |

---

## Edge Cases & Error Handling

### Concorrência
- **Múltiplos usuários na mesma conversa**: Sistema permite que múltiplos usuários visualizem e respondam a mesma conversa simultaneamente, exibindo indicadores de presença ("Fulano está visualizando", "Fulano está digitando")
- **Mensagens simultâneas**: Se dois usuários enviarem mensagens ao mesmo tempo, ambas são entregues na ordem de chegada ao servidor

### Falhas de Conexão
- **Webhook falha**: Sistema persiste evento antes de processar; retry automático até sucesso
- **Canal desconecta**: Sistema tenta reconexão automática; exibe status "Desconectado" após 2 minutos sem sucesso
- **Envio falha**: Mensagem marcada como "Falhou" com opção de reenvio manual

### Estados Vazios
- **Inbox vazio**: Exibir estado vazio com call-to-action para configurar canal ou iniciar conversa
- **Conversa sem mensagens**: Estado não deveria existir (conversa criada apenas quando há mensagem)
- **Contato sem telefone**: Não é possível vincular a conversas WhatsApp

---

## Clarifications

### Session 2026-02-05
- Q: Quando uma nova mensagem chega e o contato NÃO existe no CRM, qual ação o sistema deve tomar? → A: Criar contato automaticamente com nome/telefone do WhatsApp
- Q: Quem pode visualizar conversas no inbox unificado? → A: Todos os usuários veem todas as conversas da organização
- Q: Se dois vendedores abrirem a mesma conversa simultaneamente, como o sistema deve se comportar? → A: Permitir ambos mas mostrar indicador "Fulano está digitando/visualizando"
- Q: Como associar diferentes números WhatsApp a diferentes contextos (pipelines/agentes de IA)? → A: Introduzir conceito de **Business Units** que agrupam canais, boards e configurações de IA
- Q: Business Units devem fazer parte do MVP? → A: Sim, incluir no MVP pois é essencial para o caso de uso de múltiplos contextos de negócio (Comunidade, Mentoria, Onboarding)
- Q: Quando um contato existe em MÚLTIPLAS Business Units, como tratar? → A: Contato único pode ter múltiplas conversas em diferentes Business Units (cada conversa herda a unit do canal)
- Q: Como armazenar credenciais de provedores (API keys, tokens)? → A: Criptografado no banco com chave gerenciada (Supabase Vault ou AES-256)
- Q: Para canais compartilhados (ex: Instagram), como rotear para Business Units? → A: Inbox central + transferência manual - conversas entram sem unit definida; vendedor transfere para a unit correta
- Q: Limite de retry quando webhook falha? → A: 5 tentativas com backoff exponencial (~5 min total), depois marca como erro
- Q: Vendedor pode deletar mensagens enviadas? → A: Sim, delete real (recall) - tenta deletar no provedor se API suportar (WhatsApp permite em 1h)
- Q: Agente de IA com instruções dinâmicas por stage é viável? → A: Sim, usando OpenAI `additional_instructions` por run. Documentado para Fase 4, histórico preservado através dos stages.
- Q: Business Unit deve ter slug único (key)? → A: Sim, business_units.key obrigatório e único por org (ex: 'comunidade', 'mentoria')
- Q: Dados legados precisam de migração? → A: Não, sistema é novo - sem dados existentes para migrar
- Q: Board pode pertencer a múltiplas Business Units? → A: Não, relação 1:N - board pertence a exatamente uma unit
- Q: Permissões de Business Unit? → A: Acesso por role - Admin vê tudo, vendedor vê units onde foi adicionado
- Q: Contatos são globais ou por unit? → A: Contato global (pertence à org), pode ter conversas/deals em qualquer unit
- Q: Processamento de webhooks? → A: Assíncrono com fila - webhook responde 200 OK imediato, processa via Supabase Queues
- Q: Padrão de envio de mensagens? → A: Fila de envio - UI adiciona na fila, worker processa, status atualiza via real-time
- Q: Tecnologia de fila? → A: Supabase Queues (pgmq nativo)
- Q: Entrega real-time para inbox? → A: Supabase Realtime (subscribe nas tabelas messaging_*, WebSocket)
- Q: Armazenamento de mídia? → A: Supabase Storage (bucket privado, URL assinada)
- Q: Criar deal automaticamente? → A: Configurável por Business Unit (admin define se ativa ou não)
- Q: Qual board para deal automático? → A: Board padrão da unit (admin define na config da Business Unit)
- Q: Conversa vinculada a múltiplos deals? → A: Sim, relação 1:N (conversa pode ter vários deals, ex: renovações)
- Q: Atividades do CRM na conversa? → A: Aba separada - conversa tem 'Mensagens' e 'Atividades'
- Q: Dados do contato na conversa? → A: Painel lateral completo (nome, empresa, telefone, deals, atividades)
- Q: Layout principal do Inbox? → A: 3 colunas fixas (lista conversas | thread mensagens | painel contato)
- Q: Notificações de nova mensagem? → A: Completo (badge + som + toast + push) com opção de desabilitar cada item
- Q: Seleção de Business Unit? → A: Dropdown no topo do inbox
- Q: Indicador de canal? → A: Ícone pequeno sobre o avatar do contato
- Q: Atalhos de teclado? → A: Completo + snippets (/comando para respostas rápidas pré-definidas)
- Q: Onde ficam config de Messaging? → A: Dentro de cada Business Unit (não em Settings global)
- Q: Onde gerenciar Business Units? → A: Settings > Business Units (criar/editar units)
- Q: Snippets são globais ou por unit? → A: Por Business Unit (cada unit tem seus próprios snippets)
- Q: Quem pode criar snippets? → A: Qualquer membro com acesso à unit
- Q: Fluxo de setup de canal? → A: Wizard guiado (diferente por provedor: Z-API=QR Code, Meta=credenciais/token)
- Q: Analytics deve estar no MVP? → A: Não, mover para Fase 6 como melhoria baseada em benchmark de mercado
- Q: Benchmark de mercado validado? → A: Sim, 85% alinhado. Diferenciais: Business Units (único), Multi-provider WhatsApp. Gaps planejados para Fase 6.
- Q: Qual o propósito da "Business Unit Padrão"? → A: Criada automaticamente na primeira org que usa messaging - serve como fallback para conversas de canais não configurados ou cenários edge
- Q: Quais status de conversa no MVP? → A: Apenas `open` e `resolved`. Estados `pending` e `snoozed` são pós-MVP.

---

## Messaging Design Tokens (Extensão do Design System)

O NossoCRM já possui um Design System maduro (globals.css). Esta seção define tokens **específicos para Messaging** que estendem o sistema existente.

### 1. Channel Colors

```css
/* globals.css ou messaging.module.css */
:root {
  /* Channel Brand Colors */
  --channel-whatsapp: #25D366;
  --channel-whatsapp-dark: #128C7E;
  --channel-instagram: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
  --channel-instagram-solid: #E4405F;
  --channel-email: #EA4335;
  --channel-sms: #5E35B1;
  --channel-telegram: #0088CC;

  /* Channel Background (10% opacity for badges/tags) */
  --channel-whatsapp-bg: oklch(70% 0.15 155 / 0.1);
  --channel-instagram-bg: oklch(65% 0.20 350 / 0.1);
  --channel-email-bg: oklch(62% 0.22 25 / 0.1);
}
```

### 2. Message Bubble Styles

```css
:root {
  /* Inbound (from customer) */
  --bubble-inbound-bg: var(--color-surface);
  --bubble-inbound-border: var(--color-border);
  --bubble-inbound-text: var(--color-text-primary);

  /* Outbound (from agent) */
  --bubble-outbound-bg: var(--color-primary-500);
  --bubble-outbound-text: white;

  /* Bubble Shape */
  --bubble-radius: 16px;
  --bubble-radius-tail: 4px;  /* Canto com "rabinho" */
  --bubble-padding: 12px 16px;
  --bubble-max-width: 70%;

  /* Bubble Spacing */
  --bubble-gap: 4px;          /* Entre bolhas do mesmo sender */
  --bubble-group-gap: 16px;   /* Entre grupos de senders diferentes */
}

.dark {
  --bubble-inbound-bg: var(--color-muted);
  --bubble-outbound-bg: var(--color-primary-600);
}
```

### 3. Message Status Indicators

```css
:root {
  /* Checkmark Colors */
  --status-pending: var(--color-text-muted);
  --status-sent: var(--color-text-secondary);
  --status-delivered: var(--color-text-secondary);
  --status-read: #53BDEB;  /* WhatsApp blue */
  --status-failed: var(--color-error);
}
```

**Visual dos Status:**
| Status | Ícone | Cor |
|--------|-------|-----|
| pending | `Clock` | muted |
| sent | `Check` | secondary |
| delivered | `CheckCheck` | secondary |
| read | `CheckCheck` | #53BDEB (azul WhatsApp) |
| failed | `AlertCircle` | error |

### 4. Typing & Activity Indicators

```css
/* Typing indicator animation */
@keyframes typing-dot {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-4px); }
}

.typing-indicator span {
  animation: typing-dot 1.4s infinite;
  animation-delay: calc(var(--dot-index) * 0.2s);
}

/* Unread pulse */
@keyframes unread-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.unread-badge {
  animation: unread-pulse 2s ease-in-out infinite;
}

/* Online presence */
.presence-online {
  background: var(--color-success);
  box-shadow: 0 0 0 2px var(--color-surface);
}
```

### 5. Conversation List Item

```css
:root {
  /* List Item States */
  --conv-item-height: 72px;
  --conv-item-padding: 12px 16px;
  --conv-item-hover: var(--color-muted);
  --conv-item-selected: var(--color-primary-500 / 0.1);
  --conv-item-unread-bg: var(--color-primary-500 / 0.05);

  /* Avatar with Channel Badge */
  --avatar-size: 48px;
  --channel-badge-size: 18px;
  --channel-badge-offset: -2px;
}
```

### 6. Window Expiry Badge (24h WhatsApp)

```css
:root {
  /* Expiry States */
  --window-safe: var(--color-success);      /* > 4h */
  --window-warning: var(--color-warning);   /* 1-4h */
  --window-critical: var(--color-error);    /* < 1h */
  --window-expired: var(--color-text-muted); /* expirado */
}
```

### 7. Empty States

Usar ilustrações SVG minimalistas consistentes com o design system:

| Estado | Ilustração | Mensagem |
|--------|------------|----------|
| **Inbox vazio** | Caixa de entrada vazia | "Nenhuma conversa ainda. Configure um canal para começar." |
| **Sem resultados** | Lupa com X | "Nenhuma conversa encontrada para este filtro." |
| **Canal desconectado** | Plug desconectado | "Canal desconectado. Clique para reconectar." |
| **Conversa selecionada** | Chat bubbles | "Selecione uma conversa para visualizar." |

### 8. Skeleton Styles

Usar a classe existente com cores do design system:

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-muted) 25%,
    var(--color-surface) 50%,
    var(--color-muted) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Checklist de Design Tokens

| Token | Prioridade | Status |
|-------|------------|--------|
| Channel colors (5 canais) | ALTO | ⬜ |
| Bubble styles (inbound/outbound) | ALTO | ⬜ |
| Status indicators | ALTO | ⬜ |
| Typing animation | MÉDIO | ⬜ |
| Unread pulse | MÉDIO | ⬜ |
| Presence indicator | MÉDIO | ⬜ |
| Window expiry badge | MÉDIO | ⬜ |
| Skeleton styles | BAIXO | ⬜ |
| Empty state illustrations | BAIXO | ⬜ |

---

## React/Next.js Best Practices (Validado com Vercel Guidelines)

Baseado na análise das [React Performance Guidelines](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast), as seguintes recomendações devem ser aplicadas:

### 1. Parallel Data Fetching (CRÍTICO)

Evitar waterfalls é a prioridade #1. Cada `await` sequencial adiciona latência de rede completa.

```typescript
// ❌ ERRADO - Waterfall (3x latência):
const conversations = await fetchConversations();
const unreadCount = await fetchUnreadCount();
const channels = await fetchChannels();

// ✅ CORRETO - Paralelo (1x latência):
const [conversations, unreadCount, channels] = await Promise.all([
  fetchConversations(),
  fetchUnreadCount(),
  fetchChannels()
]);
```

**Aplicação no Inbox:**
- Load inicial: conversas + unread count + channels em paralelo
- Abrir conversa: messages + contact + deals em paralelo
- Filtrar: não refetch tudo, usar cache local

### 2. Dynamic Imports para Componentes Pesados (CRÍTICO)

Componentes pesados devem ser carregados apenas quando necessários.

```typescript
// features/messaging/components/MessageInput.tsx

// EmojiPicker (~50KB) - carregar apenas ao clicar
const EmojiPicker = dynamic(
  () => import('@emoji-mart/react'),
  {
    loading: () => <IconButton disabled><Smile /></IconButton>,
    ssr: false
  }
);

// MediaViewer (~30KB) - carregar apenas ao abrir mídia
const MediaViewer = dynamic(
  () => import('./MediaViewer'),
  { ssr: false }
);

// FileUploader - carregar apenas ao anexar
const FileUploader = dynamic(
  () => import('./FileUploader'),
  { ssr: false }
);
```

### 3. Suspense Boundaries Estratégicos (ALTO IMPACTO)

Usar Suspense para streaming progressivo da UI - mostrar layout enquanto dados carregam.

```tsx
// features/messaging/MessagingPage.tsx

export default function MessagingPage() {
  return (
    <div className="grid grid-cols-[300px_1fr_350px] h-screen">
      {/* Coluna 1 - Lista de Conversas */}
      <Suspense fallback={<ConversationListSkeleton />}>
        <ConversationList />
      </Suspense>

      {/* Coluna 2 - Thread de Mensagens */}
      <Suspense fallback={<MessageThreadSkeleton />}>
        <MessageThread />
      </Suspense>

      {/* Coluna 3 - Painel do Contato */}
      <Suspense fallback={<ContactPanelSkeleton />}>
        <ContactPanel />
      </Suspense>
    </div>
  );
}
```

**Skeletons necessários:**
- `ConversationListSkeleton` - 5-8 cards com pulse animation
- `MessageThreadSkeleton` - Header + 3-4 bolhas + input
- `ContactPanelSkeleton` - Avatar + fields com pulse

### 4. Virtualização para Listas Longas (ALTO IMPACTO)

Listas de mensagens podem ter centenas de itens. Usar virtualização para renderizar apenas itens visíveis.

```tsx
// Opção 1: CSS content-visibility (mais simples)
// styles/messaging.css
.message-list {
  content-visibility: auto;
  contain-intrinsic-size: 0 500px;
}

.conversation-list-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 72px;
}

// Opção 2: react-window (mais controle)
import { VariableSizeList } from 'react-window';

const MessageList = ({ messages }) => {
  const getItemSize = (index) => {
    const msg = messages[index];
    // Estimar altura baseado no conteúdo
    return msg.content_type === 'text'
      ? Math.ceil(msg.content.text.length / 50) * 24 + 40
      : 200; // mídia
  };

  return (
    <VariableSizeList
      height={600}
      itemCount={messages.length}
      itemSize={getItemSize}
      overscanCount={5}
    >
      {({ index, style }) => (
        <MessageBubble style={style} message={messages[index]} />
      )}
    </VariableSizeList>
  );
};
```

### 5. Memoização para Realtime Updates (MÉDIO IMPACTO)

Realtime pode disparar muitos re-renders. Memoizar componentes e callbacks.

```tsx
// features/messaging/components/ConversationItem.tsx

// memo com comparação customizada
export const ConversationItem = memo(
  ({ conversation, isSelected, onSelect }) => {
    // ... render
  },
  (prev, next) =>
    prev.conversation.id === next.conversation.id &&
    prev.conversation.last_message_at === next.conversation.last_message_at &&
    prev.conversation.unread_count === next.conversation.unread_count &&
    prev.isSelected === next.isSelected
);

// Callbacks estáveis no parent
const ConversationList = () => {
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleMarkRead = useCallback((id: string) => {
    markAsRead(id);
  }, [markAsRead]);

  return conversations.map(conv => (
    <ConversationItem
      key={conv.id}
      conversation={conv}
      onSelect={handleSelect}
      onMarkRead={handleMarkRead}
    />
  ));
};
```

### 6. Direct Imports (MÉDIO IMPACTO)

Evitar barrel imports que carregam bibliotecas inteiras.

```typescript
// ❌ ERRADO - Carrega toda biblioteca lucide (~200KB)
import { MessageCircle, Send, Paperclip, Smile, Image } from 'lucide-react';

// ✅ CORRETO - Carrega apenas ícones usados (~2KB cada)
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';
import Send from 'lucide-react/dist/esm/icons/send';
import Paperclip from 'lucide-react/dist/esm/icons/paperclip';
import Smile from 'lucide-react/dist/esm/icons/smile';
import ImageIcon from 'lucide-react/dist/esm/icons/image';

// Alternativa: usar @lucide/lab ou criar arquivo de re-exports otimizado
// lib/icons.ts
export { default as MessageCircle } from 'lucide-react/dist/esm/icons/message-circle';
export { default as Send } from 'lucide-react/dist/esm/icons/send';
// ...
```

### 7. SWR/React Query Otimizado (MÉDIO IMPACTO)

Configurar staleTime e cacheTime apropriados para evitar refetches desnecessários.

```typescript
// lib/query/hooks/useConversationsQuery.ts

export function useConversationsQuery(filters: ConversationFilters) {
  return useQuery({
    queryKey: queryKeys.messaging.conversations(filters),
    queryFn: () => fetchConversations(filters),
    staleTime: 1000 * 30,      // 30s - dados "frescos" por 30s
    gcTime: 1000 * 60 * 5,     // 5min - manter em cache por 5min
    refetchOnWindowFocus: false, // Realtime já atualiza
    refetchOnMount: false,       // Usar cache se disponível
  });
}

// Para mensagens - cache mais longo (históricas não mudam)
export function useMessagesQuery(conversationId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messaging.messages(conversationId),
    queryFn: ({ pageParam }) => fetchMessages(conversationId, pageParam),
    staleTime: 1000 * 60 * 5,   // 5min - mensagens antigas não mudam
    gcTime: 1000 * 60 * 30,     // 30min - manter histórico em cache
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
```

### Checklist de Implementação React

| Item | Prioridade | Status |
|------|------------|--------|
| Promise.all() no data fetching inicial | CRÍTICO | ⬜ Implementar |
| Dynamic import EmojiPicker | CRÍTICO | ⬜ Implementar |
| Dynamic import MediaViewer | CRÍTICO | ⬜ Implementar |
| Dynamic import FileUploader | CRÍTICO | ⬜ Implementar |
| Suspense boundary MessagingPage | ALTO | ⬜ Implementar |
| Skeleton components (3 tipos) | ALTO | ⬜ Implementar |
| content-visibility CSS | ALTO | ⬜ Implementar |
| memo() em ConversationItem | MÉDIO | ⬜ Implementar |
| memo() em MessageBubble | MÉDIO | ⬜ Implementar |
| useCallback para handlers | MÉDIO | ⬜ Implementar |
| Direct imports lucide icons | MÉDIO | ⬜ Implementar |
| SWR staleTime otimizado | MÉDIO | ⬜ Implementar |
| react-window para message list (se >100 msgs) | BAIXO | ⬜ Avaliar |

---

## Out of Scope Clarifications

1. **Ligações de voz**: Este sistema é exclusivamente para mensagens de texto/mídia
2. **Videochamadas**: Não suportadas neste módulo
3. **Chatbots externos**: Integração com bots de terceiros não está no escopo
4. **CRM externo**: Sincronização com outros CRMs não é suportada
5. **IA/Bot por canal**: Configuração de IA está planejada mas não implementada no MVP (estrutura preparada)

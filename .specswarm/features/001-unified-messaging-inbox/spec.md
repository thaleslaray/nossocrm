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
- **FR-0.4**: Sistema cria uma "Business Unit Padrão" para dados legados/não categorizados
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

### FR-4: Inbox Unificado
- **FR-4.1**: Sistema exibe lista de todas as conversas ordenadas por última mensagem
- **FR-4.2**: Cada conversa exibe: nome do contato, canal, Business Unit, preview da última mensagem, timestamp
- **FR-4.3**: Conversas com mensagens não lidas são destacadas visualmente
- **FR-4.4**: Sistema permite filtrar por: Business Unit, canal, status (aberta/resolvida), não lidas
- **FR-4.5**: Sistema permite buscar conversas por nome ou conteúdo
- **FR-4.6**: Todos os usuários da organização podem visualizar todas as conversas (sem restrição por atribuição)
- **FR-4.7**: Sistema exibe indicador de presença quando outro usuário está visualizando/digitando na mesma conversa
- **FR-4.8**: Seletor de Business Unit permite alternar rapidamente entre contextos

### FR-5: Vinculação com CRM
- **FR-5.1**: Sistema vincula automaticamente conversas a contatos existentes por telefone
- **FR-5.2**: Se contato não existir, sistema cria automaticamente novo contato com nome e telefone do WhatsApp
- **FR-5.3**: Usuário pode vincular manualmente conversa a um contato diferente
- **FR-5.4**: Usuário pode vincular conversa a um deal existente
- **FR-5.5**: Ao abrir conversa, sistema exibe informações do contato/deal vinculado
- **FR-5.6**: Ao criar deal a partir da conversa, sistema exibe apenas boards da Business Unit do canal
- **FR-5.7**: Deal criado a partir da conversa herda a Business Unit automaticamente

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
- Cada Business Unit pode ter:
  - Múltiplos canais de comunicação (WhatsApp, Instagram)
  - Múltiplos boards/pipelines (jornada do cliente dentro da unit)
  - Configuração de IA/Bot própria
  - Membros específicos com acesso (opcional)
- Uma organização pode ter múltiplas Business Units
- Boards existentes podem ser migrados para uma "Unit Padrão"

### Conversation (Conversa)
- Representa uma thread de mensagens com um contato externo
- Vinculada a: Canal, Business Unit, Contato, Deal (opcional), Usuário atribuído (opcional)
- Estados: Aberta, Pendente, Resolvida, Adiada

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
2. **Herança**: Boards existentes migram para uma "Business Unit Padrão" automaticamente
3. **Isolamento visual**: Usuário seleciona Business Unit e vê apenas dados daquela unit
4. **Flexibilidade de acesso**: Por padrão, todos usuários acessam todas units; restrição é opcional
5. **Múltiplos canais**: Cada Business Unit pode ter múltiplos canais do mesmo tipo (ex: 2 WhatsApps)

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
- ❌ Chatbot / Auto-respostas - Fase 4
- ❌ Sugestões de resposta com IA - Fase 4
- ❌ Workflows de automação - Fase 5
- ❌ Análise de sentimento - Fase 5

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

---

## Out of Scope Clarifications

1. **Ligações de voz**: Este sistema é exclusivamente para mensagens de texto/mídia
2. **Videochamadas**: Não suportadas neste módulo
3. **Chatbots externos**: Integração com bots de terceiros não está no escopo
4. **CRM externo**: Sincronização com outros CRMs não é suportada
5. **IA/Bot por canal**: Configuração de IA está planejada mas não implementada no MVP (estrutura preparada)

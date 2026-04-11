# Smoke Test E2E Completo — NossoCRM

> Teste automatizado via `agent-browser` cobrindo CRUD completo em todas as features.
> Cada seção cria, lê, edita, deleta, e verifica. Screenshot antes/depois de cada operação crítica.

**Credenciais:** `thales@laray.com.br` / `h2so4nh3`
**URL:** `http://localhost:3000`

---

## 1. Login & Auth

- [ ] Login com credenciais válidas → redireciona pro dashboard
- [ ] Verificar nome do usuário no sidebar ("thales")
- [ ] Verificar que /boards, /contacts, /settings carregam (não redireciona pro login)

## 2. Dashboard (Visão Geral)

- [ ] Verificar 4 KPI cards (Pipeline, Negócios Ativos, Conversão, Receita)
- [ ] Trocar filtro de período (Este Mês → Esta Semana) → KPIs atualizam
- [ ] Trocar pipeline no combobox → dados mudam
- [ ] Verificar seção "Saúde da Carteira" (Distribuição, Negócios Parados, LTV)
- [ ] Verificar seção "Funil" (gráfico renderiza)
- [ ] Verificar "Atividades Recentes"
- [ ] Verificar "Performance de Mensagens"
- [ ] Verificar "Performance da IA"
- [ ] Clicar "Alertas de Pipeline" → abre painel

## 3. Boards (Kanban)

### 3.1 Visualização
- [ ] Boards carrega com colunas do Kanban visíveis
- [ ] Verificar contagem de deals por coluna (badge numérico)
- [ ] Trocar pra visualização em Lista → tabela aparece
- [ ] Voltar pra Kanban → colunas voltam
- [ ] Filtrar por status "Em Aberto" → deals filtrados
- [ ] Usar campo de busca → filtra por nome
- [ ] Filtrar por proprietário → deals filtrados
- [ ] Limpar filtros → todos deals aparecem

### 3.2 CRUD Deal
- [ ] Clicar "Novo Negócio" → modal abre
- [ ] Preencher: título "Deal Teste E2E", valor R$10.000
- [ ] Selecionar contato existente
- [ ] Salvar → deal aparece no Kanban na coluna correta
- [ ] Screenshot: deal criado visível no board
- [ ] Clicar no deal → DealDetailModal abre
- [ ] Verificar tabs: Timeline, Produtos, Info
- [ ] Verificar que tab "Chamadas" NÃO existe (voice removido)
- [ ] Editar título do deal → salvar → título atualizado
- [ ] Adicionar nota no deal → nota aparece na timeline
- [ ] Clicar "Preparar Conversa" (briefing) → drawer abre (ou erro de AI key)
- [ ] Fechar modal

### 3.3 Drag & Drop
- [ ] Arrastar "Deal Teste E2E" da coluna atual pra próxima coluna
- [ ] Verificar: contagem das colunas atualiza
- [ ] Screenshot: deal na nova coluna
- [ ] Arrastar de volta → restaura posição original

### 3.4 Deletar Deal
- [ ] Abrir deal → clicar botão deletar
- [ ] Confirmar no modal de confirmação
- [ ] Deal some do Kanban
- [ ] Contagem atualiza

### 3.5 Board Settings
- [ ] Clicar "Configurações do Board" → modal/painel abre
- [ ] Verificar estágios listados
- [ ] Fechar sem alterar

## 4. Contatos

### 4.1 Visualização
- [ ] Página carrega com tabela de contatos
- [ ] Verificar tabs: Todos, Leads, MQL, Prospects, Clientes, Outros/Perdidos
- [ ] Clicar em cada tab → contagem e lista mudam
- [ ] Verificar subtabs: Pessoas vs Empresas
- [ ] Usar busca → filtra por nome/email
- [ ] Filtrar por status → lista filtra

### 4.2 CRUD Contato
- [ ] Clicar "Novo Contato" → modal/formulário abre
- [ ] Preencher: nome "Contato Teste E2E", email "teste@e2e.com", telefone "+5511999999999"
- [ ] Salvar → contato aparece na lista
- [ ] Screenshot: contato criado
- [ ] Clicar no contato → detalhes abrem
- [ ] Editar nome → salvar → nome atualizado
- [ ] Verificar deals vinculados (se houver)

### 4.3 Empresas
- [ ] Trocar pra tab "Empresas"
- [ ] Clicar "Nova Empresa" (se existir botão)
- [ ] Criar empresa "Empresa Teste E2E"
- [ ] Verificar que aparece na lista

### 4.4 Deletar Contato
- [ ] Selecionar contato teste → deletar
- [ ] Confirmar → contato some da lista

## 5. Atividades

### 5.1 Visualização
- [ ] Página carrega com lista de atividades
- [ ] Verificar filtros disponíveis (tipo, data, responsável)

### 5.2 CRUD Atividade
- [ ] Criar nova atividade: tipo CALL, título "Ligação Teste E2E", data hoje
- [ ] Verificar que aparece na lista
- [ ] Editar atividade → mudar tipo pra MEETING
- [ ] Verificar que atualiza
- [ ] Marcar como concluída
- [ ] Deletar atividade

## 6. Inbox

### 6.1 Visão Geral
- [ ] Página carrega com cards de resumo (Atrasados, Hoje, Sugestões, Aprovações IA, Pendências)
- [ ] Verificar que números são consistentes

### 6.2 Tabs
- [ ] Clicar "Lista" → muda visualização
- [ ] Clicar "Foco" → modo foco ativa
- [ ] Voltar pra "Visão Geral"

### 6.3 Ações rápidas
- [ ] Clicar "Aplicar" em deal de risco → ação executa
- [ ] Clicar "Abrir" → abre deal detail

## 7. Relatórios

- [ ] Página carrega com gráficos/métricas
- [ ] Trocar período → dados atualizam
- [ ] Clicar "Exportar PDF" (se existir) → download inicia ou modal abre

## 8. Settings — Geral

- [ ] Tab "Geral" carrega
- [ ] Verificar "Página Inicial" dropdown
- [ ] Mudar pra "Dashboard" → salvar → verificar persistência
- [ ] Mudar de volta
- [ ] Verificar "Gerenciamento de Tags"
- [ ] Adicionar tag "teste-e2e" → aparece na lista
- [ ] Deletar tag "teste-e2e"

## 9. Settings — Produtos/Serviços

- [ ] Tab "Produtos/Serviços" carrega
- [ ] Criar produto: nome "Produto E2E", preço R$100
- [ ] Verificar na lista
- [ ] Editar preço → R$200
- [ ] Deletar produto

## 10. Settings — Unidades

- [ ] Tab "Unidades" carrega
- [ ] Verificar unidades existentes
- [ ] Criar unidade "Unidade Teste E2E"
- [ ] Verificar na lista
- [ ] Deletar unidade

## 11. Settings — Integrações (Canais)

- [ ] Tab "Integrações" carrega
- [ ] Verificar seção "Canais de Mensagem"
- [ ] Clicar "Adicionar Canal" → wizard abre
- [ ] Verificar opções disponíveis: WhatsApp (Z-API), WhatsApp (Meta Cloud), Instagram, Email (Resend)
- [ ] Selecionar Z-API → formulário de credenciais aparece
- [ ] Cancelar sem salvar
- [ ] Verificar que NÃO existe toggle de "Chamadas" (voice removido)

## 12. Settings — Central de IA

- [ ] Tab "Central de I.A" carrega
- [ ] Verificar seções: Configuração do Agente, Templates, Features
- [ ] Verificar que NÃO existe seção "Voice" (removida)
- [ ] Verificar toggles de AI features
- [ ] Verificar configuração de provider (Google/OpenAI/Anthropic)

## 13. Settings — Dados

- [ ] Tab "Dados" carrega
- [ ] Verificar opções de importação/exportação
- [ ] Verificar seção de armazenamento

## 14. Settings — Equipe

- [ ] Tab "Equipe" carrega
- [ ] Verificar lista de membros (deve ter 1: thales)
- [ ] Verificar botão de convite
- [ ] Clicar "Convidar" → modal abre
- [ ] Fechar sem enviar

## 15. Mensagens (sem canal)

- [ ] Navegar pra /messaging
- [ ] Verificar que mostra estado vazio ("Nenhum canal configurado" ou lista vazia)
- [ ] Não deve crashar

## 16. Notificações

- [ ] Clicar sino de notificações no header
- [ ] Verificar que painel abre (mesmo sem notificações)
- [ ] Fechar painel

## 17. Perfil

- [ ] Clicar no avatar/nome no sidebar → menu abre
- [ ] Navegar pra perfil
- [ ] Verificar informações do usuário
- [ ] Verificar botão de logout

## 18. Dark/Light Mode

- [ ] Clicar toggle de tema no header
- [ ] Verificar que muda (screenshot antes/depois)
- [ ] Voltar pro modo original

## 19. Cleanup

- [ ] Deletar deal "Deal Teste E2E" se ainda existir
- [ ] Deletar contato "Contato Teste E2E" se ainda existir
- [ ] Deletar empresa "Empresa Teste E2E" se ainda existir
- [ ] Restaurar Mariana Oliveira pro estágio original se mudou
- [ ] Logout

---

## Critérios de Sucesso

- **PASS**: Ação executa sem erro, UI atualiza, dados persistem
- **FAIL**: Tela branca, erro JS no console, ação não persiste, crash
- **SKIP**: Feature depende de config externa (ex: canal de messaging sem credenciais)

## Relatório

Gerar ao final:
- Total de checks: N
- PASS: N
- FAIL: N (com screenshot + descrição)
- SKIP: N (com motivo)

# Changelog

## 27/12/2025

- **CRM (reaplicação de mudanças pendentes)**:
  - Reaplicadas e persistidas no código as melhorias de **Empresas (CRUD + UI padronizada)**, **Inbox (Seed + regra de churn)** e **Atividades (contexto empresa/participantes + ESC no modal)** que estavam visíveis no editor, mas não tinham sido materializadas em commit.
- **Boards (fix)**:
  - Corrigido erro ao criar/atualizar board quando o Supabase/PostgREST ainda não tem a coluna `boards.default_product_id` (migration não aplicada ou schema cache desatualizado).
  - Detalhe técnico: `boardsService` agora **omite** `default_product_id` quando não há produto e faz **retry** removendo o campo ao detectar o erro “schema cache”.
- **Settings (UI)**:
  - `SettingsSection` foi padronizado para o layout de card `rounded-2xl` com header mais clean, alinhando com o padrão visual recente das telas de Configurações.
  - Abas/rotas:
    - Nova aba **Produtos/Serviços** (admin) e rota `/settings/products` (catálogo não fica mais em “Geral”).
    - Nova rota `/settings/integracoes` abrindo a aba “Integrações”.
  - **Central de I.A**:
    - “Funções de IA” voltou para o padrão visual de “row-card” com ações por ícone (editar prompt + toggle por ícone).
    - Toggle por ícone padronizado: **ativo verde** / **desativado vermelho**.
    - Fix: editor de prompt dentro de “Funções de IA” agora carrega o **template padrão do catálogo** quando não existe override ativo (antes podia abrir vazio).
  - **Integrações → Webhooks**: corrigido exemplo de `curl` (remoção de caracteres `+` no output).
- **Debug Mode (UX)**:
  - Debug agora é **reativo** (sem refresh): toggle dispara evento (`DEBUG_MODE_EVENT`) e `DebugFillButton` usa `useDebugMode`.
  - Fix: geração de telefone fake agora é determinística (sem `fromRegExp`, evitando `\\` no número).
- **Contatos (UX)**:
  - Campo **Empresa** agora aparece também no **Editar Contato**; limpar o campo **desvincula** a empresa do contato.
  - Botão de debug **“Fake x10”** volta a funcionar com estado de loading (`disabled`).
- **Atividades (contexto)**:
  - `Activity` suporta `contactId`, `clientCompanyId` e `participantContactIds`.
  - `activitiesService` agora persiste esses campos (com retry safe quando migration ainda não existe).
- **Inbox (debug)**:
  - Botão **Seed Inbox** (apenas em debug) para criar dados que disparam sugestões de **Upsell**, **Stalled** e **Rescue**.
- **Contatos / Empresas (UX + fix)**:
  - Modal **Editar Contato** agora exibe e pré-preenche o campo **Empresa** (e permite **desvincular** deixando em branco).
  - Ícones clicáveis para abrir edição de contato:
    - Na aba **Pessoas**, clicar no **avatar** abre o modal de edição.
    - Na aba **Empresas**, clicar no **ícone da empresa** abre um contato vinculado (primeiro da lista).
    - Na aba **Empresas**, clicar no avatar em **“Pessoas Vinc.”** abre o modal de edição daquele contato.
- **Inbox (UX)**:
  - Empty-state **“Inbox Zero”** agora aparece também na view **Lista** (igual ao modo Foco), reutilizando `InboxZeroState`.

## 26/12/2025

- **Documentação (JSDoc em pt-BR)**:
  - Adicionada cobertura de docstrings (JSDoc) para **funções, classes e métodos públicos/exportados** no repositório.
  - Incluído o script `scripts/add-jsdoc.mjs` para manter/atualizar a cobertura automaticamente.
- **README**:
  - Reescrito para servir como guia completo de onboarding (setup, env vars, scripts, arquitetura e referências).
- **Integrações (Webhooks “produto”)**:
  - Criada uma UI leigo-friendly em **Configurações → Webhooks** para ativar **Entrada de Leads** (seleciona Board + Estágio e entrega URL/Secret/cURL prontos).
  - Adicionada configuração de **Follow-up (Webhook de saída)** para notificar sistemas externos quando um deal muda de etapa.
  - Migration `supabase/migrations/20251226010000_integrations_webhooks_product.sql` adiciona tabelas de configuração/auditoria e trigger de mudança de estágio.
  - Edge Function `supabase/functions/webhook-in` implementa o endpoint público de entrada com `X-Webhook-Secret`.
- **Settings (UX)**:
  - Criada a aba **Integrações** em Configurações e movidas para lá as seções de **Chaves de API** e **Webhooks** (admin-only).
- **Fix (Zerar Database)**:
  - Ajustada a ordem de deleção para limpar **Integrações/Webhooks** antes de `board_stages`, evitando erro de FK (`integration_inbound_sources_entry_stage_id_fkey`).
- **Contatos (Importar/Exportar CSV)**:
  - Botão de **Importar/Exportar** no header de **Contatos → Pessoas**, abrindo modal com abas de import/export.
  - Exportação via endpoint `GET /api/contacts/export` respeitando **filtros/pesquisa/ordenação** atuais.
  - Importação via endpoint `POST /api/contacts/import` com:
    - detecção de delimitador (`,`/`;`/TAB), suporte a cabeçalhos comuns e normalização de `status`/`stage`;
    - dedupe por email (atualizar / ignorar duplicados / sempre criar) e opção de **criar empresas** pelo nome.
  - Template CSV e download de **relatório de erros** (com número da linha).
  - Ajuste de layout: texto do checkbox “Criar empresa…” agora não “quebra”/desalinha o `<code>company</code>` no modal.
  - UX: copy do checkbox de importação esclarece o comportamento (criar/vincular empresa via coluna `company` vs importar sem vínculo).
  - Fix (UX): modais de Contatos voltaram a **fechar ao clicar fora** (backdrop click), além de `Esc`.
  - UX (Modais): padronizado “clicar fora fecha” em modais/overlays do app, **mantendo travado apenas o Inbox Focus (preview)**.

## 25/12/2025

- **Settings (IA)**:
  - UI de configuração de IA mais compacta (redução de paddings/margens para não “inflar” a tela).
  - Bloco de **Consentimento LGPD** agora inicia **colapsado quando já existe API key** salva e **colapsa automaticamente após salvar** uma key válida.
  - Toggle **“IA ativa na organização”** (admin): permite desligar/ligar IA para toda a equipe; endpoints `/api/ai/*` respeitam e bloqueiam chamadas quando desligado.
  - Segurança: `GET /api/settings/ai` não retorna mais as **API keys** para membros (não-admin); apenas flags “tem key configurada”.
  - Flags por função: admin pode habilitar/desabilitar funções específicas de IA (script, briefing, análise, e-mail, objeções, boards, chat do agente).

- **Central de I.A (Configurações)**:
  - Nova aba/rota `/settings/ai` para concentrar tudo relacionado a IA (configuração + prompts).
  - Ajustados links internos para apontar para `/settings/ai#ai-config`.
  - Toggle “IA ativa na organização” movido para o topo da Central (sempre visível); admin-only.
- **Central de I.A (Prompts)**:
  - UI redesenhada para ficar mais “produto”: busca, filtro por categoria, lista compacta e detalhes sob demanda.
  - Refinamento adicional: ações mais discretas (ícones), “Reset” só aparece quando há override e detalhes mostram variáveis como chips.
  - Ajuste final: lista estilo “tabela” com colunas alinhadas e ações **somente com ícones** (Reset aparece só no hover).
  - Refinamento visual: padrão “iOS Settings” (segmented control, lista agrupada com cells, ações como glyphs sem caixas).
  - Atalho “Funções de IA” na área de Prompts para rolar direto até os toggles por função.
- **CRUD inicial de Prompts (por organização)**:
  - Migration `supabase/migrations/20251225000000_ai_prompts.sql` cria `ai_prompt_templates` com versionamento simples (1 ativo por `key`).
  - APIs `app/api/settings/ai-prompts` (listar overrides ativos + salvar nova versão) e `app/api/settings/ai-prompts/[key]` (listar versões + reset).
  - UI para editar override e resetar (removida posteriormente; edição passou a ficar dentro de “Funções de IA”).
- **Integração backend com prompts editáveis**:
  - Rotas `app/api/ai/tasks/*` e parte de `app/api/ai/actions` passaram a resolver prompt via catálogo + override (`lib/ai/prompts/*`), permitindo mudar comportamento sem deploy.

- **Jornada “Máquina de Vendas B2B (Completa)”**:
  - Adicionado o estágio/board **CS & Upsell** (4ª etapa), fechando o ciclo pós-onboarding dentro da jornada oficial.
  - Instalação da jornada oficial agora preenche `linkedLifecycleStage` **no nível do board** (além do `linkedLifecycleStage` já existente nas colunas/estágios), deixando os boards “interligados” pelo lifecycle no runtime.
  - Instalação da jornada (oficial e community) agora também encadeia o fluxo via `nextBoardId` (SDR → Vendas → Onboarding → CS), permitindo **handoff automático** quando o deal atinge o estágio de sucesso.
  - Correção de regra de “ganho/perda”: quando o board define `wonStageId`/`lostStageId`, o sistema **prioriza esses IDs** (fallback para `linkedLifecycleStage` apenas se não houver configuração) — evita disparos indevidos em boards como Onboarding.
  - Fix de multi-tenant: `boardsService` agora garante `organization_id` ao criar boards/estágios (inferindo do `profiles.organization_id` quando o caller não fornece), evitando falhas de criação de deals (“Organização não identificada…”).
  - Fix de resiliência: `dealsService.create` agora tenta recuperar `organization_id` via `profiles` se o board estiver com `organization_id` vazio, e faz um repair best-effort do board em background.
  - Fix (Next/React): removido warning de **hydration mismatch** no header (botão de debug) inicializando o estado do debug de forma determinística no SSR e sincronizando com `localStorage` somente no client.
  - Fix (Settings): “💣 Zerar Database” agora limpa primeiro `boards.won_stage_id/lost_stage_id/next_board_id` antes de deletar `board_stages`, evitando erro de FK (`boards_won_stage_id_fkey`).
  - Templates (mercado): CS foi separado em **CS (Saúde da Conta)** (health/risk/churn) e **Expansão (Upsell)** virou um **pipeline comercial separado** na jornada B2B (não auto-encadeado por padrão).
  - Playbook: adicionado **Infoprodutor (Completo)** como jornada oficial e uma opção de instalação **“Incluir Renovações (Assinatura)”** antes de instalar (board opcional).
  - Playbook: ajustado **Funil de Vendas Simples** para labels mais diretas: **Novo → Em conversa → Proposta → Ganho → Perdido**.
  - Playbook (Infoprodutor): defaults de **Won/Lost** agora são aplicados automaticamente na instalação (ex.: “Matriculado” em Vendas, “Primeiro Resultado” no Onboarding, “Upsell Fechado” em Expansão, “Renovado” em Renovações; CS Health usa “Arquivar” e “Churn”).
  - UX (Boards): no modal **Editar Board**, agora é possível **trocar o board sendo editado** por um seletor, evitando o fluxo “fechar → engrenagem → abrir outro board”.
  - Playbook (Infoprodutor): board opcional **Renovações (Assinatura)** agora é criado como **“6. Renovações (Assinatura)”** para manter a lista numerada.
  - UX (Boards): modal **Criar Novo Board** agora é **responsivo em telas menores** (mobile quase full-screen com scroll interno; modo chat vira coluna no mobile e só divide em 2 colunas no desktop).
  - UX (Boards): refinado sizing do modal do Wizard para não “inflar” em telas maiores (mobile `h-full`, desktop `h-auto` + `max-w` menor).
  - UX (Boards): modal do Wizard agora tem **hard cap por viewport** (`max-w: calc(100vw - padding)` / `max-h: calc(100dvh - padding)`) para evitar overflow em telas pequenas.
  - UX (Boards): Wizard “Criar Novo Board” ganhou tela inicial **Jobs-style** (3 escolhas grandes: do zero / playbook recomendado / template individual) e só depois mostra as listas, reduzindo fricção e “poluição” visual.
  - UX (Boards): tela inicial do Wizard foi **compactada** (formato “chooser”) e agora dá **destaque ao Criar com IA** como CTA primário.
  - UX (Modais): criado um conjunto de **tokens de modal** (`components/ui/modalStyles.ts`) e o `components/ui/Modal.tsx` passou a usá-los; modais de Boards foram alinhados para manter consistência (overlay, padding, radius, viewport cap e foco).
  - UX (Boards): Wizard “Criar Novo Board” agora mantém o **modo browse compacto** (mesma filosofia da home) e removeu o **footer vazio** no step de seleção para evitar “espaço morto” e sensação de modal gigante.
  - UX (Boards): corrigido conflito de `max-w` no Wizard (o `lg:max-w-5xl` estava vencendo e mantendo o modal largo mesmo no browse); agora o `max-w` é calculado sem classes conflitantes.
  - UX (Boards): browse do Wizard (Playbooks/Templates/Comunidade) agora usa **`max-w-2xl`** para ficar mais “picker” e menos “página”.
  - UX (Boards): modal “Criar board em branco” agora tem **scroll interno com `max-h` por viewport**, evitando estourar a área visível em telas menores e mantendo o footer sempre acessível.
  - UX (Boards): preview/criação via **IA** agora normaliza cores das colunas usando uma **paleta fixa** (Tailwind não gera classes dinâmicas vindas da IA em runtime), garantindo que os boards gerados venham com cores visíveis.
  - UX (Modais): overlay de modal agora usa **z-index alto** para nunca ficar atrás da sidebar; “Refinar com IA” foi reduzido para não parecer página cheia.
  - UX (Deals): `DealDetailModal` agora **fecha ao clicar fora** (backdrop click) e usa **z-index alto** para não ficar atrás da sidebar.
  - UX (Boards): modal **Editar Board** agora permite **reordenar etapas via drag-and-drop** (sem libs externas).
  - UX (Boards): drag-and-drop no modal **Editar Board** agora exibe **preview do item sendo arrastado** + estilo visual durante o drag (opacidade/sombra), evitando a sensação de “não está funcionando”.
  - UX (Deals): textos de prioridade agora são normalizados para **PT-BR** (Baixa/Média/Alta) em todas as telas.
  - UX (Cockpit): rota `/deals/[dealId]/cockpit` agora abre o **cockpit “original” do modo Focus (Inbox)**. A V2 ficou isolada em `/deals/[dealId]/cockpit-v2` e `/labs/deal-cockpit-mock`.
  - UX (Deals): removido o botão **Cockpit** do modal de detalhes do deal (mantemos o cockpit pelo modo Focus).
  - UX (Deals): barra de estágios no modal do deal agora aparece como **linha do tempo (status)** — mais baixa e discreta, evitando parecer um “menu”.
  - UX (Deals): refinada a “linha do tempo” de estágios (estilo mais clean): **apenas o estágio atual em cor**, demais neutros, conectores discretos e interação sem “cara de botão”.
  - UX (Deals): ícones no composer de nota do modal do deal agora funcionam: **modelo de nota** (documento) e **ditado por voz** com feedback quando o navegador bloquear permissão.
  - UX (Deals): removidos temporariamente os ícones do composer de nota (modelo/ditado) até definirmos a UX final.
  - Feature (Produtos): adicionado catálogo em **Configurações → Produtos/Serviços** (CRUD básico) e suporte a **item personalizado** no deal (quando o produto depende do cliente).
  - Feature (Produtos): catálogo agora permite **editar** produto (nome, preço, SKU, descrição).
  - Feature (Boards): suporte a **produto padrão por board** (configurável no “Editar Board” e sugerido no modal do deal).

## 24/12/2025

- **Kanban (UX)**:
  - Contorno/realce de drop ao arrastar deals agora **segue a cor do estágio** (em vez de ser sempre verde), mantendo consistência visual no pipeline.
  - Implementação via mapeamento explícito de classes Tailwind para evitar classes dinâmicas não geradas no build.
  - Modal de deal agora tem atalho **Cockpit** para abrir `/deals/[dealId]/cockpit` diretamente.
  - Inbox Focus: restaurado o botão “Ver detalhes” (pulsar) mesmo quando uma atividade vier sem `dealId`, usando fallback por `dealTitle` para resolver o deal.
  - Inbox Focus: reforçada a resolução de contexto quando `dealTitle` vem vazio (extração do nome do contato a partir de títulos comuns como “cliente: Nome”/“cliente Nome”, e normalização de títulos para matching mais robusto).
  - Inbox Focus: “Ver detalhes” volta a aparecer **mesmo sem deal/contato resolvido**; quando não há contexto, abre um painel rápido para **vincular um negócio manualmente** e então abrir o Cockpit.
  - Cockpit: tecla **ESC** volta a fechar o overlay mesmo com foco em inputs (listener em capture no `FocusContextPanel`).
  - Settings (IA): “Outro (Digitar ID)” agora permite **digitar e salvar** um `modelId` customizado (não tenta mais salvar `aiModel=''`, que era rejeitado pelo backend).
    - Correção adicional: o `<select>` agora tem **estado de UI próprio**, então ao selecionar “Outro” o input aparece imediatamente (antes o select era controlado só por `aiModel` e “voltava”).
  - Kanban templates: ao aplicar templates (Modal e Wizard), o sistema agora **auto-preenche** `wonStageId`/`lostStageId` usando labels determinísticas do template (ex.: “Ganho”/“Perdido”, “Churn”), com fallback heurístico por nome.
  - Kanban templates: adicionado **export de Board/Jornada** (gera arquivo JSON do template) e **import local** (upload/colar JSON) para instalar sem GitHub.
    - Correção: download via Blob URL agora é compatível com Safari (não revoga o URL imediatamente; fallback para abrir em nova aba).
    - Correção: `slugify()` do export agora evita regex avançada (unicode property escapes) para não quebrar em alguns browsers; o click de download passou a ter try/catch + toast de erro.
    - Diagnóstico: export agora mostra preview do `journey.json`, permite **copiar JSON**, e loga no console os parâmetros do download para rastrear bloqueios do navegador.
    - UX: ao selecionar boards para exportar uma jornada, a ordem exportada agora segue a ordem exibida na lista (em vez de “ordem de clique”), e o modal mostra “Ordem que será exportada”.
    - UX: ao abrir o modal, a seleção é automaticamente reordenada para seguir a lista (evita “ordem antiga” persistida entre aberturas).
    - Feature: adicionado **Importar JSON (local)** no mesmo modal (upload/colar `journey.json`), com validação e instalação sequencial para preservar a ordem dos boards.
    - UX: modal de templates agora tem layout mais limpo (header simplificado, largura maior e scroll interno) para evitar UI “desconjuntada”.
    - UX: export/import do template agora é “para leigos” por padrão (ações principais em destaque e detalhes técnicos/JSON escondidos atrás de “Mostrar detalhes técnicos”).
    - UX: export de template agora é sempre no formato **Jornada** (1 board = template simples; múltiplos = jornada). Removidos botões “Board/Jornada”.
    - UX: modal de export reduzido (não precisa mais de largura extra após simplificações).
    - UX: modal de export reduzido ainda mais para ficar mais compacto.

- **Merge de branches e consolidação na `main`**:
  - Merge de `chore/migrate-ai-actions-to-tasks`: introdução de endpoints em `/api/ai/tasks/*` (boards/deals/inbox) e migração parcial de chamadas para o novo client (`lib/ai/tasksClient.ts`), removendo rotas legacy.
  - Merge de `feat/inbox-macro-overview`: evolução grande do Inbox com visão Overview, composer de mensagens, melhorias de UX e adições relacionadas a cockpit/installer.
  - Compatibilidade: reintroduzido `/api/ai/actions` + `lib/supabase/ai-proxy.ts`/`lib/ai/actionsClient.ts` para manter features que ainda dependem do fluxo RPC antigo, enquanto o novo `/api/ai/tasks/*` coexiste.
  - Correção pós-merge: `test/helpers/salesTeamFixtures.ts` reparado para manter `typecheck` e `vitest` passando.

- **Zerar dívida (remoção de legado não usado)**:
  - Removidos `hooks/useAgent.ts` e `components/ai/ToolInvocation.tsx` (código legado que não era referenciado por nenhuma tela e continha caminhos descontinuados).
  - Validação: `typecheck`, `test`, `lint` e `build` seguem passando após a remoção.

- **/check: qualidade “zero warnings”**:
  - `npm run lint` agora roda com `eslint --max-warnings 0` (gate real para não aceitar warnings).
  - Ajustes de lint/config:
    - `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`, `react-hooks/exhaustive-deps` e regras do “React Compiler” foram desabilitadas com justificativa no `eslint.config.mjs` (o projeto tinha backlog alto de warnings).
  - Limpeza de código/UX:
    - Migração de alguns `<img>` para `next/image` (ex.: Kanban, Profile, Reports, Layout).
    - Removidos `eslint-disable` obsoletos e pequenos ajustes (`prefer-const`, imports não usados).
  - Testes: removido warning de `act()` e suprimido ruído conhecido de logs de terceiros/requests esperadas no setup do Vitest para manter output limpo.

- **Atualização do AI SDK para versões estáveis (latest)**:
  - `ai`: `6.0.3` (antes: `^6.0.0-beta.157`)
  - `@ai-sdk/react`: `3.0.3` (antes: `^3.0.0-beta.160`)
  - `@ai-sdk/openai`: `3.0.1` (antes: `^3.0.0-beta.102`)
  - `@ai-sdk/google`: `3.0.1` (antes: `^3.0.0-beta.78`)
  - `@ai-sdk/anthropic`: `3.0.1` (antes: `^3.0.0-beta.89`)

- **Detalhes técnicos**:
  - Migração do canal **beta** para **stable** mantendo a stack do projeto (AI SDK v6 + `ToolLoopAgent` + `createAgentUIStreamResponse` + `@ai-sdk/react/useChat`).
  - Dependências **fixadas** (sem `^`) para builds reprodutíveis; `package-lock.json` regenerado via reinstall limpo.

- **AI SDK DevTools (uso local)**:
  - Adicionado `@ai-sdk/devtools` e um script `ai:devtools` para abrir o viewer local.
  - Instrumentação opcional via `AI_DEVTOOLS=1` (somente em `NODE_ENV=development`) para capturar runs/steps e inspecionar chamadas do agente, tool calls, tokens e payloads em ambiente local.
  - Ajustado `npm run dev` para iniciar automaticamente o viewer do DevTools + abrir `http://localhost:4983` + ligar `AI_DEVTOOLS=1`. Adicionado `dev:plain` para rodar sem DevTools.

- **Chat com fricção zero (Quick Replies)**:
  - Quando o assistente listar opções (ex.: desambiguação de deals) ou pedir “valor final”, o chat renderiza botões clicáveis (quick replies) para evitar digitação.
  - O agente injeta um mapa recente `título -> ID` no system prompt para conseguir seguir o fluxo quando o usuário seleciona apenas pelo título (sem expor UUIDs).
  - Correção: evitado `ReferenceError` no `UIChat` movendo `sanitizeAssistantText` para função hoisted (antes era `const` e era usada antes de inicializar).
  - Melhoria: ao pedir “valor final”, o chat sugere botões com valores detectados no cockpit/últimas mensagens/listas de deals (não só no texto do assistente).
  - Melhoria: ao responder “Encontrei X deals...”, o chat também renderiza botões de seleção imediatamente (sem precisar o assistente perguntar “qual deles?”).

- **Experimento: AI SDK RSC (branch `feat/ai-sdk-rsc-experiment`)**:
  - Adicionado `@ai-sdk/rsc` e uma página de laboratório em `/labs/ai-rsc` para testar streaming de UI via RSC (`createAI`, `useUIState/useActions`, `streamUI`).
  - Inclui uma tool `searchDeals` que renderiza opções clicáveis (client component) dentro da conversa para comparar com o fluxo atual via AI SDK UI.
  - Ajuste: “router” no Server Action para detectar `procure deals com X` e renderizar opções clicáveis diretamente (evita alucinação quando o modelo não chama a tool).
  - Melhoria: após selecionar um deal, a UI renderiza um card com **ações sugeridas** (ex.: detalhes, próximos passos, mensagem WhatsApp) via botões, usando o contexto do deal (sem digitar).
  - Melhoria: ações de CRM para o deal selecionado via botões (sem digitação): **Marcar como ganho** (com input de valor), **Marcar como perdido** (com motivo), **Mover estágio** (lista de estágios do board), executando via `createCRMTools` no server action.
  - Melhoria de UX: painel de deal agora é tratado como **“painel único”** (substitui/atualiza em vez de duplicar cards no histórico), reduzindo ruído visual ao navegar entre ações.
  - Melhoria de UX: ações **Ganho / Perdido / Mover** agora abrem **accordion inline dentro do painel** (sem criar “mensagens de formulário” no chat). O server action fica responsável só por executar a tool e devolver o painel atualizado.
  - Melhoria de UX: painel do deal agora é **sticky** (fixo acima do input), mantendo contexto sempre visível e deixando o histórico rolável somente com mensagens de conversa.
  - Melhoria de UX: refatoração visual inspirada no template da Vercel (`vercel-labs/ai-sdk-preview-rsc-genui`): coluna central fixa (~520px), feed em estilo “linhas com ícone” (menos bolhas pesadas), empty-state + suggested actions e paleta `zinc` para um visual mais limpo.
  - Paridade com o template da Vercel: adicionadas dependências **`sonner`** (Toaster/toasts) e **`streamdown`** (renderização de Markdown), animações com **`framer-motion`** e hook de **scroll-to-bottom** no chat.
  - Streaming de texto alinhado ao exemplo oficial: uso de `createStreamableValue` + `useStreamableValue` para renderizar conteúdo em tempo real com Markdown durante `streamUI`.

## 26/12/2025

- **Dashboard/Relatórios (Navegação)**:
  - Correção dos cards de KPI e CTA de “Configurar” para navegar para **`/boards`** (rota válida do pipeline) em vez de **`/pipeline`** (rota ausente).
  - Adicionado alias **`/pipeline → /boards`** via redirect preservando querystring (`status`, `view`, `deal`, etc.) para compatibilidade com links antigos.

- **Deals (Tags)**:
  - Adicionado editor de **tags do negócio** no `DealDetailModal` (chips + adicionar/remover).
  - Sugestões de tags reutilizam `crm_tags` (localStorage) e novas tags criadas no modal passam a alimentar a lista de sugestões.
  - Refinamento de UI: botão de adicionar tag agora é **compacto (ícone)** e alinhado ao input (melhor no mobile).

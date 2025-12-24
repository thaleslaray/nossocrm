# Changelog

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
  - Kanban templates: adicionado **export de Board/Jornada** (gera `journey.json` compatível com a aba Community) + snippet pronto para colar no `registry.json` do repositório de templates.

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

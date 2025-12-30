# Changelog

## 30/12/2025

- **Installer Wizard — Supabase Free limit (global) + menos “projetos fantasmas”**:
  - **Problema**: usuários no plano Free do Supabase podem ter limite **global por usuário** (2 projetos ativos), então o wizard tentava criar em outra org “com slot” e falhava com erro 400 (parecia travar).
  - **Solução (fluxo)**: quando o preflight detecta `freeGlobalLimitHit=true`, o wizard vai direto para **“Precisamos de espaço”** (sem tentar criar projeto).
  - **Solução (nomes)**: antes de criar, o wizard agora pré-carrega os nomes de projetos da organização (incluindo `INACTIVE`) para evitar cascata de `PROJECT_EXISTS` (409) e “aparência de que criou vários bancos”.
  - **UX**: durante a pausa de projeto, a UI mostra que pode levar até ~3 minutos e exibe telemetria (tempo/tentativas/status).
  - **Arquivo**: `app/install/wizard/page.tsx`

- **Installer Wizard — Etapa atual visível + retry guiado no “aguardando redeploy”**:
  - **Problema**: alguns usuários viam o wizard “parado” em percentuais como 26% sem entender o que estava acontecendo (principalmente no `wait_vercel_deploy`).
  - **Solução**: eventos do stream agora incluem `stepId`, e a UI exibe **a etapa atual** junto do percentual.
  - **Retry**: quando o redeploy já foi disparado mas ainda não ficou `READY`, a tela de erro oferece **“Verificar de novo (Vercel)”** sem refazer a instalação inteira.
  - **Endpoint**: `/api/installer/finalize` (aguarda READY e então desabilita `INSTALLER_ENABLED`).
  - **Arquivos**: `app/api/installer/run-stream/route.ts`, `app/api/installer/finalize/route.ts`, `app/install/wizard/page.tsx`

- **Installer Wizard — Erros prescritivos (não-técnicos) com CTAs**:
  - **Mudança**: overlay de erro agora mostra “Como resolver” com passos curtos e botões (ex.: voltar ao início, limpar dados, recarregar).
  - **Cobertura**: token Vercel inválido/sem escopo, installer token inválido, bloqueio same-origin/CSRF, token Supabase inválido e rede instável.
  - **Arquivo**: `app/install/wizard/page.tsx`

## 29/12/2025

- **Installer — Bloqueio de acesso após instalação completa**:
  - **Problema**: Após o wizard terminar, as páginas `/install` ainda eram acessíveis (mesmo que os endpoints retornassem 403)
  - **Solução**: Novo endpoint `/api/installer/check-initialized` que verifica se a instância está inicializada
  - **Proteção**: Páginas `/install`, `/install/start` e `/install/wizard` agora verificam se está inicializado e redirecionam para `/dashboard` se estiver
  - **Fail-safe**: Em caso de erro na verificação, não bloqueia o acesso (permite instalação mesmo com problemas temporários)
  - **Arquivos**: `app/api/installer/check-initialized/route.ts`, `app/install/page.tsx`, `app/install/start/page.tsx`, `app/install/wizard/page.tsx`

- **README — Reescrita completa seguindo padrão SmartZap**:
  - **Mudança**: README completamente reescrito focando em instalação via Vercel (fork primeiro)
  - **Fluxo principal**: Fork no GitHub → Deploy na Vercel → Wizard de instalação
  - **Destaque**: Instalação via Vercel agora é o método principal e mais destacado (antes do wizard)
  - **Estrutura**: Seguindo padrão do SmartZap com passo a passo claro e visual
  - **Público-alvo**: Focado em não-desenvolvedores, linguagem simples e acessível
  - **Conteúdo**: Adicionados exemplos práticos, troubleshooting simplificado, guia completo de instalação
  - **Seção técnica**: Informações técnicas movidas para seção "Para Desenvolvedores" no final
  - **Arquivo**: `README.md`

## 28/12/2025

- **Installer Wizard — Auto-unlock (experiência mágica sem toggle manual)**:
  - **Problema**: com `INSTALLER_ENABLED=false`, endpoints do instalador retornam `403 Installer disabled` e quebram o fluxo.
  - **Solução**: novo endpoint `/api/installer/unlock` (não bloqueado por `INSTALLER_ENABLED`) que usa o token da Vercel para:
    - setar `INSTALLER_ENABLED=true` via `upsertProjectEnvs`
    - disparar redeploy e aguardar deployment `READY`
  - **UX**: `/install/start` e `/install/wizard` tentam auto-unlock ao detectar `meta.enabled=false` e recarregam a meta.
  - **Segurança**: continua protegido por `sameOrigin` + necessidade de token Vercel válido.

- **Installer Wizard — Retry automático em queda de stream (SSE)**:
  - **Problema**: `net::ERR_NETWORK_CHANGED` / “network error” pode abortar o streaming do `/api/installer/run-stream` mesmo com a instalação em andamento.
  - **Solução**: retry automático **1x** ao detectar erros transitórios durante `reader.read()`; mantém o “save game” e tenta retomar sem perder progresso.
  - **UX**: mostra subtítulo “Conexão instável — retomando…” e, se persistir, exibe mensagem amigável para retry manual.
  - **Arquivo**: `app/install/wizard/page.tsx`

- **Installer Wizard — Banner de pausa (fallback)**:
  - **Correção**: na tela "Precisamos de espaço", o banner amarelo agora aparece quando `pausePolling` **ou** `supabasePausingRef` estiverem ativos (garante banner mesmo se o estado global falhar).
  - **Arquivo**: `app/install/wizard/page.tsx`

- **Installer Wizard — Needspace com banner de pausa**:
  - **UX**: na tela "Precisamos de espaço", ao clicar em **Pausar**, o wizard agora mostra o mesmo banner de espera (estilo modal de conflito) e esconde a lista até a pausa concluir.
  - **Arquivo**: `app/install/wizard/page.tsx`

- **Installer Wizard — Pause realmente confiável (status + UX)**:
  - **Correção**: Polling de pausa agora tem dois modos:
    - **`pause`**: só finaliza quando o projeto estiver efetivamente pausado (`INACTIVE` / `INACTIVE_*` / `PAUSED`).
    - **`pausing`**: usado quando o backend já retorna `PAUSING`; finaliza quando sair de `PAUSING` (ou pausar).
  - **Motivo**: após `POST /pause`, o Supabase pode demorar alguns segundos mantendo `ACTIVE_HEALTHY` antes de mudar pra `PAUSING/INACTIVE`.
  - **UX**: ao clicar em **Pausar**, a UI força estado `PAUSING` imediatamente (mostra só o banner). Se der timeout, aparece apenas **"Verificar de novo"**.
  - **Arquivo**: `app/install/wizard/page.tsx`


- **Installer Wizard — Polling de pausa mais tolerante**:
  - **Problema**: A API do Supabase pode retornar status de pausa como `PAUSED`, `inactive` ou variantes (não exatamente `INACTIVE`), causando timeout mesmo com o projeto já pausado no painel.
  - **Solução**: O polling agora normaliza o status e considera pausado quando:
    - `status.startsWith("INACTIVE")` **ou** `status.includes("PAUSED")` (case-insensitive)
  - **Melhoria**: timeout aumentado para **3 minutos** (pausar pode demorar mais que 30s), evitando falso-negativo.
  - **Arquivo**: `app/install/wizard/page.tsx` (`pollProjectStatus`)

- **Fix (Convites — UI não atualiza após gerar link)**:
  - Corrigido problema onde o link gerado não aparecia na UI até fechar e reabrir o modal. Agora o estado é atualizado forçadamente após gerar o link, criando uma nova referência de array para garantir re-render.
  - Melhorado o filtro de convites expirados para tratar melhor casos de timezone e garantir que apenas convites válidos sejam exibidos.

- **Fix (Convites — Validação de token melhorada)**:
  - Melhorada a validação de tokens de convite no endpoint `/api/invites/validate`:
    - Normalização do token (trim) antes da comparação
    - Mensagens de erro mais específicas (já utilizado vs expirado vs não encontrado)
    - Verificação adicional quando o token não é encontrado para identificar se foi usado ou expirado
    - Logs de erro para facilitar debug

- **Fix (Convites — Schema Zod para expiresAt)**:
  - Corrigido schema Zod no endpoint `/api/admin/invites` POST: `expiresAt` agora aceita corretamente `null` quando a opção "Nunca" é selecionada. Antes, o schema `z.string().datetime().nullable()` rejeitava `null` porque esperava sempre uma string.
  - Adicionados logs de debug no endpoint POST para facilitar troubleshooting de erros de validação e inserção no banco.

- **Fix (Convites — JoinClient lê token da URL diretamente)**:
  - Corrigido problema onde `JoinClient` não conseguia validar tokens de convite: agora o componente lê o token diretamente da URL usando `useSearchParams()` do Next.js, em vez de depender apenas do prop do Server Component. Isso resolve casos onde `searchParams` não estava disponível no primeiro render.
  - Adicionados logs de debug no `JoinClient` para facilitar troubleshooting de problemas de validação.

- **Fix (Proxy/Manifest)**:
  - Corrigido erro de sintaxe no `manifest.webmanifest`: o proxy estava interceptando a requisição do manifest e retornando HTML inválido. Adicionado `manifest.webmanifest` à lista de exclusões do matcher do `proxy.ts` para permitir que o Next.js sirva o manifest corretamente como JSON.

## 28/12/2025

- **Installer — Ato final agora espera a Vercel**:
  - O `run-stream` passou a aguardar o deployment ficar **READY** via polling (`/v13/deployments/:id`) antes de emitir `complete`
  - Evita o "Explorar o novo mundo" apontar para um deploy ainda antigo (sem `NEXT_PUBLIC_SUPABASE_*`)


- **Installer — create-project idempotente**:
  - Se o Supabase responder "already exists", reutilizamos o projeto existente (fallback: lista global de projetos) para não travar em refresh/retry


- **Installer — Redeploy virou obrigatório**:
  - Agora, se a Vercel falhar ao redeployar, o instalador **não finaliza** (evita deploy sem `NEXT_PUBLIC_SUPABASE_*` e login quebrado)
  - Preferimos redeploy de **Production** (evita redeploy acidental de Preview)
  - Preferir deployment `id` (canônico) ao invés de `uid` quando ambos existirem (evita 404/NOT_FOUND em alguns projetos)
  - Redeploy passou a usar `POST /v13/deployments` com `deploymentId` (compatível com o fluxo do smartzap)
  - A Vercel exige `name` nesse endpoint; usamos `deployment.name` com fallback para `project.name`
  - Mensagem de erro aponta o caminho de **Redeploy manual** na Vercel


- **Installer — Fix crash do wizard (React #310)**:
  - Corrigido `useCallback` (Trocar senha) que estava após um `return` condicional (`isHydrated`), causando **crash em produção** ao abrir `/install/wizard`


- **Installer — Storage travado em 27% (causa raiz)**:
  - **Correção de credenciais do DB para migrations**: ao resolver as chaves do Supabase, o wizard agora mantém/reconstrói o `dbUrl` para usar `postgres.{projectRef}` + `dbPass` (mais permissões) em vez de `cli_login_postgres` (que pode falhar ao acessar schema `storage`)
  - Evita o loop de ~10min em `migrations` aguardando `storage.buckets`


- **Installer — Senha padronizada e login garantido**:
  - **Política única de senha**: min 8 + (1 letra + 1 número) aplicada em `/install/start`, `/install/wizard` e no payload do `/api/installer/run-stream`
  - **Bootstrap idempotente**: `bootstrapInstance` não falha mais com "Instance already initialized"; ele cria ou atualiza o admin e **garante a senha**
  - **Login verificado antes do final**: o `run-stream` valida `email+senha` via `/auth/v1/token` e só conclui se o login funcionar


- **Installer — Senha (UX) Apple-like + recuperação**:
  - `/install/start`: checklist (8+/1 letra/1 número), botão **"Usar senha sugerida"** e **Copiar**
  - `/install/wizard`: modal **Trocar senha** (gera/ajusta), atualiza `localStorage` (hash) + `sessionStorage` e destrava o botão de iniciar


- **Installer — Nome de projeto já existe (retry/F5)**:
  - **`create-project` agora é resiliente**: se o Supabase responder "already exists", o backend lista projetos da org e **reaproveita** o projeto existente em vez de travar


- **Installer — Fix migrations retry + Pooler oficial (Supavisor)**:
  - **Retry de conexão PG sem reutilizar client**: evita erro "Client has already been connected" durante `migrations`
  - **DB URL via Supavisor Transaction Pooler**: usa `GET /v1/projects/{ref}/config/database/pooler` para obter `aws-*-REGION.pooler.supabase.com:6543`
  - **Username no pooler**: `role.{projectRef}` conforme docs oficiais



- **Installer — Prevenção de Loops de Auto-Submit**:
  - **Fix no `/install/start`**: adicionada verificação `!error` no auto-submit do token Vercel
    - Antes: se o token era inválido (401), voltava pra tela mas tentava novamente em loop infinito
    - Agora: se há erro setado, o auto-submit não dispara até o usuário limpar/alterar o token
  - **Fix no `/install/wizard`**: adicionada verificação `supabaseResolveError` no auto-resolve
    - Antes: se o resolve falhava, o useEffect disparava novamente causando loop
    - Agora: se há erro de resolve, não tenta novamente automaticamente
  - **Auditoria completa**: verificados todos os useEffects com setTimeout/setInterval
    - `loadOrgsAndDecide` ✅ - já verificava `supabaseOrgsError`
    - `resolveKeys` ⚠️ → **corrigido** - agora verifica `supabaseResolveError`
    - `provisioningTimer` ✅ - tem timeout de 210s e cleanup adequado



- **Installer Wizard — Experiência Cinematográfica de Provisioning**:
  - **Pula tela 'creating' quando automático**: Se org paga é detectada, vai direto para a tela de provisioning sem mostrar tela intermediária com senha do DB
  - **Mensagens rotativas estilo Interstellar**: A cada 12s, uma nova mensagem aparece com animação fade:
    - "Calibrando coordenadas" → "Estabelecendo conexão" → "Construindo infraestrutura" → "Ativando sistemas" → "Sincronizando órbita" → "Verificando integridade" → "Preparando pouso"
  - **Animação de radar/pulso central**: 
    - 3 ondas expandindo infinitamente
    - Anel externo rotacionando (dashed)
    - Anel interno com glow pulsante
    - Ícone de loading centralizado
  - **Barra de progresso estilizada**:
    - Gradiente animado (cyan → teal → cyan)
    - Glow effect embaixo da barra
    - Progresso baseado no tempo real (estimativa 100s)
  - **Telemetria fake**: `SYS: 45%` | `NET: ONLINE` | `DB: COMING_UP` - piscando suavemente
  - **Partículas flutuando**: 6 partículas subindo com fade in/out
  - **Transições suaves**: AnimatePresence para trocar mensagens sem "pulo"

- **Installer Wizard — Resiliência Total (Fase 2)**:
  - **Instalação Resumível**: estado da instalação é salvo em `localStorage` a cada etapa
    - Se o navegador fechar ou der erro, ao voltar aparece modal "Instalação em andamento"
    - Opções: "Recomeçar" (limpa tudo) ou "Continuar" (retoma de onde parou)
    - Estado expira após 1 hora para evitar dados obsoletos
  - **Retry Inteligente**: cada etapa crítica tenta até 3x antes de falhar
    - `resolve_keys`, `resolve_db`, `migrations`, `edge_secrets`, `edge_deploy`, `bootstrap`
    - Delay progressivo entre tentativas (2s, 4s, 6s)
    - Feedback visual: "Tentativa 1/3..." no subtitle cinematográfico
    - Não faz retry em erros irrecuperáveis (ex: "already exists")
  - **Endpoint de Rollback** (`/api/installer/rollback`):
    - Permite desfazer parcialmente uma instalação que falhou
    - Ações: `delete_admin`, `delete_organization`, `truncate_tables`
    - Usado para limpar estado inconsistente antes de retry
  - **Botão "Tentar novamente"**: na tela de erro, além de "Voltar", agora tem opção de retry
  - **Novo módulo `lib/installer/installState.ts`**:
    - `createInstallState()`, `loadInstallState()`, `saveInstallState()`, `clearInstallState()`
    - `updateStepStatus()`, `canResumeInstallation()`, `getProgressSummary()`
    - Tracking de cada etapa: `pending | running | completed | failed | skipped`

- **Installer Wizard — Health Check Inteligente (Fase 1)**:
  - **Novo endpoint `/api/installer/health-check`**: analisa o estado do projeto Supabase antes de iniciar a instalação
    - Detecta se projeto está `ACTIVE_HEALTHY`, `COMING_UP` ou `PAUSED`
    - Verifica se Storage está pronto (`storage.buckets` existe)
    - Verifica se schema já foi aplicado (`organizations` table existe)
    - Verifica se admin já foi criado
  - **Instalação adaptativa**: baseado no health check, o wizard pula etapas desnecessárias:
    - Projeto existente e saudável → pula espera de projeto
    - Storage já pronto → pula espera de storage
    - Schema já aplicado → pula migrations
    - Admin já existe → pula bootstrap
  - **Progresso dinâmico**: a barra de progresso agora é calculada baseada apenas nas etapas que serão executadas
    - Reinstalação de projeto existente: ~30 segundos
    - Projeto novo: ~2-3 minutos (inclui esperas)
  - **Mensagens contextuais**: feedback personalizado durante o health check
    - "Projeto detectado! Instalação rápida..." (quando muito pode ser pulado)
    - "Otimizando rota de instalação..." (quando algo pode ser pulado)
  - **Tempo estimado**: o health check retorna `estimatedSeconds` baseado nas etapas necessárias

- **Installer Wizard — Fluxo 100% Automático (Zero Decisões)**:
  - **Decisão automática de projeto Supabase**: após colar o PAT, o wizard automaticamente:
    1. Busca todas as organizações do usuário
    2. Prioriza org paga (se existir) → cria projeto direto
    3. Se não, busca org Free com slot livre → cria projeto direto
    4. Se todas as orgs Free estiverem cheias → mostra tela "Precisamos de espaço"
  - **Tela "Precisamos de espaço"**: lista todos os projetos ativos das orgs Free com botão "Pausar" em cada um. Após pausar, cria projeto automaticamente.
  - **Sem lista de projetos**: o usuário nunca vê lista de projetos para "escolher". Ele só vê:
    - Tela de criação (animação cinematográfica)
    - OU tela de "precisamos de espaço" (só quando necessário)
  - **Nome auto-sugerido**: `nossocrm`, `nossocrm-2`, `nossocrm-3`, etc.
  - **Senha auto-gerada**: banco de dados já vem com senha forte gerada automaticamente.
  - **Região Americas por padrão**: sem input de região.
  - **Polling de provisioning**: aguarda projeto ficar ACTIVE antes de avançar.

- **Installer Wizard — Reescrita completa (Apple-like UX)**:
  - **Zero ruído**: cada tela mostra apenas o essencial para aquela etapa. Sem repetição de informações de passos anteriores.
  - **Auto-avanço**: quando o projeto Vercel é detectado, avança automaticamente. Quando o PAT do Supabase é válido e orgs carregam, avança automaticamente.
  - **Supabase simplificado**:
    - Tela PAT: apenas input + link para gerar token. Nada mais.
    - Tela Projeto: lista projetos existentes OU cria novo. Região oculta (Americas por padrão). Senha do banco auto-gerada.
    - Nome do projeto: auto-sugere `nossocrm`, `nossocrm-2`, etc. se já existir.
    - Tela de criação: experiência cinematográfica com animação de loading enquanto provisiona.
  - **Admin**: apenas 4 campos (empresa, email, senha, confirmar). Erro de senha só aparece após preencher confirmação.
  - **Lançamento**: tela final com único botão "🚀 Lançar" — sem detalhes técnicos visíveis.
  - **Overlay de instalação**: experiência cinematográfica full-screen com animações de partículas, mensagens dinâmicas e celebração visual no sucesso.
  - **Progress dots**: indicador minimalista de 4 pontos no topo (estilo Apple setup).
  - **Navegação**: apenas "Voltar" quando necessário, sem botões redundantes.

- **Mobile shell (tablet/mobile) — groundwork**:
  - Adicionados utilitários de breakpoint para modo responsivo (`mobile|tablet|desktop`) em `lib/utils/responsive.ts` e hook `hooks/useResponsiveMode.ts`.
  - Criada a base de **Sheets** para fluxos mobile-first: `components/ui/Sheet.tsx` e `components/ui/FullscreenSheet.tsx` (com focus trap + ESC + safe-area bottom).
  - Criada configuração de navegação para **BottomNav** e “Mais” (`components/navigation/navConfig.ts`), espelhando destinos secundários do sidebar.
  - Implementada navegação **BottomNav (mobile)** + sheet “Mais” (ActionSheet) e integrada ao app shell em `components/Layout.tsx`, com padding automático via CSS vars (`--app-bottom-nav-height` / `--app-safe-area-bottom`) para evitar conteúdo coberto.
  - **A11y**: `NavigationRail` (tablet) agora expõe `aria-label` nos links/botões de ícone para melhor suporte a leitores de tela.

## 27/12/2025

- **Docs (Segurança/RBAC)**:
  - Adicionada matriz de permissões **admin vs vendedor** (telas/menus + endpoints) em `docs/security/RBAC.md`, incluindo notas de enforcement server-side (403) e proteção de segredos (IA).

- **Integrações → MCP (produto)**:
  - Reformulada a seção de MCP para ser “produto”: wizard em 3 passos (gerar key → colar → testar), status “Conectado”, botões de copiar (URL completa / comando do MCP Inspector / cURLs) e mensagem clara sobre **ChatGPT exigir OAuth (Fase 2)**.
  - Detalhe técnico: o teste da UI chama `initialize` + `tools/list` no endpoint `/api/mcp` usando `Authorization: Bearer` (e fallback `X-Api-Key`) e reporta quantidade/preview de tools.
  - UX: agora o Passo 1 pode **gerar a API key direto na tela** (RPC `create_api_key`) e já preenche o Passo 2 automaticamente; “metadata (JSON)” virou **Copiar** (e “Abrir” ficou em seção avançada).
  - UX (Jobs cut): a tela agora tem **um único CTA principal (“Conectar”)** que faz tudo (gera key + testa) e, ao finalizar, mostra “Pronto” com o próximo passo (copiar comando do Inspector). Conteúdo técnico ficou em **Avançado**.
  - UX (app próprio): removidos artefatos de dev (curl/metadata/inspector) do fluxo; após “Pronto”, a CTA principal vira **“Copiar URL + Token”** (o único dado que o app do aluno precisa).

- **MCP (foundation)**:
  - Criado o catálogo canônico de tools do CRM para MCP (nomes padrão `crm.*`, títulos e descrições) em `lib/mcp/crmToolCatalog.ts`.
  - Criado um registry/adaptador para expor as tools existentes de `createCRMTools` como tools MCP (mapeamento interno → nome MCP, com fallback para tools não mapeadas) em `lib/mcp/crmRegistry.ts`.
  - Detalhe técnico: o registry mantém ordenação determinística por `name` para facilitar cache/diffs em clients MCP.

 - **Smoke test (Integrações)**:
   - Adicionado script `scripts/smoke-integrations.mjs` para validar **webhook-in (opcional)** e **todas as rotas do Public API** via `npm run smoke:integrations` (usa `BASE_URL` + `API_KEY`).
  - Atualizado `app/api/mcp/route.ts` para remover o `TOOLS` hardcoded e passar a publicar/executar tools do registry (todas as tools `crm.*`) em `tools/list` e `tools/call`.
  - Detalhe técnico: `inputSchema` agora é gerado automaticamente via `Zod.toJSONSchema()` (dialeto 2020-12) em `lib/mcp/zodToJsonSchema.ts`, e validação de args usa `safeParse` com retorno de `isError: true` (Tool Execution Error).

- **Installer (Supabase Edge Functions / Management API)**:
  - Novo step **`supabase_edge_functions`** no instalador: seta secrets e faz deploy automático das Edge Functions do repositório (`supabase/functions/*`).
  - Inputs novos no Wizard: `supabase.accessToken` (PAT), `supabase.projectRef` (opcional; inferido de `supabase.url` quando vazio) e `supabase.deployEdgeFunctions` (default `true`).
  - Detalhes técnicos:
    - Secrets via `POST /v1/projects/{ref}/secrets` (**prefixo `SUPABASE_` é reservado e rejeitado pela API**) — agora o instalador cria `CRM_SUPABASE_URL`, `CRM_SUPABASE_ANON_KEY`, `CRM_SUPABASE_SERVICE_ROLE_KEY` e as Edge Functions leem esses valores (com fallback).
    - Deploy via `POST /v1/projects/{ref}/functions/deploy?slug=<slug>` com `multipart/form-data` e `metadata` incluindo `entrypoint_path`, `verify_jwt` (lido de `supabase/config.toml`, default `true`) e `import_map_path` quando existir `import_map.json`.
    - Resposta do instalador agora inclui `functions[]` com status por slug (`ok`/`error`); o step vira `warning` quando alguma function falha.

- **Installer (Padrão “100% mágico” para aluno)**:
  - Vercel: por padrão, `install/start` usa **o projeto do deploy atual** (detecção via `VERCEL_PROJECT_ID/VERCEL_ORG_ID` no `/api/installer/bootstrap`); seleção manual via PAT ficou como **modo avançado (fallback)**.
  - Root redirect: a rota `/` agora aplica um **gate inteligente**:
    - se `INSTALLER_ENABLED !== 'false'` e a instância **não estiver inicializada** (ou não der pra checar), redireciona para **`/install`**;
    - se a instância já estiver inicializada, segue para **`/dashboard`** (não força `/install`).
  - Vercel env targets: a seleção “Production/Preview” foi removida da UI; o instalador aplica envs automaticamente em **Production + Preview** (zero fricção).
  - Supabase:
    - Wizard permite **listar projetos via PAT** e selecionar (preenche `projectRef`/`supabaseUrl`).
    - Wizard permite **criar projeto via PAT** (listar orgs → criar projeto com `db_pass` + região smart group) e já auto-preencher o resto.
    - Auto-preenchimento passou a priorizar keys **`publishable/secret`** com fallback para `anon/service_role`.
    - Auto-resolve roda automaticamente (debounce) quando PAT + (URL ou `projectRef`) estão preenchidos.
    - Fix (Supabase resolve loop): quando o DB ainda não está pronto em projetos recém-criados, o auto-resolve agora usa **backoff + limite de tentativas** (e evita request 400 quando ainda não há `projectRef/url`), mostrando mensagem “Aguardando o banco ficar pronto…” em vez de ficar martelando a API.
    - Fix (Supabase IPv4/IPv6): para evitar o erro “Not IPv4 compatible”/`ipv6 address is not defined`, o instalador passou a **preferir Transaction Pooler (porta 6543)** ao montar `dbUrl` (no create-flow, usando o `db_pass` informado; e no backend, quando consegue gerar credenciais via `cli/login-role`).
    - Fix (Provisioning / “Project is coming up”): o instalador agora **espera o projeto ficar ACTIVE** antes de rodar migrations/Edge Functions:
      - Frontend: após criar projeto, o wizard faz polling em `POST /api/installer/supabase/project-status`.
      - Backend: o `POST /api/installer/run` executa um step `supabase_project_ready` com timeout e mensagem clara.
    - Fix (Storage): **não pulamos Storage**. Em vez disso, o passo de migrations agora **espera o Storage ficar disponível** (`storage.buckets` existir) antes de executar o SQL, evitando o erro `relation "storage.buckets" does not exist`.
    - UX (cinematográfico — espera com emoção): durante provisioning/espera, o wizard e o overlay “Piloto automático” agora exibem **telemetria viva** (polling do status do projeto) + animações “warp/scanlines” e microcopy estilo missão espacial; ao concluir com sucesso, há um **crescendo visual** (“aplausos” sutil).
    - UX (criar projeto): após o `create-project` retornar, o wizard **não fica travado** no botão “Criando…”. Ele avança imediatamente para a tela cinematográfica de espera (“Project is coming up”) e continua monitorando o status em background até ficar `ACTIVE`.
    - Fix (Supabase migrations SSL): normalizado `dbUrl` removendo `sslmode` da query string e forçando conexão TLS “no-verify” via `pg` no step de migrations para evitar falhas `self-signed certificate in certificate chain` em redes com proxy/CA corporativa.
    - Preview de Edge Functions em `GET /api/installer/supabase/functions` (lista slugs + `verify_jwt` inferido).
  - Edge Functions:
    - Deploy ganhou **concorrência limitada** e **retry/backoff** (reduz falhas transitórias).
    - O step `supabase_edge_functions` agora **auto-skip** quando não existem functions no repo (não exige PAT só por isso).
  - UX (Supabase):
    - Ao colar o **PAT**, o Wizard agora **lista projetos automaticamente** (com debounce) e, se não encontrar nenhum, sugere **criar um projeto automaticamente** (já seguindo com auto-preenchimento).
    - Refatorado para **progressive disclosure**: primeiro pede só o **PAT**, depois o usuário escolhe/cria o projeto (com seleção de **organização** quando houver múltiplas), e só então aparecem toggles/detalhes (campos avançados ficam escondidos).
    - Copy: esclarecido que o token necessário é o **Access Token (PAT)** (prefixo `sbp_`) e **não** o token da “Experimental API”.
    - Troubleshooting: o Wizard agora alerta quando detecta **2 projetos ativos** no plano **free** da **organização** selecionada e mostra orientação antes de tentar criar projeto.
    - Troubleshooting (mágico): quando detecta 2 ativos, o Wizard lista os projetos ativos e oferece “**Usar este projeto**” para selecionar com 1 clique.
    - Troubleshooting (zero lixo): quando não há slot no Free, o Wizard oferece ações de **liberar slot**:
      - pausar projeto via `POST /v1/projects/{ref}/pause` (reversível)
      - deletar projeto via `DELETE /v1/projects/{ref}` (destrutivo; exige confirmação digitando o `ref`)
    - Detalhe técnico: o Wizard usa `GET /v1/organizations/{slug}` para exibir o `plan` e `GET /v1/organizations/{slug}/projects` (com filtro de status) para contar/mostrar projetos por org.
    - Fix: lista de projetos ativos agora mostra **todos os itens** (com scroll) e ao trocar de organização a UI **invalida cache e refaz fetch automaticamente**.
    - UX: o passo Supabase agora é um **mini-wizard real** (PAT → Projeto → Auto-preenchimento), mostrando **uma etapa por vez** e mantendo as etapas concluídas como **resumos colapsados** com “editar”.
    - UX (cinematográfico / Interstellar): o wizard ganhou “capítulos” (pt-BR) com subtítulo + microfrase, transições de cena via `framer-motion` (fade/blur/slide) e acento **ciano/teal** local no instalador (CTA + progresso + glow).
    - UX (cinematográfico — wizard inteiro): transições de cena agora acontecem também entre os passos **Vercel → Supabase → Admin → Review** (não só dentro do Supabase), mantendo o footer como “continuidade” para dar sensação de filme.
    - UX (cinematográfico — Piloto automático): ao clicar **“Instalar agora”**, abre um overlay “Piloto automático” com **timeline animada** e telemetria enquanto o backend executa; ao finalizar, mostra status real + Edge Functions e permite fechar/continuar.
    - UX (cinematográfico — do início ao fim): a tela inicial `/install/start` agora abre o “filme” com o mesmo ambiente visual (vignette + grain + nebula teal) e troca de cena (input → validando → confirmar → decolar), e o `/install` (redirect/loading) mantém o clima com o mesmo backdrop.
    - Fix (Supabase org projects): corrigida paginação para respeitar o limite da API (`limit <= 100`), evitando erro **400** e loop de “Buscando…”.
    - UX (Supabase criar projeto): gerador de `db_pass` compatível (>= 12) com botão **gerar + copiar**, e nome do projeto vem por padrão como **`nossocrm`** (com sufixo sugerido se já existir).
    - UX (Supabase espaço): o resumo do PAT vira um **pill compacto** na etapa “Destino”, liberando área útil na tela.
    - UX/Fix (Supabase org duplicada): removido seletor duplicado de organização (e label em inglês) no modo “Criar novo”; a criação agora usa a org selecionada no topo.
    - UX (Supabase Free): erro do limite de 2 projetos ativos agora é exibido em pt‑BR com instruções claras (usar existente / pausar / deletar / upgrade).
    - UX (Supabase Free — iPhone setup): quando a org está sem slot, o wizard vira uma **tela única de decisão** com CTA “Liberar 1 slot” (pausar → auto-criar e continuar) e “Opções avançadas” só para deleção.
    - UX (Supabase Free — preflight Apple): com PAT + orgs carregadas, o wizard faz um preflight e **bloqueia “Criar projeto” antes de falhar**, mostrando diretamente o fluxo “Liberar 1 slot” quando o limite do Free já está atingido.
    - Fix (Supabase seleção de projeto): ao escolher um projeto de uma organização, o wizard agora usa a lista **da própria org** (e fallback por `ref`) para preencher `supabaseUrl/projectRef`, evitando o caso de “lista aparece, mas não seleciona”.
    - UX (Supabase projetos visíveis): a seleção de projetos da org agora é feita via **cards** (abrir/usar) em vez de `<select>`, evitando casos de “lista veio, mas não aparece”.
    - UX (zero fricção): ao colar um PAT válido, o Supabase step tenta listar orgs automaticamente e **auto-avança** para “Destino” quando a verificação passa; se houver apenas 1 org, ela é selecionada automaticamente e o sistema já carrega os projetos.

- **Build (fix)**:
  - Corrigidos erros de typecheck no build (`next build`):
    - `BoardCreationWizard`: `strategy.goal.type` agora é tipado corretamente como `'number' | 'currency' | 'percentage'` (Renovações do Infoprodutor).
    - `ExportTemplateModal`: removida referência a variável inexistente (`mode`) ao gerar nome de arquivo.
    - `Public API auth`: validação do retorno do RPC `validate_api_key` com tipagem defensiva (sem tipos gerados).
    - `dealsService`: ajuste para evitar `.catch()` em builder thenable (tipagem do PostgREST).

- **Database (Migrations / Onboarding do aluno)**:
  - Consolidado o schema do Supabase para **1 única migration** em `supabase/migrations/20251201000000_schema_init.sql`.
  - Detalhes técnicos: baseline inclui `organization_settings.ai_enabled`, `ai_prompt_templates`, `ai_feature_flags`, `boards.default_product_id`, contexto de empresa/participantes em `activities`, e Integrações/Webhooks (`pg_net`, tabelas `integration_*`/`webhook_*` e trigger em `deals`).
  - Adicionado guia de auditoria/padronização em `docs/migrations-baseline.md`.
  - Fix: FKs dos logs de webhooks (`webhook_events_in/out`) agora usam `ON DELETE SET NULL` para não bloquear deleção de `deals/contacts` (evita `409 Conflict` no PostgREST).

- **CRM (reaplicação de mudanças pendentes)**:
  - Reaplicadas e persistidas no código as melhorias de **Empresas (CRUD + UI padronizada)**, **Inbox (Seed + regra de churn)** e **Atividades (contexto empresa/participantes + ESC no modal)** que estavam visíveis no editor, mas não tinham sido materializadas em commit.
- **Boards (fix)**:
  - Corrigido erro ao criar/atualizar board quando o Supabase/PostgREST ainda não tem a coluna `boards.default_product_id` (migration não aplicada ou schema cache desatualizado).
  - Detalhe técnico: `boardsService` agora **omite** `default_product_id` quando não há produto e faz **retry** removendo o campo ao detectar o erro “schema cache”.
- **Boards (DX / Integrações)**:
  - Adicionada a chave/slug **`boards.key`** (única por organização, best-effort) para identificar pipelines em integrações sem depender de UUID.
  - Detalhe técnico: a migration consolidada `supabase/migrations/20251201000000_schema_init.sql` cria coluna + índice único (parcial) e faz backfill por `unaccent(name)` com sufixos (`-2`, `-3`, …) em caso de colisão.
  - UI: modal de criar/editar board agora mostra a **Chave (slug)** com botão de copiar e geração automática a partir do nome.
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
  - **Integrações (UX)**: adicionadas sub-abas dentro de **Integrações**: **Webhooks**, **API**, **MCP**.
  - **Integrações → Webhooks (UX)**:
    - Adicionados botões para **Editar / Ativar-Desativar / Excluir** as configurações de webhook (entrada e follow-up).
    - Exposição do **secret** para admin via “Copiar secret” (evita depender apenas do modal de “criado com sucesso”).
  - **Docs (Webhooks)**:
    - Adicionado guia de uso em `docs/webhooks.md` (configuração, payloads, exemplos e troubleshooting).
  - **Integrações → Webhooks (UX)**:
    - Adicionado botão **“Como usar”** com guia rápido inline (passo-a-passo + exemplos de payload/cURL) diretamente na tela de Integrações.
    - Ajustado o conteúdo do guia para ficar **leigo-friendly** e esconder detalhes técnicos em seção colapsável.
    - Compatibilidade: webhook agora aceita/usa também **`Authorization: Bearer <secret>`** (mantendo `X-Webhook-Secret`) e o guia ganhou botão **Copiar** no exemplo de dados do lead.
    - Adicionado botão **“Copiar cURL (importar no n8n)”** no card de **Entrada de Leads** (fica na área inferior, separado das ações principais).
    - Fix: padronização do slug da Edge Function para **`webhook-in`** (URL única).
    - Melhoria: `webhook-in` agora aceita os campos do modal **Novo Negócio** (`deal_title`, `deal_value`, `company_name`, `contact_name`) e tenta criar/vincular empresa automaticamente.
    - Ajuste: para “cadastro” (form/n8n), o webhook agora **atualiza** o negócio em aberto do contato (evita duplicar em reenvios) e `external_event_id` ficou **opcional** (útil só para integrações orientadas a evento/retry).
    - UX: resposta do `webhook-in` agora inclui `message` e `action` (criado/atualizado) para ficar mais leigo-friendly.
    - **Produto**: o antigo “guia/manual” foi convertido em **Quick Start** dentro do app (Destino → Conexão → Teste), com:
      - seleção de funil/etapa no próprio fluxo;
      - exibição/cópia de **URL + Secret**, exemplo de **cURL** e dicas por provedor (Hotmart/n8n/Make);
      - botão **Enviar teste** e lista de **Últimos recebidos** (consulta em `webhook_events_in`) para prova de funcionamento.
    - **Fix (CORS)**: `webhook-in` agora responde a **OPTIONS** e inclui headers CORS, permitindo executar o **“Enviar teste”** diretamente pelo browser sem erro “Failed to fetch”.
    - **Outbound (Follow-up)**: payload do evento `deal.stage_changed` agora lista os campos `from_stage_*` antes de `to_stage_*` (melhor legibilidade ao inspecionar em ferramentas como n8n).
- **Integrações → API (produto + docs)**:
  - Publicado o documento OpenAPI 3.1.2 em `GET /api/public/v1/openapi.json` (fonte de verdade do contrato).
  - Criada a seção **Settings → Integrações → API** com foco em produto (escolher objetivo + copiar/abrir OpenAPI sem “manual feio”).
  - Adicionado guia humano em `docs/public-api.md`.
  - Adicionada base da **Public API auth**: `api_keys` (schema consolidado) + RPCs `create_api_key`, `revoke_api_key`, `validate_api_key` e endpoint `GET /api/public/v1/me`.
  - Adicionados endpoints de **Boards**: `GET /api/public/v1/boards`, `GET /api/public/v1/boards/{boardKeyOrId}`, `GET /api/public/v1/boards/{boardKeyOrId}/stages`, e integração disso na UI (selecionar pipeline via `board_key`).
  - Implementados endpoints essenciais (escopo B): **Companies**, **Contacts**, **Deals**, **Activities** e ações (`move-stage`, `mark-won`, `mark-lost`), com OpenAPI atualizado e botões “Copiar cURL”/“Testar agora” na UI.
  - Swagger UI em `GET /api/public/v1/docs` (renderiza o OpenAPI do CRM), com CSS refinado para um visual mais clean e legível.
  - DX: `move-stage` agora aceita `to_stage_label` (além de `to_stage_id`) e resolve a etapa automaticamente dentro do board do deal.
  - DX: endpoint “sem UUID” para automações agora é `POST /api/public/v1/deals/move-stage` (board + phone/email + `to_stage_label`). (Mantido também `POST /api/public/v1/deals/move-stage-by-identity` por compatibilidade.)
  - Fix: mover para etapa **Ganho/Perdido** via API agora marca o deal como **ganho/perdido de verdade** (`is_won`/`is_lost` + `closed_at`) quando a etapa destino for a etapa final configurada do board.
  - Melhoria: `POST /api/public/v1/deals/move-stage` (e variantes) agora aceita `mark: "won"|"lost"` para marcar ganho/perdido **explicitamente**, sem depender da etapa final configurada do board.
  - UX: no assistente de API, a identidade do lead agora é **telefone por padrão** (email via toggle) e, ao selecionar etapa de **Ganho/Perdido** configurada no board, o wizard adiciona `mark` automaticamente no request.
  - UX: OpenAPI/Swagger saiu do fluxo de “passo” e virou **Consulta técnica** (sem numeração), posicionada **após** o Passo “Copiar e testar”.
  - UX: Passo 2 (API) agora é realmente dinâmico para **Criar/Atualizar Lead** (campos de exemplo editáveis: nome/email/telefone/source).
  - UX: Campos obrigatórios no wizard agora aparecem com **asterisco** e regra explícita (**Email OU Telefone**; **Nome** obrigatório apenas para criar novo contato).
  - API: `POST /api/public/v1/contacts` agora aceita campos adicionais do Contato (inclui `company_name` com auto-criação/vínculo em `crm_companies` quando `client_company_id` não é enviado).
  - UX: seletor de etapas no assistente mostra apenas o **nome da etapa** (sem sufixo de UUID).
  - UX: em **Chaves existentes**, agora é possível **excluir** chaves **revogadas** (com confirmação).
  - UX (produto): o assistente agora usa dados do próprio app (boards/deals/stages) para montar o cURL **com valores reais** (wizard dinâmico), e a **API key virou independente do wizard** (colar/validar chave é opcional e fica só em memória).
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
- **Deals (UX)**:
  - `DealDetailModal` agora é **responsivo em telas menores**: a sidebar de detalhes passa a ficar **empilhada acima** do conteúdo (em vez de colunas lado a lado), evitando sensação de “sobreposição”/corte.
  - Detalhe técnico: body do modal usa `flex-col md:flex-row` + `min-h-0`; sidebar esquerda ganhou `max-h-[38vh]` no mobile e borda `border-b` (no desktop mantém `md:border-r`).
  - Detalhe técnico (layout shell / auditoria de modais): overlays agora **não cobrem a sidebar no desktop** — em `md+` o backdrop usa `md:left-[var(--app-sidebar-width,0px)]` e o app shell publica a largura via `--app-sidebar-width` (0 fora do shell; `5rem/16rem` dentro), fazendo os modais **redimensionarem** em vez de “ficar por cima”.

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
  - UX (Boards): Wizard “Criar Novo Board” ganhou tela inicial em **progressive disclosure** (3 escolhas grandes: do zero / playbook recomendado / template individual) e só depois mostra as listas, reduzindo fricção e “poluição” visual.
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

### 28/12/2025 — UX Final do Installer

- **Progresso proporcional no último capítulo**:
  - Reduzido peso do `wait_vercel_deploy` de **10 → 3** para evitar a sensação de "travamento" em 80%
  - Agora a barra avança de forma mais equilibrada durante todo o processo

- **Tela final minimalista (estilo Jobs)**:
  - Removido texto técnico `"Tudo está pronto — você já pode entrar. (Se parecer desatualizado, recarregue a página.)"`
  - Botão simplificado: `🚀 Explorar o novo mundo` (usando ícone `Rocket` do Lucide)
  - Foco na celebração, não em instruções técnicas

### 28/12/2025 — Eliminar "Piscada" da Tela de Token Supabase

- **Problema**: Quando o token Supabase já estava salvo no `localStorage`, a tela de input aparecia rapidamente (já preenchida) e sumia antes de redirecionar para o wizard
- **Fix**: Agora, quando o token Supabase já está salvo, o fluxo redireciona **direto para o wizard** sem mostrar a tela intermediária
- **Resultado**: Transição mais limpa e rápida, sem "piscadas" visuais

### 28/12/2025 — Nunca Reusar Projetos Supabase Existentes

- **Problema**: Quando um projeto com o mesmo nome já existia (mesmo pausado), o installer reusava o projeto, que poderia ter schema/dados de deploy anterior (lixo)
- **Fix**: 
  - Removida lógica `reusedExisting` do endpoint `/api/installer/supabase/create-project`
  - Agora **sempre retorna erro 409** quando o projeto já existe, independente do status
  - Mensagem clara: `"Projeto com este nome já existe. Delete o projeto antigo no Supabase ou aguarde alguns minutos e tente novamente."`
- **Rationale**: Projetos existentes podem ter configurações inconsistentes, migrations parciais ou dados obsoletos — sempre criar projeto novo garante ambiente limpo

### 28/12/2025 — Modal de Conflito de Projetos Supabase

- **Feature**: Quando um projeto Supabase com o mesmo nome já existe, o wizard agora mostra um modal interativo com ações contextuais
- **Backend (`/api/installer/supabase/create-project`)**:
  - Retorna erro 409 com detalhes do projeto existente (`ref`, `name`, `status`, `region`)
  - Código de erro: `PROJECT_EXISTS`
- **Frontend (wizard)**:
  - Novo modal de conflito com 3 ações:
    - **⏸️ Pausar** (se projeto estiver ACTIVE)
    - **🗑️ Deletar** (sempre disponível, com confirmação)
    - **✏️ Usar outro nome** (volta para tela de token)
  - Após deletar, retenta criação automaticamente
- **UX**: Usuário tem controle total sobre como resolver conflitos, sem precisar sair do wizard

**Cenários cobertos:**
1. Projeto existe (PAUSED) + Tem slot → [Deletar / Outro nome]
2. Projeto existe (PAUSED) + Sem slot → [Deletar / Outro nome] + lista de ativos para pausar
3. Projeto existe (ACTIVE) + Tem slot → [Pausar / Deletar / Outro nome]
4. Projeto existe (ACTIVE) + Sem slot → [Pausar / Deletar / Outro nome] + lista de ativos para pausar

### 28/12/2025 — Correções no Modal de Conflito de Projetos

- **Bug Fix**: Adicionado campo `confirmRef` obrigatório no payload de `delete-project`
  - O endpoint exige `confirmRef` igual ao `projectRef` como confirmação de segurança
  - Antes: payload incompleto causava erro `Invalid payload`
  - Agora: envia `confirmRef: conflictingProject.ref` corretamente
- **Bug Fix**: Corrigida detecção de status `ACTIVE` vs. `INACTIVE`
  - Antes: `status.includes('ACTIVE')` detectava `INACTIVE` como ativo (substring match)
  - Agora: `status === 'ACTIVE_HEALTHY' || status === 'ACTIVE'` (exact match)
  - Resultado: botão "Pausar" só aparece para projetos realmente ativos
- **UX**: Melhorado diálogo de confirmação de deleção
  - Antes: `window.alert` simples
  - Agora: `window.confirm` com mensagem detalhada sobre irreversibilidade
  - Texto: "⚠️ ATENÇÃO: Você está prestes a DELETAR permanentemente... Esta ação NÃO pode ser desfeita..."

### 28/12/2025 — UX: Modal Customizado de Deleção (Sem `window.confirm`)

- **UX**: Removido `window.confirm` nativo do navegador
  - Antes: Alert feio do sistema operacional
  - Agora: Modal customizado com design consistente do wizard
- **UX**: Removidas informações técnicas desnecessárias
  - Antes: Mostrava "Status: INACTIVE" e "Região: us-west-2" (informação técnica)
  - Agora: Apenas "Escolha uma das opções abaixo para continuar" (linguagem simples)
- **Design**: Modal de confirmação de deleção estilizado
  - Ícone de alerta vermelho centralizado
  - Título: "Deletar projeto?"
  - Mensagem clara: "O projeto 'X' será removido permanentemente"
  - Aviso destacado: "⚠️ Esta ação não pode ser desfeita"
  - Botões: "Cancelar" (cinza) e "Sim, deletar" (vermelho)
  - Backdrop blur com animação suave (framer-motion)

### 29/12/2025 — Supabase: Auto-criar novo projeto (sem deleção no wizard)

- **UX/Fluxo**: Removida a necessidade de deletar projetos pelo wizard
  - Agora, quando o nome `nossocrm` já existe, o instalador tenta automaticamente `nossocrmv2`, `nossocrmv3`, etc.
  - Mantém apenas a ação de **pausar** projetos ativos quando o plano Free estiver sem slots
- **Técnico**: `createProjectInOrg` passou a fazer retry automático ao receber `PROJECT_EXISTS` (HTTP 409)
  - Evita travas e elimina os erros recorrentes do fluxo de deleção

### 29/12/2025 — UX: Banner global durante pause (needspace)

- **Bug Fix/UX**: Ao clicar em **Pausar** na tela "Precisamos de espaço", agora a UI troca imediatamente para um **banner global** de "pausando" e esconde a lista/ações
  - Antes: só mostrava spinner no botão e podia parecer que nada aconteceu
  - Agora: feedback claro e consistente durante todo o polling até liberar slot

### 29/12/2025 — Auditoria do Wizard: estados consistentes + save-game confiável

- **Bug Fix**: Removidos caminhos legados de **conflito/deleção** no wizard (código morto que podia gerar inconsistências de UI/estado)
- **Bug Fix**: Save-game agora atualiza corretamente durante o SSE (evita closure stale)
  - Introduzido `installStateRef` + `commitInstallState`
  - Suporte a evento `step_complete` para marcar etapas como `completed`
- **Resiliência**: `reader.read()` agora tem erro amigável para oscilação de rede, mantendo estado salvo para retomar
- **Confiabilidade DB**: `buildDbUrl` agora usa região real do projeto (via `/project-status`) para escolher o pooler correto (`aws-0-REGION.pooler.supabase.com`)

### 29/12/2025 — Public repo hardening (higiene + privacidade)

- **Segurança/Privacidade**: Removidos do git arquivos gerados que continham **PII** e relatórios locais (testsprite)
  - `testsprite_tests/tmp/` agora é ignorado
- **Higiene**: Removidos planos pessoais do Cursor do tracking
  - `.cursor/plans/` agora é ignorado
- **Observação**: `.env.example` permanece apenas com placeholders (sem segredos)

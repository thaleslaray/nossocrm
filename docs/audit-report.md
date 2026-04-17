# NossoCRM — Relatório de Auditoria
Data: 2026-04-17 | Branch: feature/004-goal-oriented-agent | Modo: completo

## Sumário Executivo
- 🔴 Crítico: 7 violações
- 🟡 Médio: 4 violações
- 🟢 Baixo: 3 violações
- Total de arquivos auditados: ~400+ (lib/, app/, features/, components/, context/, supabase/)

---

## 🔴 Crítico

### 1. sanitizeIncomingMessage() ausente em entry points AI
**Domínio**: AI SDK  
**Regra**: Todo conteúdo de mensagem de usuário/lead DEVE ser sanitizado via `sanitizeIncomingMessage()` antes de ser passado ao LLM. Conteúdo não sanitizado permite prompt injection.  
**Ocorrências**:
- `app/api/ai/actions/route.ts:236-355` — funções analyzeLead, generateEmailDraft, rewriteMessageDraft, generateBoardStructure passam conteúdo direto ao LLM
- `app/api/ai/board-config/generate-goal/route.ts:58` — sem sanitização
- `app/api/ai/tasks/boards/generate-strategy/route.ts:40` — sem sanitização
- `app/api/ai/tasks/boards/generate-structure/route.ts:52` — sem sanitização
- `app/api/ai/tasks/boards/refine/route.ts:45` — sem sanitização
- `app/api/ai/tasks/deals/analyze/route.ts:46` — sem sanitização
- `lib/ai/agent/generate-prompts.service.ts:126` — sem sanitização

**Fix**:
```typescript
// ANTES (errado)
const messages = conversationHistory.map(msg => ({
  role: msg.direction === 'inbound' ? 'user' : 'assistant',
  content: msg.content
}))

// DEPOIS (correto)
import { sanitizeIncomingMessage } from '@/lib/ai/utils/input-filter'
const messages = conversationHistory.map(msg => ({
  role: msg.direction === 'inbound' ? 'user' : 'assistant',
  content: msg.direction === 'inbound'
    ? sanitizeIncomingMessage(msg.content)
    : msg.content
}))
```

---

### 2. SECURITY_PREAMBLE ausente em entry points AI
**Domínio**: AI SDK / Segurança  
**Regra**: Qualquer rota/serviço que passe mensagens de usuários ao LLM deve incluir o `SECURITY_PREAMBLE` no system prompt.  
**Ocorrências** (mesmos arquivos da violação anterior):
- `app/api/ai/actions/route.ts:236-355` — sem SECURITY_PREAMBLE
- `app/api/ai/board-config/generate-goal/route.ts:58` — sem SECURITY_PREAMBLE
- `app/api/ai/tasks/boards/generate-strategy/route.ts:40` — sem SECURITY_PREAMBLE
- `app/api/ai/tasks/boards/generate-structure/route.ts:52` — sem SECURITY_PREAMBLE
- `app/api/ai/tasks/boards/refine/route.ts:45` — sem SECURITY_PREAMBLE
- `app/api/ai/tasks/deals/analyze/route.ts:46` — sem SECURITY_PREAMBLE
- `lib/ai/agent/generate-prompts.service.ts:59-83` — buildMetaPrompt() não inclui preamble

**Nota**: `lib/ai/agent/agent.service.ts` implementa corretamente. Os entry points adicionados depois não propagaram o padrão.

**Fix**:
```typescript
// ANTES (errado — sem preamble de segurança)
const result = await generateText({
  model,
  messages: [{ role: 'user', content: userInput }],
  ...
})

// DEPOIS (correto — importar e incluir)
import { SECURITY_PREAMBLE } from '@/lib/ai/agent/agent.service'
const result = await generateText({
  model,
  system: SECURITY_PREAMBLE,
  messages: [{ role: 'user', content: sanitizeIncomingMessage(userInput) }],
  ...
})
```

---

### 3. ai_conversation_log ausente em 20+ arquivos
**Domínio**: AI SDK  
**Regra**: Toda chamada ao LLM deve ser logada em `ai_conversation_log` com `org_id`, `deal_id`, `action_taken`, `tokens_used`, `model_used`.  
**Ocorrências**: Todos os arquivos com `generateText` exceto `lib/ai/agent/agent.service.ts`:
- `app/api/ai/actions/route.ts` — sem log
- `app/api/ai/board-config/generate-goal/route.ts` — sem log
- `app/api/ai/tasks/boards/generate-strategy/route.ts` — sem log
- `app/api/ai/tasks/boards/generate-structure/route.ts` — sem log
- `app/api/ai/tasks/boards/refine/route.ts` — sem log
- `app/api/ai/tasks/deals/analyze/route.ts` — sem log
- `lib/ai/agent/generate-prompts.service.ts` — sem log
- (e demais arquivos com generateText)

**Fix**:
```typescript
const result = await generateText({ model, messages, ... })

// Adicionar após cada chamada
await supabase.from('ai_conversation_log').insert({
  org_id: orgId,
  deal_id: dealId ?? null,
  action_taken: 'generate_board_structure',
  tokens_used: result.usage?.totalTokens ?? 0,
  model_used: modelId,
})
```

---

### 4. modelId sem whitelist em getModel()
**Domínio**: AI SDK  
**Regra**: `getModel()` aceita qualquer string como `modelId` sem validação. Se o valor vier do banco (`organization_settings`), um registro comprometido pode injetar qualquer string.  
**Ocorrências**:
- `lib/ai/config.ts:45` — getModel() sem whitelist de modelId

**Fix**:
```typescript
const ALLOWED_MODELS = {
  google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.0-pro-exp'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
} as const

export const getModel = (provider: AIProvider, apiKey: string, modelId: string) => {
  if (!apiKey) throw new Error('API Key is missing')
  const allowed = ALLOWED_MODELS[provider] as readonly string[]
  const safeModelId = allowed.includes(modelId) ? modelId : AI_DEFAULT_MODELS[provider]
  // ... resto da implementação
}
```

---

### 5. server-only ausente em staticAdminClient.ts
**Domínio**: Next.js 16  
**Regra**: Módulos que expõem credenciais server-side devem ter `import 'server-only'` para prevenir importação acidental em client components.  
**Ocorrências**:
- `lib/supabase/staticAdminClient.ts:1` — sem `import 'server-only'` (arquivo usa SUPABASE_SECRET_KEY)

**Nota**: `lib/supabase/server.ts` implementa corretamente.

**Fix**:
```typescript
// DEPOIS (adicionar na linha 1)
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
```

---

### 6. Imports diretos de subcaminhos Supabase (barrel violation)
**Domínio**: Supabase  
**Regra**: Sempre importar de `@/lib/supabase` (barrel), nunca de subcaminhos diretamente.  
**Ocorrências** (22 arquivos):
- `lib/public-api/dealsMoveStage.ts:1` — `from '@/lib/supabase/server'`
- `lib/public-api/resolve.ts:1` — `from '@/lib/supabase/server'`
- `lib/mcp/tools/messaging.ts:4` — `from '@/lib/supabase/staticAdminClient'`
- `lib/mcp/tools/admin.ts:4` — `from '@/lib/supabase/staticAdminClient'`
- `lib/mcp/tools/ai.ts:4` — `from '@/lib/supabase/staticAdminClient'`
- `lib/mcp/tools/contacts-advanced.ts:4` — `from '@/lib/supabase/staticAdminClient'`
- `lib/mcp/tools/simulation.ts:15` — `from '@/lib/supabase/staticAdminClient'`
- `lib/consent/consentService.ts:12` — `from '@/lib/supabase/client'`
- `lib/ai/tasks/server.ts:3` — `from '@/lib/supabase/server'`
- `lib/ai/tools.ts:3` — `from '@/lib/supabase/staticAdminClient'`
- `lib/query/hooks/useMessagingConversationsQuery.ts:17` — `from '@/lib/supabase/client'`
- `lib/query/hooks/useChannelsQuery.ts:11` — `from '@/lib/supabase/client'`
- `lib/query/hooks/useMessagingMessagesQuery.ts:18` — `from '@/lib/supabase/client'`
- `lib/query/hooks/useMessagingChannelsQuery.ts:16` — `from '@/lib/supabase/client'`
- `lib/query/hooks/useBusinessUnitsQuery.ts:16` — `from '@/lib/supabase/client'`
- `lib/query/hooks/useAIConfigQuery.ts:13` — `from '@/lib/supabase/client'`
- `lib/messaging/channel-router.service.ts:25` — `from '@/lib/supabase/server'`
- `app/auth/callback/route.ts:1` — `from '@/lib/supabase/server'`
- `app/(protected)/settings/actions.ts:4` — `from '@/lib/supabase/server'`
- `app/(protected)/settings/ai/actions.ts:4` — `from '@/lib/supabase/server'`
- (+ mais arquivos)

**Fix**:
```typescript
// ANTES (errado)
import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient'

// DEPOIS (correto)
import { supabase, createClient, createStaticAdminClient } from '@/lib/supabase'
```

---

### 7. store/uiState.ts fora de lib/stores/ (duplicata arquitetural)
**Domínio**: Zustand v5  
**Regra**: Todos os stores Zustand devem residir em `lib/stores/`. Stores fora desse diretório fragmentam o estado e duplicam responsabilidades.  
**Ocorrências**:
- `store/uiState.ts:1` — `useUIState` criado fora de `lib/stores/`, sem devtools, sem subscribeWithSelector, duplicando estado com `lib/stores/index.ts` (que já tem `useUIStore` com aiAssistantOpen, sidebarCollapsed, etc.)

**Fix**: Migrar usage de `useUIState` → `useUIStore` de `lib/stores/index.ts` e deletar `store/uiState.ts`.

---

## 🟡 Médio

### 1. invalidateQueries/cancelQueries com `.all` (55 ocorrências)
**Domínio**: TanStack Query  
**Regra**: Nunca invalidar com `.all` — invalida caches inteiros causando refetch desnecessário. Usar a key mais específica possível ou `setQueryData`.  
**Ocorrências** (55 hits confirmados):
- `lib/query/hooks/useMoveDeal.ts:247` — `cancelQueries({ queryKey: queryKeys.deals.all })`
- `lib/query/hooks/useBoardsQuery.ts:103,136,154,170,188,204,206,224,225,260,278,296,308` — `.boards.all` e `.deals.all`
- `lib/query/hooks/useContactsQuery.ts:249,266,329,348,375,395` — `.contacts.all`
- `lib/query/hooks/useDealsQuery.ts:243,358,434,482,553,664` — `.deals.all`
- `lib/query/hooks/useActivitiesQuery.ts:147,188,197,215,230,267` — `.activities.all`
- `lib/query/hooks/useProductsQuery.ts:64,85,100` — `.products.all`
- `lib/query/hooks/useDuplicateContactsQuery.ts:83,89` — `.contacts.all`, `.activities.all`

**Fix**:
```typescript
// ANTES (errado — invalida tudo)
queryClient.invalidateQueries({ queryKey: queryKeys.deals.all })

// DEPOIS (correto — targeted)
queryClient.invalidateQueries({ queryKey: queryKeys.deals.lists() })
// ou para deals, preferir setQueryData via DEALS_VIEW_KEY
import { DEALS_VIEW_KEY } from '@/lib/query/queryKeys'
queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, updater)
```

---

### 2. Zod v4 — API v3 (58 ocorrências)
**Domínio**: Zod v4  
**Regra**: No Zod v4, os validators de string viraram top-level. `z.string().uuid()` → `z.uuid()`, etc.  
**Ocorrências** (58 hits em 10+ arquivos):
- `lib/mcp/tools/messaging.ts:120,121,159,205,283,323,355` — `z.string().uuid()`
- `lib/mcp/tools/admin.ts:93` — `z.string().uuid()`
- `lib/mcp/tools/ai.ts:89,218` — `z.string().uuid()`
- `lib/mcp/tools/contacts-advanced.ts:99,100,219` — `z.string().uuid()`, `z.string().email()`
- `lib/ai/agent/secure-tools.ts:123,124,140,145` — `z.string().uuid()`
- `lib/ai/agent/hitl-stage-advance.ts:30,32,34` — `z.string().uuid()`
- (+ outros arquivos)

**Fix**:
```typescript
// ANTES (Zod v3)
z.string().uuid()
z.string().email()
z.string().url()

// DEPOIS (Zod v4)
z.uuid()
z.email()
z.url()
```

---

### 3. .single() em lookups que podem retornar 0 rows
**Domínio**: Supabase  
**Regra**: Usar `.maybeSingle()` para lookups que podem retornar 0 rows. `.single()` lança PGRST116 se não encontrar.  
**Ocorrências** (20+ hits em vários arquivos):
- `lib/supabase/consent.ts:77` — `hasConsent()` busca consent que pode não existir
- `lib/mcp/tools/simulation.ts:108,133,160,181` — lookups que podem não encontrar registro
- `lib/supabase/consents.ts:95` — lookup de consent
- `lib/supabase/boards.ts:822` — lookup de board por critério
- `lib/supabase/dealNotes.ts:50` — lookup de note
- `lib/supabase/settings.ts:240` — lookup de settings
- `lib/supabase/deals.ts:408,533` — lookups de deals
- `lib/supabase/contacts.ts:448,671` — lookups de contacts
- `lib/supabase/products.ts:124` — lookup de product
- (+ outros)

**Fix**:
```typescript
// ANTES (errado — lança erro se não encontrar)
.eq('consent_type', type).is('revoked_at', null).single()

// DEPOIS (correto — retorna null se não existir)
.eq('consent_type', type).is('revoked_at', null).maybeSingle()
```

---

### 4. 'use client' em páginas (6 ocorrências)
**Domínio**: Next.js 16  
**Regra**: `'use client'` deve estar no menor componente possível. Em páginas inteiras, quebra o Server Components tree desnecessariamente.  
**Ocorrências**:
- `app/install/wizard/page.tsx`
- `app/install/start/page.tsx`
- `app/install/page.tsx`
- `app/(app)/test/ai-modes/page.tsx`
- `app/(protected)/setup/page.tsx`
- `app/login/page.tsx`

**Ação**: Avaliar se cada página realmente precisa de estado client-side em nível de página, ou se `'use client'` pode ser movido para componentes filhos específicos.

---

## 🟢 Baixo

### 1. subscribeWithSelector ausente em useFormStore e useNotificationStore
**Domínio**: Zustand v5  
**Regra**: Stores com estado granular devem usar `subscribeWithSelector` para re-renders otimizados.  
**Ocorrências**:
- `lib/stores/index.ts:177` — `useFormStore` sem subscribeWithSelector
- `lib/stores/index.ts:273` — `useNotificationStore` sem subscribeWithSelector

**Nota**: `useUIStore` implementa corretamente com subscribeWithSelector.

---

### 2. Typed selectors ausentes em useFormStore e useNotificationStore
**Domínio**: Zustand v5  
**Regra**: Selectors devem ter tipos explícitos para evitar inferência incorreta.  
**Ocorrências**:
- `lib/stores/index.ts:320-324` — useFormStore sem selector exports tipados
- `lib/stores/index.ts:326-327` — useNotificationStore com apenas 1 selector

**Fix**:
```typescript
// Adicionar selectors tipados para useFormStore
export const useFormDraft = (formId: string) =>
  useFormStore(state => state.drafts[formId] ?? null)
export const useFormDirty = (formId: string) =>
  useFormStore(state => state.dirty[formId] ?? false)
```

---

### 3. staleTime não configurado em hooks de settings/templates
**Domínio**: TanStack Query  
**Regra**: Queries de dados que mudam pouco (settings, templates) devem ter `staleTime` para evitar refetch desnecessário.  
**Ação**: Revisar hooks de settings e templates em `lib/query/hooks/` e adicionar `staleTime: 5 * 60 * 1000` (5min) onde adequado.

---

## Arquivos/domínios limpos

- ✅ `generateObject` — nenhuma ocorrência (API antiga não usada)
- ✅ Prompt injection em `agent.service.ts` — SECURITY_PREAMBLE + sanitização corretos
- ✅ Webhook HMAC — `messaging-webhook-meta` implementa verificação com constant-time comparison
- ✅ AI API keys — corretamente no banco (`organization_settings`), não em env vars
- ✅ Metadata JSONB — merge com spread operator em todos os pontos verificados
- ✅ `SUPABASE_SECRET_KEY` — não vazada em features/ ou components/
- ✅ Logging sensível — nenhum log de API keys, tokens ou PII
- ✅ `DEALS_VIEW_KEY` — mutations de deals usam corretamente como SSOT
- ✅ Query Keys inline — todas as queries usam o factory `queryKeys.*`
- ✅ `proxy.ts` — padrão Next.js 16 correto, `middleware.ts` ausente (correto)
- ✅ Route Handlers com redirect — nenhum `redirect('/login')` em `/api/`
- ✅ `NEXT_PUBLIC_*` em secrets — nenhum vazamento
- ✅ Estado servidor em Zustand — nenhum store com async fetch de dados
- ✅ immer middleware — não necessário (state é flat/shallow)
- ✅ Migrations — 45 migrations com timestamps corretos
- ✅ Imports relativos longos — padrão `@/` usado consistentemente
- ✅ Zod v4 mensagens de erro — sem uso de `invalid_type_error`/`required_error`

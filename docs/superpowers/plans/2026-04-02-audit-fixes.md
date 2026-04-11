# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir todos os problemas identificados na auditoria de qualidade do NossoCRM em três domínios: TanStack Query, Supabase, e Next.js/React.

**Architecture:** Três domínios independentes executados sequencialmente. Cada domínio tem suas próprias tasks. Sem mudanças de feature — só correções de padrão e qualidade.

**Tech Stack:** Next.js 16, React 19, TanStack Query v5, Supabase, TypeScript

---

## Contexto da Auditoria

Stack: Next.js 16 App Router, React 19, TanStack Query v5, Supabase, Zustand, Tailwind 4.

O QueryClient em `lib/query/index.tsx` JÁ tem `staleTime: 5min` e `gcTime: 30min` como defaults globais. Hooks que não declaram `staleTime` explicitamente herdam o global — isso é correto.

---

## Domínio 1 — TanStack Query

### Task 1.1: Migrar `onSuccess` → `onSettled` em 12 hooks de mutations

**Problema:** `onSuccess` não executa quando a mutation falha. Se a network cair após o `mutate()`, a query nunca é invalidada e o cache fica stale silenciosamente. `onSettled` executa em AMBOS os casos (sucesso e erro).

**Regra:** A lógica de `invalidateQueries` deve estar em `onSettled`, não em `onSuccess`.

**Exceção válida:** Se o `onSuccess` faz algo que DEPENDE do resultado bem-sucedido (ex: usar `data` para atualizar outro cache com o ID retornado), pode coexistir com `onSettled` para a invalidação.

**Arquivos a modificar:**
- `lib/query/hooks/useAIConfigQuery.ts`
- `lib/query/hooks/useBusinessUnitsQuery.ts`
- `lib/query/hooks/useChannelsQuery.ts`
- `lib/query/hooks/useDuplicateContactsQuery.ts`
- `lib/query/hooks/useLeadRoutingRulesQuery.ts`
- `lib/query/hooks/useLearnedPatternsQuery.ts`
- `lib/query/hooks/useMessagingChannelsQuery.ts`
- `lib/query/hooks/useMessagingConversationsQuery.ts`
- `lib/query/hooks/useMessagingMessagesQuery.ts`
- `lib/query/hooks/usePendingAdvancesQuery.ts`
- `lib/query/hooks/useStageAIConfigQuery.ts`
- `lib/query/hooks/useTemplatesQuery.ts`

**Padrão de migração:**

ANTES (buggy — não invalida em caso de erro):
```ts
useMutation({
  mutationFn: ...,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.channels.all });
  },
})
```

DEPOIS (correto):
```ts
useMutation({
  mutationFn: ...,
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.channels.all });
  },
})
```

Caso onde `onSuccess` usa `data` (manter ambos):
```ts
useMutation({
  mutationFn: ...,
  onSuccess: (data) => {
    // usa data.id — mantém onSuccess
    queryClient.setQueryData(queryKeys.channels.detail(data.id), data);
  },
  onSettled: () => {
    // invalidação vai para onSettled
    queryClient.invalidateQueries({ queryKey: queryKeys.channels.all });
  },
})
```

- [ ] **Step 1: Ler e modificar `useAIConfigQuery.ts`**

  Ler o arquivo completo. Localizar todas as mutations com `onSuccess` que chamam `invalidateQueries`. Mover a chamada de invalidação para `onSettled`. Se o `onSuccess` usa `data` além de invalidar, criar `onSettled` para a invalidação e manter `onSuccess` só com a lógica que depende de `data`.

- [ ] **Step 2: Ler e modificar `useBusinessUnitsQuery.ts`**

  Mesma operação — 5 mutations com `onSuccess` apenas.

- [ ] **Step 3: Ler e modificar `useChannelsQuery.ts`**

  4 mutations. Atenção: algumas passam `data` para invalidar o detail (ex: `queryKeys.messagingChannels.detail(data.id)`). Nesse caso:
  - Mover `invalidateQueries({ queryKey: queryKeys.messagingChannels.all })` para `onSettled`
  - Mover `invalidateQueries({ queryKey: queryKeys.messagingChannels.detail(data.id) })` para `onSettled` também — `onSettled` recebe `(data, error, variables)` então `data` está disponível

  Assinatura de `onSettled`: `onSettled: (data, error, variables, context) => { ... }`

- [ ] **Step 4: Ler e modificar `useDuplicateContactsQuery.ts`**

  1 mutation.

- [ ] **Step 5: Ler e modificar `useLeadRoutingRulesQuery.ts`**

  3 mutations.

- [ ] **Step 6: Ler e modificar `useLearnedPatternsQuery.ts`**

  2 mutations.

- [ ] **Step 7: Ler e modificar `useMessagingChannelsQuery.ts`**

  4 mutations.

- [ ] **Step 8: Ler e modificar `useMessagingConversationsQuery.ts`**

  6 mutations. Cuidado: algumas passam `conversation` no `onSuccess`. Usar o mesmo padrão — mover invalidação para `onSettled`, manter lógica dependente de `data` no `onSuccess` se necessário.

- [ ] **Step 9: Ler e modificar `useMessagingMessagesQuery.ts`**

  3 mutations. Este arquivo tem optimistic updates (onMutate/onError/onSettled já presentes em algumas). Adicionar `onSettled` apenas às mutations que têm só `onSuccess`.

- [ ] **Step 10: Ler e modificar `usePendingAdvancesQuery.ts`**

  1 mutation.

- [ ] **Step 11: Ler e modificar `useStageAIConfigQuery.ts`**

  3 mutations. Algumas usam `data.board_id` e `data.stage_id` — mover invalidação para `onSettled` que também recebe `data`.

- [ ] **Step 12: Ler e modificar `useTemplatesQuery.ts`**

  2 mutations.

- [ ] **Step 13: TypeScript check**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && pnpm tsc --noEmit 2>&1 | head -30
  ```
  Esperado: zero erros.

- [ ] **Step 14: Commit**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && git add lib/query/hooks/ && git commit -m "fix(query): migrate invalidateQueries from onSuccess to onSettled in 12 hooks

  Ensures cache invalidation runs on both success and error.
  onSuccess-only invalidation silently skips on mutation failure.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 1.2: Corrigir raw string query keys

**Problema:** Dois hooks usam arrays literais de string em vez da factory `queryKeys.*`. Risco de typo e invalidação errada.

**Arquivos:**
- `lib/query/hooks/useSearchMessagesQuery.ts:37` → `['messagingMessages', 'search', conversationId, debouncedTerm]`
- `lib/query/hooks/useLearnedPatternsQuery.ts:38` → `['ai', 'learnedPatterns']`

**Arquivo de referência:** `lib/query/queryKeys.ts` — verificar quais keys existem para messaging e ai.

- [ ] **Step 1: Verificar keys disponíveis**

  ```bash
  grep -n "learnedPatterns\|messagingMessages\|search" lib/query/queryKeys.ts
  ```

  Se não existirem keys equivalentes, criá-las no `queryKeys.ts` antes de usar.

- [ ] **Step 2: Adicionar keys faltantes em `queryKeys.ts` (se necessário)**

  Abrir `lib/query/queryKeys.ts`. Se `queryKeys.messaging.search` ou equivalente não existir, adicionar seguindo o padrão:
  ```ts
  // dentro do objeto messaging ou ai
  search: (conversationId: string, term: string) =>
    createQueryKeys('messaging', 'search', conversationId, term),
  learnedPatterns: createQueryKeys('ai', 'learnedPatterns'),
  ```

- [ ] **Step 3: Substituir em `useSearchMessagesQuery.ts`**

  Trocar o array literal pelo `queryKey` da factory. Atualizar também qualquer `invalidateQueries` referenciando a mesma key.

- [ ] **Step 4: Substituir em `useLearnedPatternsQuery.ts`**

  Mesma operação. Verificar que as chamadas de `invalidateQueries` nas linhas 80 e 108 também são atualizadas.

- [ ] **Step 5: TypeScript check**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && pnpm tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && git add lib/query/ && git commit -m "fix(query): replace raw string query keys with queryKeys factory

  Eliminates typo risk and enables consistent cache invalidation.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Domínio 2 — Supabase

### Task 2.1: Auditar e corrigir `.single()` em lookups

**Problema:** `.single()` lança erro PGRST116 quando a query retorna 0 rows. Em lookups por ID (ex: buscar um board por ID), se o registro foi deletado ou não existe, o app crasha em vez de retornar `null`. `.maybeSingle()` retorna `null` graciosamente.

**Regra:**
- `.single()` → correto após `.insert()` ou quando a query DEVE retornar exatamente 1 row (PK lookup com certeza de existência)
- `.maybeSingle()` → correto em lookups onde o registro pode não existir

**Arquivos a auditar:**
- `lib/supabase/boards.ts` (linhas 50, 358, 432-445, 543, 820)
- `lib/supabase/products.ts` (linha 31)
- `lib/supabase/settings.ts` (linhas 269, 304)
- `lib/supabase/consents.ts` (linhas 44, 95, 124)
- `lib/supabase/aiSuggestions.ts` (linha 84)
- `lib/supabase/dealNotes.ts` (linhas 50, 67)
- `lib/supabase/dealFiles.ts` (linha 71)
- `lib/supabase/quickScripts.ts` (linhas 82, 100)

**Como auditar cada ocorrência:**
1. Ler o contexto ao redor da linha
2. Se é após `.insert(...)` ou `.upsert(...)` → manter `.single()` (insert sempre retorna a row criada)
3. Se é após `.select().eq('id', ...)` ou qualquer busca — trocar para `.maybeSingle()` e ajustar o código que consome o resultado para tratar `null`

**Ajuste de tipo após `.maybeSingle()`:**
```ts
// ANTES
const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
// data: Product — sempre assumido não-null

// DEPOIS
const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
// data: Product | null — tratar null
if (!data) return null; // ou throw, dependendo do contexto
```

- [ ] **Step 1: Auditar e corrigir `lib/supabase/boards.ts`**

  Ler o arquivo. Para cada ocorrência de `.single()`:
  - Linha 50: provavelmente um `select` por ID → `.maybeSingle()`
  - Linhas 432-445: dentro de retry de insert → manter `.single()` (insert)
  - Demais: avaliar contexto

- [ ] **Step 2: Auditar e corrigir `lib/supabase/products.ts`**

  Linha 31. Ler o contexto — se é busca por ID/slug, trocar para `.maybeSingle()`.

- [ ] **Step 3: Auditar e corrigir `lib/supabase/settings.ts`**

  Linhas 269 e 304.

- [ ] **Step 4: Auditar e corrigir `lib/supabase/consents.ts`**

  Linhas 44, 95, 124.

- [ ] **Step 5: Auditar e corrigir `lib/supabase/aiSuggestions.ts`**

  Linha 84.

- [ ] **Step 6: Auditar e corrigir arquivos restantes**

  - `lib/supabase/dealNotes.ts` (50, 67)
  - `lib/supabase/dealFiles.ts` (71)
  - `lib/supabase/quickScripts.ts` (82, 100)

- [ ] **Step 7: TypeScript check**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && pnpm tsc --noEmit 2>&1 | head -30
  ```

  Erros de tipo esperados: `.maybeSingle()` retorna `T | null`, código que assume `T` vai quebrar — corrigir cada um.

- [ ] **Step 8: Commit**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && git add lib/supabase/ && git commit -m "fix(supabase): replace .single() with .maybeSingle() in lookup queries

  .single() throws PGRST116 when row not found.
  .maybeSingle() returns null gracefully for optional lookups.
  insert().select().single() patterns preserved (always return 1 row).

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Domínio 3 — Next.js / React

### Task 3.1: Adicionar metadata às pages protegidas

**Problema:** 20 pages sem `metadata` export — tabs do browser mostram URL em vez de título descritivo.

**Observação:** Pages protegidas (atrás de auth) não são indexadas por SEO. O único benefício real aqui é UX de multi-tab. Prioridade baixa mas simples de implementar.

**Regra Next.js 16:** `metadata` deve ser export estático em Server Components. Pages com `'use client'` não podem exportar `metadata` diretamente — usar um Server Component wrapper ou o `generateMetadata` function.

**Verificação prévia:** Antes de adicionar metadata, verificar se a page é Server Component (sem `'use client'` na primeira linha).

**Pages a modificar (apenas Server Components sem `'use client'`):**

```bash
# Verificar quais são Server Components
grep -rL "'use client'" app/\(protected\)/*/page.tsx app/\(protected\)/page.tsx 2>/dev/null
```

**Padrão de metadata para pages protegidas:**
```ts
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard | NossoCRM',
};
```

- [ ] **Step 1: Identificar pages Server Component**

  ```bash
  grep -rL "'use client'" app/\(protected\)/*/page.tsx app/\(protected\)/page.tsx 2>/dev/null
  ```

- [ ] **Step 2: Adicionar metadata nas pages identificadas**

  Para cada page Server Component, adicionar no topo (após imports existentes):
  ```ts
  import type { Metadata } from 'next';
  export const metadata: Metadata = { title: '<Nome> | NossoCRM' };
  ```

  Títulos por page:
  - `/` (redirect page) → não precisa
  - `/dashboard` → `Dashboard | NossoCRM`
  - `/boards` → `Funis | NossoCRM`
  - `/contacts` → `Contatos | NossoCRM`
  - `/activities` → `Atividades | NossoCRM`
  - `/inbox` → `Inbox | NossoCRM`
  - `/decisions` → `Decisões | NossoCRM`
  - `/messaging` → `Mensagens | NossoCRM`
  - `/reports` → `Relatórios | NossoCRM`
  - `/pipeline` → `Pipeline | NossoCRM`
  - `/profile` → `Perfil | NossoCRM`
  - `/settings` → `Configurações | NossoCRM`
  - `/settings/ai` → `IA | Configurações | NossoCRM`
  - `/settings/integracoes` → `Integrações | NossoCRM`
  - `/settings/products` → `Produtos | NossoCRM`
  - `/ai` → `AI Hub | NossoCRM`
  - `/deals/[dealId]/cockpit` → usar `generateMetadata`

- [ ] **Step 3: Pages com `'use client'` — pular ou criar wrapper**

  Pages que têm `'use client'` na primeira linha não podem exportar `metadata`. Para estas, a opção mais simples é não adicionar metadata (baixa prioridade para pages protegidas). Registrar quais foram puladas.

- [ ] **Step 4: TypeScript check**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && pnpm tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && git add app/ && git commit -m "feat(next): add page metadata to protected routes

  Improves browser tab titles for multi-tab UX.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 3.2: dynamic() imports para modais pesados

**Problema:** Modais grandes são importados estaticamente, aumentando o bundle inicial da page mesmo quando o modal nunca abre nessa sessão.

**Candidatos a dynamic import (por tamanho/complexidade):**

Nos arquivos de feature:
- `features/contacts/ContactsPage.tsx` — importa `ContactFormModal`, `CompanyFormModal`, `ContactsImportExportModal`, `SelectBoardModal`
- `features/inbox/components/FocusContextPanel.tsx` — importa `CallModal`, `ScriptEditorModal`, `ScheduleModal`, `MessageComposerModal`

**Padrão Next.js:**
```ts
// ANTES
import { ContactFormModal } from './components/ContactFormModal';

// DEPOIS
import dynamic from 'next/dynamic';
const ContactFormModal = dynamic(
  () => import('./components/ContactFormModal').then(m => ({ default: m.ContactFormModal })),
  { ssr: false }
);
```

**Nota:** `ssr: false` é correto para modais que usam estado de browser (portals, focus traps).

- [ ] **Step 1: Converter imports de modais em `ContactsPage.tsx`**

  Ler o arquivo. Substituir os 4 imports de modal por `dynamic()`. Confirmar que os componentes exportam `default` ou usar `.then(m => ({ default: m.ModalName }))`.

- [ ] **Step 2: Converter imports de modais em `FocusContextPanel.tsx`**

  Ler o arquivo. Converter `CallModal`, `ScriptEditorModal`, `ScheduleModal`, `MessageComposerModal`.

- [ ] **Step 3: TypeScript check + verificar que modais ainda abrem**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && pnpm tsc --noEmit 2>&1 | head -20
  ```

  Verificar que os tipos das props dos modais ainda resolvem corretamente (dynamic imports preservam tipos quando `.then()` é usado corretamente).

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/thaleslaray/code/projetos/nossocrm && git add features/ && git commit -m "perf(bundle): lazy load heavy modals with dynamic imports

  Reduces initial bundle size for contacts and inbox pages.
  Modals load on first open, not on page load.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

## Ordem de Execução

```
Domínio 1 (TanStack Query)
  └─ Task 1.1: onSuccess → onSettled (12 hooks)    ← maior impacto
  └─ Task 1.2: raw string keys (2 hooks)           ← menor, independente

Domínio 2 (Supabase)
  └─ Task 2.1: .single() → .maybeSingle()         ← segurança

Domínio 3 (Next.js/React)
  └─ Task 3.1: metadata em pages                   ← UX simples
  └─ Task 3.2: dynamic() modais                    ← performance
```

## Verificação Final

```bash
cd /Users/thaleslaray/code/projetos/nossocrm
pnpm tsc --noEmit   # zero erros
pnpm next build     # build limpo
```

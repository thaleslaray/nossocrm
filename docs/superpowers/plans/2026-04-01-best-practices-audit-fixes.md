# Best Practices Audit Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade dependencies (fix 13 vulnerabilities including 1 critical), then fix all best-practices audit issues: deprecated AI SDK patterns, client boundary too high, and `.single()` safety.

**Architecture:** Four workstreams in order — (0) dependency upgrades and vulnerability fixes, (A) migrate `generateObject` → `generateText` + `Output.object()`, (B) push `'use client'` boundary down, (C) `.single()` → `.maybeSingle()` safety.

**Tech Stack:** AI SDK 6 (`ai` package), Next.js 16 App Router, Supabase JS v2

---

## Workstream 0: Dependency Upgrades & Vulnerability Fixes

13 vulnerabilities (1 critical, 5 high, 4 moderate, 3 low). Must be resolved first because Workstream A depends on the latest `ai` package API.

### Task 0.1: Auto-fix non-breaking vulnerabilities

**Files:**
- Modify: `package-lock.json`

- [ ] **Step 1: Run npm audit fix**

```bash
npm audit fix
```

This resolves: `ajv`, `brace-expansion`, `dompurify`, `flatted`, `minimatch`, `picomatch`, `rollup`, `nodemailer`.

- [ ] **Step 2: Verify audit results**

```bash
npm audit 2>&1 | tail -3
```

Expected: Remaining vulnerabilities should only be `jspdf`, `next`, `happy-dom`, `resend` (those need explicit upgrades).

- [ ] **Step 3: Commit**

```bash
git add package-lock.json
git commit -m "fix(deps): auto-fix 8+ vulnerabilities via npm audit fix"
```

### Task 0.2: Upgrade Next.js 16.1.6 → 16.2.2 (fixes 5 CVEs)

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Upgrade next and eslint-config-next**

```bash
npm install next@latest eslint-config-next@latest
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: 0 errors (patch upgrade, no API changes).

- [ ] **Step 3: Run tests**

```bash
npx vitest run --reporter=dot 2>&1 | tail -5
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(security): upgrade next 16.1.6 → 16.2.2 (5 CVEs)"
```

### Task 0.3: Upgrade AI SDK stack (required for Workstream A)

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Upgrade all AI SDK packages**

```bash
npm install ai@latest @ai-sdk/react@latest @ai-sdk/anthropic@latest @ai-sdk/google@latest @ai-sdk/openai@latest
```

This brings `ai` from 6.0.72 → 6.0.142 (70 patches).

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: 0 errors. If there are breaking changes, fix them before proceeding.

- [ ] **Step 3: Run tests**

```bash
npx vitest run --reporter=dot 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): upgrade AI SDK stack to latest (ai 6.0.142)"
```

### Task 0.4: Upgrade Supabase stack

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Upgrade supabase packages**

```bash
npm install @supabase/supabase-js@latest @supabase/ssr@latest
```

Note: `@supabase/ssr` goes from 0.8.0 → 0.10.0 (minor, may have changes).

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

If errors appear related to `createServerClient` or `createBrowserClient` signature changes, fix the wrapper files:
- `lib/supabase/server.ts`
- `lib/supabase/client.ts`
- `lib/supabase/middleware.ts`

- [ ] **Step 3: Run tests**

```bash
npx vitest run --reporter=dot 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/supabase/
git commit -m "chore(deps): upgrade supabase-js 2.101.1 + ssr 0.10.0"
```

### Task 0.5: Upgrade semver-safe dependencies (batch)

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Upgrade all within semver range**

```bash
npm install zod@latest zustand@latest @tanstack/react-query@latest react-hook-form@latest framer-motion@latest recharts@latest resend@latest tailwindcss@latest @tailwindcss/postcss@latest tailwind-merge@latest libphonenumber-js@latest immer@latest pg@latest happy-dom@latest vitest@latest vite@^7 axe-core@latest @testing-library/react@latest @faker-js/faker@latest @types/react@latest @types/node@^20
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run --reporter=dot 2>&1 | tail -5
```

- [ ] **Step 4: Run lint**

```bash
npx eslint --max-warnings 0 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): batch upgrade semver-safe dependencies"
```

### Task 0.6: Upgrade jsPDF 3 → 4 (breaking, CRITICAL vuln)

**Files:**
- Modify: `package.json`, `package-lock.json`
- Possibly modify: files importing `jspdf` or `jspdf-autotable`

- [ ] **Step 1: Upgrade jspdf**

```bash
npm install jspdf@latest jspdf-autotable@latest
```

- [ ] **Step 2: Find all jspdf usages**

```bash
grep -rn "from.*jspdf" --include="*.ts" --include="*.tsx" | grep -v node_modules
```

- [ ] **Step 3: Fix any API changes**

jsPDF 4 may have changed constructor options or method signatures. Check each usage and fix as needed.

- [ ] **Step 4: Run typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run --reporter=dot 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(security): upgrade jspdf 3 → 4 (CRITICAL: path traversal, XSS, DoS)"
```

### Task 0.7: Final vulnerability check

- [ ] **Step 1: Run audit**

```bash
npm audit 2>&1 | tail -5
```

Expected: 0 vulnerabilities (or only low-severity in transitive deps with no fix available).

- [ ] **Step 2: Commit lockfile if changed**

```bash
git add package-lock.json
git commit -m "chore(deps): final lockfile cleanup after upgrades" --allow-empty
```

---

## Workstream A: Migrate `generateObject` → AI SDK 6 Pattern

The AI SDK 6 deprecated `generateObject()`. The replacement is `generateText()` + `Output.object(schema)`. Seven services in `lib/ai/` already use the new pattern — the API routes need to catch up.

### Task A1: Migrate `app/api/ai/tasks/deals/analyze/route.ts`

**Files:**
- Modify: `app/api/ai/tasks/deals/analyze/route.ts:1,46-51`

- [ ] **Step 1: Update import**

Replace:
```typescript
import { generateObject } from 'ai';
```
With:
```typescript
import { generateText, Output } from 'ai';
```

- [ ] **Step 2: Replace generateObject call**

Replace (lines 46-51):
```typescript
    const result = await generateObject({
      model,
      maxRetries: 3,
      schema: AnalyzeLeadOutputSchema,
      prompt,
    });

    return json(result.object);
```
With:
```typescript
    const result = await generateText({
      model,
      maxRetries: 3,
      output: Output.object(AnalyzeLeadOutputSchema),
      prompt,
    });

    return json(result.object);
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "tasks/deals/analyze"`
Expected: No errors for this file.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/tasks/deals/analyze/route.ts
git commit -m "refactor(ai): migrate deals/analyze to generateText + Output.object (AI SDK 6)"
```

### Task A2: Migrate `app/api/ai/tasks/deals/objection-responses/route.ts`

**Files:**
- Modify: `app/api/ai/tasks/deals/objection-responses/route.ts:1,41-46`

- [ ] **Step 1: Update import**

Replace:
```typescript
import { generateObject } from 'ai';
```
With:
```typescript
import { generateText, Output } from 'ai';
```

- [ ] **Step 2: Replace generateObject call**

Replace (lines 41-46):
```typescript
    const result = await generateObject({
      model,
      maxRetries: 3,
      schema: ObjectionResponseOutputSchema,
      prompt,
    });
```
With:
```typescript
    const result = await generateText({
      model,
      maxRetries: 3,
      output: Output.object(ObjectionResponseOutputSchema),
      prompt,
    });
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "objection-responses"`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/tasks/deals/objection-responses/route.ts
git commit -m "refactor(ai): migrate objection-responses to generateText + Output.object (AI SDK 6)"
```

### Task A3: Migrate `app/api/ai/tasks/boards/generate-structure/route.ts`

**Files:**
- Modify: `app/api/ai/tasks/boards/generate-structure/route.ts:1,52-57`

- [ ] **Step 1: Update import**

Replace:
```typescript
import { generateObject } from 'ai';
```
With:
```typescript
import { generateText, Output } from 'ai';
```

- [ ] **Step 2: Replace generateObject call**

Replace (lines 52-57):
```typescript
    const result = await generateObject({
      model,
      maxRetries: 3,
      schema: BoardStructureOutputSchema,
      prompt,
    });
```
With:
```typescript
    const result = await generateText({
      model,
      maxRetries: 3,
      output: Output.object(BoardStructureOutputSchema),
      prompt,
    });
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "generate-structure"`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/tasks/boards/generate-structure/route.ts
git commit -m "refactor(ai): migrate boards/generate-structure to generateText + Output.object (AI SDK 6)"
```

### Task A4: Migrate `app/api/ai/tasks/boards/generate-strategy/route.ts`

**Files:**
- Modify: `app/api/ai/tasks/boards/generate-strategy/route.ts:1,40-45`

- [ ] **Step 1: Update import**

Replace:
```typescript
import { generateObject } from 'ai';
```
With:
```typescript
import { generateText, Output } from 'ai';
```

- [ ] **Step 2: Replace generateObject call**

Replace (lines 40-45):
```typescript
    const result = await generateObject({
      model,
      maxRetries: 3,
      schema: BoardStrategyOutputSchema,
      prompt,
    });
```
With:
```typescript
    const result = await generateText({
      model,
      maxRetries: 3,
      output: Output.object(BoardStrategyOutputSchema),
      prompt,
    });
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "generate-strategy"`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/tasks/boards/generate-strategy/route.ts
git commit -m "refactor(ai): migrate boards/generate-strategy to generateText + Output.object (AI SDK 6)"
```

### Task A5: Migrate `app/api/ai/tasks/boards/refine/route.ts`

**Files:**
- Modify: `app/api/ai/tasks/boards/refine/route.ts:1,45-50`

- [ ] **Step 1: Update import**

Replace:
```typescript
import { generateObject } from 'ai';
```
With:
```typescript
import { generateText, Output } from 'ai';
```

- [ ] **Step 2: Replace generateObject call**

Replace (lines 45-50):
```typescript
    const result = await generateObject({
      model,
      maxRetries: 3,
      schema: RefineBoardOutputSchema,
      prompt,
    });
```
With:
```typescript
    const result = await generateText({
      model,
      maxRetries: 3,
      output: Output.object(RefineBoardOutputSchema),
      prompt,
    });
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "boards/refine"`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/tasks/boards/refine/route.ts
git commit -m "refactor(ai): migrate boards/refine to generateText + Output.object (AI SDK 6)"
```

### Task A6: Migrate `app/api/ai/actions/route.ts` (7 generateObject calls)

**Files:**
- Modify: `app/api/ai/actions/route.ts:15,241,280,353,369,390,406,417`

- [ ] **Step 1: Update import (line 15)**

Replace:
```typescript
import { generateObject, generateText } from 'ai';
```
With:
```typescript
import { generateText, Output } from 'ai';
```

- [ ] **Step 2: Replace all 7 generateObject calls**

For each `generateObject({ model, maxRetries, schema: XxxSchema, prompt })` call at lines 241, 280, 353, 369, 390, 406, 417, replace with:

```typescript
generateText({ model, maxRetries: 3, output: Output.object(XxxSchema), prompt })
```

The schema variable name stays the same in each case — only `generateObject` → `generateText` and `schema:` → `output: Output.object(...)`.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "actions/route"`
Expected: No errors.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/ --reporter=dot 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/ai/actions/route.ts
git commit -m "refactor(ai): migrate actions route to generateText + Output.object (AI SDK 6)"
```

---

## Workstream B: Push `'use client'` Boundary Down in Protected Layout

The `app/(protected)/layout.tsx` has `'use client'` at line 1, making the entire protected tree a Client Component. The fix is to extract the client logic into a child component and keep the layout as a Server Component.

### Task B1: Create `ProtectedShell` client component

**Files:**
- Create: `app/(protected)/ProtectedShell.tsx`
- Modify: `app/(protected)/layout.tsx`

- [ ] **Step 1: Create ProtectedShell.tsx**

Create `app/(protected)/ProtectedShell.tsx` with ALL the current layout client logic:

```tsx
'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { QueryProvider } from '@/lib/query'
import { ToastProvider } from '@/context/ToastContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthProvider } from '@/context/AuthContext'
import { CRMProvider } from '@/context/CRMContext'
import { AIProvider } from '@/context/AIContext'
import { WhatsAppCallingProvider } from '@/features/voice/components/WhatsAppCallingProvider'
import Layout from '@/components/Layout'

export default function ProtectedShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isSetupRoute = pathname === '/setup'
  const isLabsRoute = pathname === '/labs' || pathname.startsWith('/labs/')
  const shouldUseAppShell = !isSetupRoute && !isLabsRoute

  // Copy the ENTIRE existing body of ProtectedLayout here —
  // the useEffect for agent log, all providers, Layout wrapper, etc.
  // This is a MOVE, not a rewrite. Copy lines 36-end from current layout.tsx.

  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <CRMProvider>
              <AIProvider>
                <WhatsAppCallingProvider>
                  {shouldUseAppShell ? (
                    <Layout>{children}</Layout>
                  ) : (
                    children
                  )}
                </WhatsAppCallingProvider>
              </AIProvider>
            </CRMProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  )
}
```

NOTE: Copy the full `useEffect` block from the current layout into this component as-is.

- [ ] **Step 2: Rewrite layout.tsx as Server Component**

Replace entire `app/(protected)/layout.tsx` with:

```tsx
import ProtectedShell from './ProtectedShell'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ProtectedShell>{children}</ProtectedShell>
}
```

No `'use client'` directive — this is now a Server Component.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "(protected)" | head -10`
Expected: No errors.

- [ ] **Step 4: Verify dev server loads**

Run: `npx next dev --port 3099 &` then `sleep 5 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3099/login && kill %1`
Expected: HTTP 200.

- [ ] **Step 5: Commit**

```bash
git add app/(protected)/ProtectedShell.tsx app/(protected)/layout.tsx
git commit -m "refactor(layout): push 'use client' boundary down to ProtectedShell component"
```

---

## Workstream C: Audit `.single()` → `.maybeSingle()` in Data Fetching

Many Supabase queries use `.single()` which throws PGRST116 if 0 rows are returned. For lookups where a record may not exist (settings, optional relations, find-by-external-id), `.maybeSingle()` is safer.

### Task C1: Audit and fix settings lookups

**Files:**
- Modify: `lib/supabase/settings.ts`

- [ ] **Step 1: Identify `.single()` calls in settings.ts**

Run: `grep -n '\.single()' lib/supabase/settings.ts`

These are settings lookups — an org may not have settings yet. Replace `.single()` with `.maybeSingle()` for all SELECT queries. Leave INSERT/UPDATE `.single()` as-is (those expect exactly 1 row).

- [ ] **Step 2: Apply fixes**

For each SELECT query using `.single()`, replace with `.maybeSingle()`.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "settings.ts"`
Expected: No errors (return type changes from `T` to `T | null` — callers may need null checks).

- [ ] **Step 4: Fix any downstream type errors**

If callers assume non-null, add null checks or `?? defaultValue`.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/settings.ts
git commit -m "fix(supabase): use maybeSingle() for settings lookups that may return no rows"
```

### Task C2: Audit and fix contacts lookups

**Files:**
- Modify: `lib/supabase/contacts.ts`

- [ ] **Step 1: Identify `.single()` calls**

Run: `grep -n '\.single()' lib/supabase/contacts.ts`

Find-by-phone, find-by-email, and find-by-external-id are "maybe" operations. Get-by-id after confirming existence is fine as `.single()`.

- [ ] **Step 2: Apply fixes for find-by-* queries**

Replace `.single()` with `.maybeSingle()` for queries that search by external identifiers (phone, email, external_id). Keep `.single()` for get-by-primary-key after existence is confirmed.

- [ ] **Step 3: Fix downstream type errors**

Add null checks where callers assume non-null.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/contacts.ts
git commit -m "fix(supabase): use maybeSingle() for contact find-by-* lookups"
```

### Task C3: Audit and fix deals lookups

**Files:**
- Modify: `lib/supabase/deals.ts`

- [ ] **Step 1: Same pattern as C2**

Run: `grep -n '\.single()' lib/supabase/deals.ts`

Replace `.single()` with `.maybeSingle()` for find/search operations. Keep `.single()` for guaranteed-exists operations (update-returning, insert-returning).

- [ ] **Step 2: Apply fixes and handle null returns**
- [ ] **Step 3: Commit**

```bash
git add lib/supabase/deals.ts
git commit -m "fix(supabase): use maybeSingle() for deal find operations"
```

---

## Final Verification

### Task V1: Full typecheck + test suite

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --reporter=dot`
Expected: All tests pass.

- [ ] **Step 3: Run lint**

Run: `npx eslint --max-warnings 0`
Expected: 0 warnings, 0 errors.

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: fixups from best-practices audit"
```

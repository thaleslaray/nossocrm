# NossoCRM - Tech Stack

**Version**: 1.0.0
**Created**: 2026-02-05
**Last Updated**: 2026-02-05

---

## Overview

NossoCRM é um CRM moderno construído com arquitetura moderna full-stack usando Next.js App Router com Supabase como backend. O sistema segue padrões de Single Source of Truth (SSOT) com TanStack Query para cache de servidor.

---

## Core Technologies

### Language & Runtime

| Technology | Version | Purpose |
|------------|---------|---------|
| **TypeScript** | ^5 | Primary language - strict mode enabled |
| **Node.js** | 20+ | Runtime environment |
| **ESM** | - | Module system (`"type": "module"` in package.json) |

### Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | ^16.0.10 | Full-stack React framework with App Router |
| **React** | 19.2.1 | UI library with Server Components |
| **React DOM** | 19.2.1 | DOM rendering |

### Database & Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Supabase** | ^2.87.1 | Backend as a Service (PostgreSQL + Auth + Realtime) |
| **@supabase/ssr** | ^0.8.0 | Server-side Supabase client for Next.js |
| **PostgreSQL** | 17+ | Primary database (via Supabase) |
| **pg** | ^8.16.3 | PostgreSQL client for direct connections |

---

## State Management

### Pattern: Hybrid SSOT Architecture

```
TanStack Query (Server Cache) ← Single Source of Truth
     ↓
React Context (Domain Logic) ← Orchestration layer
     ↓
Zustand (Local UI State) ← Ephemeral UI state only
```

| Technology | Version | Purpose |
|------------|---------|---------|
| **@tanstack/react-query** | ^5.90.12 | Server state cache (SSOT) |
| **Zustand** | ^5.0.9 | Local UI state (forms, modals, notifications) |
| **React Context** | built-in | Domain orchestration (Contacts, Deals) |
| **Immer** | ^11.0.1 | Immutable state updates |

### Query Keys Pattern

```typescript
// lib/query/queryKeys.ts
export const queryKeys = {
  deals: createQueryKeys('deals'),
  contacts: createExtendedQueryKeys('contacts', base => ({
    paginated: (pagination, filters) => [...base.all, 'paginated', pagination, filters],
  })),
};
```

---

## UI Layer

### Component Library

| Technology | Version | Purpose |
|------------|---------|---------|
| **Radix UI** | various | Headless accessible primitives |
| **shadcn/ui** | - | Pre-styled Radix components (copied into /components/ui) |

### Radix UI Components

- `@radix-ui/react-accordion` ^1.2.12
- `@radix-ui/react-avatar` ^1.1.11
- `@radix-ui/react-checkbox` ^1.3.3
- `@radix-ui/react-dialog` ^1.1.15
- `@radix-ui/react-dropdown-menu` ^2.1.16
- `@radix-ui/react-label` ^2.1.8
- `@radix-ui/react-popover` ^1.1.15
- `@radix-ui/react-scroll-area` ^1.2.10
- `@radix-ui/react-select` ^2.2.6
- `@radix-ui/react-separator` ^1.1.8
- `@radix-ui/react-slider` ^1.3.6
- `@radix-ui/react-slot` ^1.2.4
- `@radix-ui/react-switch` ^1.2.6
- `@radix-ui/react-tabs` ^1.1.13
- `@radix-ui/react-tooltip` ^1.2.8

### Styling

| Technology | Version | Purpose |
|------------|---------|---------|
| **Tailwind CSS** | ^4 | Utility-first CSS framework |
| **@tailwindcss/postcss** | ^4 | PostCSS integration |
| **class-variance-authority** | ^0.7.1 | Component variant management |
| **clsx** | ^2.1.1 | Conditional class names |
| **tailwind-merge** | ^3.4.0 | Merge Tailwind classes without conflicts |

### Icons & Animation

| Technology | Version | Purpose |
|------------|---------|---------|
| **Lucide React** | ^0.560.0 | Icon library |
| **Framer Motion** | ^12.23.26 | Animation library |

### Design System

- **Colors**: OKLCH color space (globals.css)
- **Dark Mode**: CSS class-based (`darkMode: 'class'`)
- **Fonts**: Inter (sans), Space Grotesk (display), Cinzel (serif)
- **Effects**: Glass effects, dot backgrounds, custom scrollbars

---

## Forms & Validation

| Technology | Version | Purpose |
|------------|---------|---------|
| **React Hook Form** | ^7.68.0 | Form state management |
| **@hookform/resolvers** | ^5.2.2 | Schema validation integration |
| **Zod** | ^4.1.13 | Schema validation (MUST use Zod 4 syntax) |

### Pattern

```typescript
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
  email: z.email(),
  name: z.string().min(2),
})
```

---

## AI Integration

### Vercel AI SDK

| Technology | Version | Purpose |
|------------|---------|---------|
| **ai** | ^6.0.72 | Vercel AI SDK core |
| **@ai-sdk/react** | ^3.0.74 | React hooks for AI |
| **@ai-sdk/anthropic** | ^3.0.37 | Claude integration |
| **@ai-sdk/google** | ^3.0.21 | Gemini integration |
| **@ai-sdk/openai** | ^3.0.25 | GPT integration |

### Default Model Preference

1. Google Gemini 2.0 Flash (cost-effective)
2. OpenAI GPT-4o-mini (balanced)
3. Anthropic Claude (complex tasks)

---

## Utilities

| Technology | Version | Purpose |
|------------|---------|---------|
| **date-fns** | ^4.1.0 | Date manipulation |
| **libphonenumber-js** | ^1.12.33 | Phone number parsing/formatting |
| **jspdf** | ^3.0.4 | PDF generation |
| **jspdf-autotable** | ^5.0.2 | PDF tables |
| **react-markdown** | ^10.1.0 | Markdown rendering |
| **remark-gfm** | ^4.0.1 | GitHub Flavored Markdown |
| **recharts** | ^3.5.1 | Charts and data visualization |
| **focus-trap-react** | ^11.0.4 | Focus management for modals |

---

## Testing

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vitest** | ^4.0.0 | Test runner (Vite-native) |
| **@testing-library/react** | ^16.3.0 | Component testing |
| **@testing-library/jest-dom** | ^6.8.0 | DOM matchers |
| **@testing-library/user-event** | ^14.6.1 | User interaction simulation |
| **happy-dom** | ^20.0.11 | DOM environment for tests |
| **vitest-axe** | ^0.1.0 | Accessibility testing |
| **axe-core** | ^4.10.3 | Accessibility engine |

### Test Commands

```bash
npm run test        # Watch mode
npm run test:run    # Single run
npm run precheck    # lint + typecheck + test:run + build
```

---

## Development Tools

| Technology | Version | Purpose |
|------------|---------|---------|
| **ESLint** | ^9 | Linting |
| **eslint-config-next** | 16.0.8 | Next.js ESLint config |
| **TypeScript** | ^5 | Type checking |
| **Vite** | ^7.1.3 | Build tool (for tests) |
| **@vitejs/plugin-react** | ^5.0.4 | React plugin for Vite |

---

## Realtime & WebSocket

| Technology | Purpose |
|------------|---------|
| **Supabase Realtime** | WebSocket subscriptions for live updates |

### Pattern

```typescript
// lib/realtime/useRealtimeSync.ts
supabase
  .channel('table-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, handler)
  .subscribe()
```

---

## Prohibited Technologies

> ❌ **NEVER use these - they violate project standards**

| Prohibited | Reason | Use Instead |
|------------|--------|-------------|
| ❌ Axios | Unnecessary dependency | `fetch` API nativo |
| ❌ Redux | Over-engineered for this stack | Zustand + React Query |
| ❌ Moment.js | Deprecated, large bundle | `date-fns` |
| ❌ Class Components | Legacy pattern | Functional components with hooks |
| ❌ getServerSideProps | Pages Router pattern | App Router RSC + Server Actions |
| ❌ getStaticProps | Pages Router pattern | App Router RSC + generateStaticParams |
| ❌ styled-components | Different styling paradigm | Tailwind CSS |
| ❌ Emotion | Different styling paradigm | Tailwind CSS |
| ❌ CSS Modules | Inconsistent with design system | Tailwind CSS |
| ❌ Prisma | Different ORM paradigm | Supabase client direto |
| ❌ Drizzle | Different ORM paradigm | Supabase client direto |
| ❌ tRPC | Over-engineering | Server Actions + API Routes |
| ❌ Jest | Different test runner | Vitest |
| ❌ Enzyme | Deprecated | @testing-library/react |
| ❌ Lodash | Large bundle, unnecessary | Native JS + date-fns |
| ❌ jQuery | Legacy | Native DOM APIs |

---

## File Structure Conventions

```
app/                    # Next.js App Router pages
├── (protected)/        # Authenticated routes
├── (public)/           # Public routes
├── api/                # API routes
└── layout.tsx          # Root layout

components/
├── ui/                 # shadcn/ui components (copied, not imported)
└── layout/             # App shell components

context/                # React Context providers (domain logic)
├── contacts/
├── deals/
└── index.ts

features/               # Feature modules
└── [feature]/
    ├── components/
    ├── hooks/
    └── [Feature]Page.tsx

lib/
├── query/              # TanStack Query config + hooks
│   ├── queryKeys.ts    # Query key factory
│   └── hooks/          # useXxxQuery hooks
├── realtime/           # Supabase Realtime
├── supabase/           # Supabase clients
└── utils/              # Utility functions

hooks/                  # Shared hooks
types/                  # TypeScript types
```

---

## Database Conventions

### Supabase Patterns

- **RLS**: Always enabled on tables with user data
- **Policies**: Named descriptively (e.g., "Users can view own org data")
- **Realtime**: Enabled for tables that need live updates
- **Edge Functions**: For webhooks and external integrations
- **pgmq**: For message queues (async processing)

### Naming Conventions

- Tables: `snake_case` plural (e.g., `messaging_conversations`)
- Columns: `snake_case` (e.g., `created_at`, `organization_id`)
- Foreign keys: `{table}_id` (e.g., `contact_id`)
- Indexes: `idx_{table}_{columns}` (e.g., `idx_conversations_org_status`)
- Triggers: `trigger_{action}_{description}` (e.g., `trigger_update_conversation_on_message`)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-05 | Initial tech stack from codebase analysis |

---

## References

- [Next.js 16 Docs](https://nextjs.org/docs)
- [React 19 Docs](https://react.dev)
- [Supabase Docs](https://supabase.com/docs)
- [TanStack Query Docs](https://tanstack.com/query)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [Radix UI Docs](https://www.radix-ui.com/docs/primitives)

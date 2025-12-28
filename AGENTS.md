# AGENTS.md — NossoCRM

## Commands
- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npm run lint` (zero warnings enforced)
- **Typecheck**: `npm run typecheck`
- **Tests**: `npm test` (watch) | `npm run test:run` (single run) | `npx vitest path/to/file.test.ts` (single file)

## Architecture
- **Next.js 16 (App Router)**: routes in `app/`, protected routes under `app/(protected)/`
- **Supabase**: Auth + Postgres + RLS. Clients in `lib/supabase/` (client/server/service-role)
- **Proxy auth**: `proxy.ts` + `lib/supabase/middleware.ts` (not middleware.ts); excludes `/api/*`
- **State**: TanStack Query with facades in `context/`, queries in `lib/query/`
- **AI**: SDK v6, chat via `/api/ai/chat`, tools in `lib/ai/tools.ts` (always filter by `organization_id`)

## Code Style
- TypeScript 5.x strict, React 19, Tailwind CSS v4, Radix UI primitives
- Shared components in `components/`, feature modules in `features/`
- Imports: use `@/` alias (e.g., `@/lib/utils`, `@/components/ui`)
- Naming: camelCase for variables/functions, PascalCase for components/types
- Tests: Vitest + happy-dom + React Testing Library; place `.test.ts(x)` files alongside source

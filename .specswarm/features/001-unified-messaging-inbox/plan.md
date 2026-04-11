# Implementation Plan: Inbox Unificado de Messaging Omnichannel

**Feature**: 001-unified-messaging-inbox
**Status**: In Progress
**Created**: 2026-02-06
**PRD Reference**: `/Users/thaleslaray/.claude/plans/elegant-knitting-star.md`
**Spec Reference**: `spec.md`

---

## Technical Context

### Stack Utilizado

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Frontend | Next.js (App Router) | ^16.0.10 |
| UI | React + Radix UI + Tailwind | 19.2.1 |
| State | TanStack Query (SSOT) + Zustand | ^5.90.12 |
| Backend | Supabase Edge Functions | - |
| Database | PostgreSQL (Supabase) | 17+ |
| Realtime | Supabase Realtime (WebSocket) | ^2.87.1 |
| Validation | Zod 4 | ^4.1.13 |

### Padrões Existentes Reutilizados

1. **Query Keys Factory** (`lib/query/queryKeys.ts`) - Já implementado para messaging
2. **Context Pattern** (`context/`) - MessagingContext criado
3. **Feature Folder Structure** (`features/messaging/`) - Estrutura criada
4. **Realtime Sync** (`lib/realtime/useRealtimeSync.ts`) - A integrar

### Dependências Externas

1. **Z-API** - Provider WhatsApp não-oficial (setup rápido)
2. **Meta Cloud API** - Provider WhatsApp oficial
3. **Supabase Vault** - Para credenciais criptografadas

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI Layer (React + Next.js)                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │ Inbox View  │ │Conversation │ │ Settings    │                   │
│  │ (Unified)   │ │   Thread    │ │ (Channels)  │                   │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                   │
├─────────┴───────────────┴───────────────┴───────────────────────────┤
│  Service Layer (TypeScript)                                         │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              ChannelRouterService                               │ │
│  │  ┌─────────────────────────────────────────────────────────┐   │ │
│  │  │           ChannelProviderFactory                         │   │ │
│  │  │  getProvider(channelType, provider) → IChannelProvider   │   │ │
│  │  └─────────────────────────────────────────────────────────┘   │ │
│  │    ┌──────────┐          ┌──────────┐            ┌──────────┐  │ │
│  │    │ WhatsApp │          │Instagram │            │  Email   │  │ │
│  │    │ Channel  │          │ Channel  │            │ Channel  │  │ │
│  │    └────┬─────┘          └────┬─────┘            └────┬─────┘  │ │
│  │     ┌───┴───┐             ┌───┴───┐              ┌────┴────┐   │ │
│  │   ┌─────┐┌────────┐    ┌────────┐              ┌──────┐       │ │
│  │   │Z-API││Meta API│    │Meta API│              │ SMTP │       │ │
│  │   └─────┘└────────┘    └────────┘              └──────┘       │ │
│  └────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  Data Layer (Supabase)                                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ messaging_channels │ messaging_conversations │ messaging_messages│ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Patterns

| Pattern | Uso | Implementado |
|---------|-----|--------------|
| **Factory** | `ChannelProviderFactory` cria provider correto por tipo | ✅ |
| **Strategy** | `IChannelProvider` interface comum, implementações específicas | ✅ |
| **Repository** | Services encapsulam acesso a dados | ✅ |
| **SSOT** | TanStack Query como única fonte de verdade | ✅ |

---

## Database Schema

### Tabelas Criadas

| Tabela | Status | Migration |
|--------|--------|-----------|
| `business_units` | ✅ | `20260205100000_create_messaging_system.sql` |
| `business_unit_members` | ✅ | `20260205100000_create_messaging_system.sql` |
| `messaging_channels` | ✅ | `20260205100000_create_messaging_system.sql` |
| `messaging_conversations` | ✅ | `20260205100000_create_messaging_system.sql` |
| `messaging_messages` | ✅ | `20260205100000_create_messaging_system.sql` |
| `messaging_templates` | ✅ | `20260205100000_create_messaging_system.sql` |
| `messaging_webhook_events` | ✅ | `20260205100000_create_messaging_system.sql` |

### RPC Functions

| Function | Status | Migration |
|----------|--------|-----------|
| `update_message_status_if_newer` | ✅ | `20260206100000_add_message_status_rpc.sql` |

---

## Implementation Phases

### Fase 1: Fundação + Business Units ✅ 90%

#### Database Layer
- [x] Migration tabelas messaging
- [x] Migration fix unique constraint
- [x] RPC para status atômico
- [x] Índices otimizados
- [x] RLS policies

#### Core Types & Factory
- [x] `lib/messaging/types/channel.types.ts`
- [x] `lib/messaging/types/message.types.ts`
- [x] `lib/messaging/types/provider.types.ts`
- [x] `lib/messaging/types/webhook.types.ts`
- [x] `lib/messaging/types/template.types.ts`
- [x] `lib/messaging/types/business-unit.types.ts`
- [x] `lib/messaging/channel-factory.ts`
- [x] `lib/messaging/channel-router.service.ts`

#### Query Layer
- [x] Query keys para messaging em `queryKeys.ts`
- [x] `useConversationsQuery.ts`
- [x] `useMessagesQuery.ts`
- [ ] `useChannelsQuery.ts`
- [ ] `useBusinessUnitsQuery.ts`

#### Context
- [x] `context/messaging/MessagingContext.tsx`

#### Business Units UI
- [ ] `features/settings/components/BusinessUnitsSection.tsx`
- [ ] `features/settings/components/BusinessUnitForm.tsx`
- [ ] `features/settings/components/BusinessUnitMembers.tsx`

---

### Fase 2: Z-API Provider ✅ 100%

- [x] `lib/messaging/providers/base.provider.ts`
- [x] `lib/messaging/providers/whatsapp/z-api.provider.ts`
- [x] `supabase/functions/messaging-webhook-zapi/index.ts`
- [x] Deduplicação de webhooks (`generateStableEventId`)
- [x] `app/api/messaging/channels/route.ts`
- [x] `app/api/messaging/channels/[id]/qr-code/route.ts`
- [x] `app/api/messaging/conversations/route.ts`
- [x] `app/api/messaging/messages/route.ts`

---

### Fase 3: UI Básica 🔄 70%

#### Componentes Implementados
- [x] `features/messaging/MessagingPage.tsx`
- [x] `features/messaging/components/ConversationList.tsx`
- [x] `features/messaging/components/ConversationItem.tsx`
- [x] `features/messaging/components/MessageThread.tsx`
- [x] `features/messaging/components/MessageBubble.tsx`
- [x] `features/messaging/components/MessageInput.tsx`
- [x] `features/messaging/components/TemplateSelector.tsx`
- [x] `features/messaging/hooks/useMessagingController.ts`
- [x] `features/messaging/components/skeletons/ConversationListSkeleton.tsx`
- [x] `features/messaging/components/skeletons/MessageThreadSkeleton.tsx`

#### Componentes Pendentes
- [ ] `features/messaging/components/ContactPanel.tsx`
- [ ] `features/messaging/components/skeletons/ContactPanelSkeleton.tsx`
- [ ] `features/messaging/components/ChannelIndicator.tsx`
- [ ] `features/messaging/components/WindowExpiryBadge.tsx`
- [ ] `features/messaging/components/BusinessUnitSelector.tsx`
- [ ] `features/messaging/components/Modals/NewConversationModal.tsx`
- [ ] `features/messaging/components/Modals/ChannelSetupModal.tsx`

#### Pages
- [x] `app/(protected)/messaging/page.tsx`
- [ ] `app/(protected)/messaging/[conversationId]/page.tsx`

#### Settings
- [ ] `features/settings/components/ChannelsSection.tsx`
- [ ] `features/settings/components/ChannelSetupWizard.tsx`

---

### Fase 4: Meta Cloud API ✅ 100%

- [x] `lib/messaging/providers/whatsapp/meta-cloud.provider.ts`
- [x] `supabase/functions/messaging-webhook-meta/index.ts`
- [x] Deduplicação de webhooks

---

### Fase 5: Instagram ⏳ 0%

- [ ] `lib/messaging/providers/instagram/meta-instagram.provider.ts`
- [ ] Reutilizar webhook Meta

---

### Fase 6: Polimento ⏳ 0%

- [ ] Vinculação automática com deals
- [ ] Notificações de novas mensagens (badge + som + toast + push)
- [ ] Busca de conversas
- [ ] Filtros por canal/status
- [ ] Testes E2E

---

## Tech Stack Compliance Report

### ✅ Approved Technologies (already in stack)

Todas as tecnologias usadas estão aprovadas em `.specswarm/tech-stack.md`:

| Tecnologia | Status | Uso |
|------------|--------|-----|
| TypeScript 5 | ✅ Aprovado | Toda a codebase |
| Next.js 16 (App Router) | ✅ Aprovado | Pages, API Routes, RSC |
| React 19 | ✅ Aprovado | UI Components |
| Supabase JS 2.87.1 | ✅ Aprovado | Database, Auth, Realtime |
| TanStack Query 5 | ✅ Aprovado | Server state (SSOT) |
| Zustand 5 | ✅ Aprovado | UI state |
| Radix UI | ✅ Aprovado | Headless components |
| Tailwind CSS 4 | ✅ Aprovado | Styling |
| Zod 4 | ✅ Aprovado | Validation |
| date-fns 4 | ✅ Aprovado | Date formatting |
| libphonenumber-js | ✅ Aprovado | Phone E.164 normalization |
| Lucide React | ✅ Aprovado | Icons |
| Framer Motion | ✅ Aprovado | Animations |

### ❌ Prohibited Technologies (compliance check)

Verificado que NÃO usamos tecnologias proibidas:

| Proibido | Verificação |
|----------|-------------|
| Axios | ✅ Usando fetch API |
| Redux | ✅ Usando Zustand + React Query |
| Moment.js | ✅ Usando date-fns |
| Class Components | ✅ Usando Functional + hooks |
| styled-components | ✅ Usando Tailwind |
| Prisma/Drizzle | ✅ Usando Supabase client |

---

## Files Created/Modified

### New Files (lib/messaging/)
```
lib/messaging/
├── index.ts
├── channel-factory.ts
├── channel-router.service.ts
├── types/
│   ├── index.ts
│   ├── channel.types.ts
│   ├── message.types.ts
│   ├── provider.types.ts
│   ├── webhook.types.ts
│   ├── template.types.ts
│   └── business-unit.types.ts
└── providers/
    ├── index.ts
    ├── base.provider.ts
    └── whatsapp/
        ├── index.ts
        ├── z-api.provider.ts
        └── meta-cloud.provider.ts
```

### New Files (features/messaging/)
```
features/messaging/
├── MessagingPage.tsx
├── hooks/
│   └── useMessagingController.ts
└── components/
    ├── index.ts
    ├── ConversationList.tsx
    ├── ConversationItem.tsx
    ├── MessageThread.tsx
    ├── MessageBubble.tsx
    ├── MessageInput.tsx
    ├── TemplateSelector.tsx
    └── skeletons/
        ├── ConversationListSkeleton.tsx
        └── MessageThreadSkeleton.tsx
```

### New Files (API & Edge Functions)
```
app/api/messaging/
├── channels/
│   ├── route.ts
│   └── [id]/qr-code/route.ts
├── conversations/route.ts
└── messages/route.ts

supabase/functions/
├── messaging-webhook-zapi/index.ts
└── messaging-webhook-meta/index.ts
```

### New Files (Query Layer)
```
lib/query/hooks/
├── useConversationsQuery.ts
├── useMessagingConversationsQuery.ts
├── useMessagesQuery.ts
└── useMessagingMessagesQuery.ts
```

### Modified Files
```
lib/query/queryKeys.ts          # Added messaging keys
context/messaging/              # New context
app/(protected)/messaging/      # New page
```

---

## Current Progress Summary

| Fase | Progresso | Status |
|------|-----------|--------|
| Fase 1: Fundação | 90% | 🔄 Falta Business Units UI |
| Fase 2: Z-API | 100% | ✅ Completa |
| Fase 3: UI Básica | 70% | 🔄 Falta componentes auxiliares |
| Fase 4: Meta Cloud | 100% | ✅ Completa |
| Fase 5: Instagram | 0% | ⏳ Não iniciada |
| Fase 6: Polimento | 0% | ⏳ Não iniciada |

**Progresso Total: ~65%**

---

## Next Steps

1. **Completar Fase 1**: Criar UI de Business Units em Settings
2. **Completar Fase 3**: Criar componentes faltantes (ContactPanel, ChannelIndicator, etc.)
3. **Integrar Realtime**: Adicionar tabelas messaging ao useRealtimeSync
4. **Testar fluxo completo**: Conectar Z-API, enviar/receber mensagens
5. **Iniciar Fase 5 ou 6**: Instagram ou polimento

---

## References

- [PRD Completo](/Users/thaleslaray/.claude/plans/elegant-knitting-star.md)
- [Spec](/Users/thaleslaray/code/projetos/nossocrm/.specswarm/features/001-unified-messaging-inbox/spec.md)
- [Tech Stack](/Users/thaleslaray/code/projetos/nossocrm/.specswarm/tech-stack.md)

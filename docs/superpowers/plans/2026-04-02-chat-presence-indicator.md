# Chat Presence Indicator (Online/Digitando)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real-time presence indicators (online, typing, recording) for WhatsApp contacts in the messaging UI, using Z-API's PresenceChatCallback webhook events.

**Architecture:** Zero database — presence is ephemeral. Z-API webhook → Edge Function filters by known contacts with open deals → Supabase Realtime Broadcast → React hook consumes → UI shows indicator. Auto-expires after 30s of no events (TTL client-side).

**Tech Stack:** Supabase Edge Functions (Deno), Supabase Realtime Broadcast, React hooks, Z-API PresenceChatCallback

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/functions/messaging-webhook-zapi/index.ts` | Modify | Handle `PresenceChatCallback` events, filter by known contacts, broadcast via Realtime |
| `lib/messaging/hooks/useContactPresence.ts` | Create | React hook that subscribes to Realtime broadcast and manages presence state with TTL |
| `features/messaging/components/PresenceIndicator.tsx` | Create | Tiny UI component showing online dot / "digitando..." / "gravando..." |
| `features/messaging/components/MessageThread.tsx` | Modify | Add PresenceIndicator below header area |
| `features/messaging/components/ConversationItem.tsx` | Modify | Add green dot for online contacts in conversation list |

---

### Task 1: Handle presence events in Z-API webhook

**Files:**
- Modify: `supabase/functions/messaging-webhook-zapi/index.ts`

- [ ] **Step 1: Add presence type to ZApiWebhookPayload**

After the existing `ZApiWebhookPayload` interface (line ~57), add:

```typescript
interface ZApiPresencePayload {
  type: "PresenceChatCallback";
  phone: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "COMPOSING" | "RECORDING" | "PAUSED";
  lastSeen: string | null;
  instanceId: string;
}
```

- [ ] **Step 2: Add presence handler before main message processing**

In the main `Deno.serve` handler, after the channel lookup and before the existing message processing, add early detection for presence events:

```typescript
// Presence events — broadcast only, no DB write
if (payload.type === "PresenceChatCallback") {
  return await handlePresenceEvent(supabase, channel, payload as unknown as ZApiPresencePayload);
}
```

- [ ] **Step 3: Implement handlePresenceEvent function**

Add at the end of the file:

```typescript
async function handlePresenceEvent(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; organization_id: string },
  payload: ZApiPresencePayload
): Promise<Response> {
  const phone = normalizePhone(payload.phone);
  if (!phone) return json(200, { ok: true, skipped: "invalid_phone" });

  // Only broadcast for contacts that exist AND have an open deal
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("organization_id", channel.organization_id)
    .eq("phone", phone)
    .is("deleted_at", null)
    .maybeSingle();

  if (!contact) return json(200, { ok: true, skipped: "unknown_contact" });

  // Check if contact has an open deal (skip inactive contacts)
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contact.id)
    .eq("is_won", false)
    .eq("is_lost", false);

  if (!count || count === 0) return json(200, { ok: true, skipped: "no_open_deal" });

  // Broadcast via Supabase Realtime (no DB write)
  const broadcastChannel = supabase.channel(`org:${channel.organization_id}:presence`);
  await broadcastChannel.send({
    type: "broadcast",
    event: "presence",
    payload: {
      contactId: contact.id,
      contactName: contact.name,
      phone,
      status: payload.status,
      channelId: channel.id,
      timestamp: Date.now(),
    },
  });
  await supabase.removeChannel(broadcastChannel);

  return json(200, { ok: true, event: "presence_broadcast", contact: contact.id, status: payload.status });
}
```

- [ ] **Step 4: Deploy updated Edge Function**

```bash
supabase functions deploy messaging-webhook-zapi --no-verify-jwt
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/messaging-webhook-zapi/index.ts
git commit -m "feat(presence): handle Z-API PresenceChatCallback in webhook

Filters by contacts with open deals, broadcasts via Supabase Realtime.
No database writes — presence is ephemeral."
```

---

### Task 2: Create useContactPresence hook

**Files:**
- Create: `lib/messaging/hooks/useContactPresence.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type PresenceStatus = 'online' | 'typing' | 'recording' | 'offline';

interface ContactPresence {
  contactId: string;
  contactName?: string;
  status: PresenceStatus;
  lastSeen: number;
}

const STATUS_MAP: Record<string, PresenceStatus> = {
  AVAILABLE: 'online',
  COMPOSING: 'typing',
  RECORDING: 'recording',
  UNAVAILABLE: 'offline',
  PAUSED: 'online', // Paused after typing = still in chat
};

const PRESENCE_TTL = 30_000; // 30s — auto-expire to offline

/**
 * Subscribe to real-time presence for all contacts in the org.
 * Returns a Map of contactId → PresenceStatus.
 */
export function useContactPresence() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [presenceMap, setPresenceMap] = useState<Map<string, ContactPresence>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!orgId || !supabase) return;

    const channel = supabase.channel(`org:${orgId}:presence`);

    channel.on('broadcast', { event: 'presence' }, (payload) => {
      const data = payload.payload as {
        contactId: string;
        contactName?: string;
        status: string;
        timestamp: number;
      };

      const mappedStatus = STATUS_MAP[data.status] || 'offline';

      setPresenceMap((prev) => {
        const next = new Map(prev);
        if (mappedStatus === 'offline') {
          next.delete(data.contactId);
        } else {
          next.set(data.contactId, {
            contactId: data.contactId,
            contactName: data.contactName,
            status: mappedStatus,
            lastSeen: Date.now(),
          });
        }
        return next;
      });
    });

    channel.subscribe();

    // TTL cleanup — expire stale entries every 10s
    timerRef.current = setInterval(() => {
      const now = Date.now();
      setPresenceMap((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, entry] of next) {
          if (now - entry.lastSeen > PRESENCE_TTL) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10_000);

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [orgId]);

  const getPresence = useCallback(
    (contactId: string): PresenceStatus => {
      return presenceMap.get(contactId)?.status ?? 'offline';
    },
    [presenceMap]
  );

  return { presenceMap, getPresence };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/messaging/hooks/useContactPresence.ts
git commit -m "feat(presence): useContactPresence hook with Realtime broadcast + TTL"
```

---

### Task 3: Create PresenceIndicator component

**Files:**
- Create: `features/messaging/components/PresenceIndicator.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { PresenceStatus } from '@/lib/messaging/hooks/useContactPresence';

interface PresenceIndicatorProps {
  status: PresenceStatus;
  /** Show label text (digitando..., gravando...) */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_CONFIG: Record<PresenceStatus, { color: string; label: string; animate?: boolean }> = {
  online: { color: 'bg-green-500', label: 'online' },
  typing: { color: 'bg-green-500', label: 'digitando...', animate: true },
  recording: { color: 'bg-red-500', label: 'gravando áudio...', animate: true },
  offline: { color: 'bg-slate-400', label: '' },
};

export function PresenceIndicator({ status, showLabel = false, size = 'sm', className }: PresenceIndicatorProps) {
  if (status === 'offline') return null;

  const config = STATUS_CONFIG[status];
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('rounded-full', dotSize, config.color, config.animate && 'animate-pulse')} />
      {showLabel && config.label && (
        <span className="text-[10px] font-medium text-green-600 dark:text-green-400 italic">
          {config.label}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add features/messaging/components/PresenceIndicator.tsx
git commit -m "feat(presence): PresenceIndicator component (dot + label)"
```

---

### Task 4: Integrate into MessageThread

**Files:**
- Modify: `features/messaging/components/MessageThread.tsx`

- [ ] **Step 1: Add presence indicator at the bottom of the message thread (above input)**

Import the hook and component at the top of MessageThread, then add a typing indicator that appears at the bottom of the message list when the contact is typing/recording.

Add before the closing of the scroll container:

```tsx
{presenceStatus !== 'offline' && (
  <div className="flex items-center gap-2 px-4 py-2">
    <PresenceIndicator status={presenceStatus} showLabel size="md" />
  </div>
)}
```

The `presenceStatus` comes from the parent (MessagingPage) which holds the hook, passed via prop. This avoids multiple hook instances.

- [ ] **Step 2: Commit**

```bash
git add features/messaging/components/MessageThread.tsx
git commit -m "feat(presence): show typing/recording indicator in message thread"
```

---

### Task 5: Integrate into ConversationItem (green dot in list)

**Files:**
- Modify: `features/messaging/components/ConversationItem.tsx`

- [ ] **Step 1: Add green dot next to contact name when online/typing**

Add a `presenceStatus` prop to `ConversationItem` and show a dot next to the name.

- [ ] **Step 2: Commit**

```bash
git add features/messaging/components/ConversationItem.tsx
git commit -m "feat(presence): green dot on conversation list for online contacts"
```

---

### Task 6: Wire up in MessagingPage

**Files:**
- Modify: `features/messaging/MessagingPage.tsx`

- [ ] **Step 1: Add useContactPresence hook at page level**

Call `useContactPresence()` once in MessagingPage and pass `getPresence` down to ConversationList and MessageThread.

- [ ] **Step 2: Update ChannelsSection webhook instructions**

Update the Z-API instructions to mark "Presença do chat" as recommended instead of "não utilizado".

- [ ] **Step 3: Deploy Edge Function**

```bash
supabase functions deploy messaging-webhook-zapi --no-verify-jwt
```

- [ ] **Step 4: Commit**

```bash
git add features/messaging/ lib/messaging/hooks/
git commit -m "feat(presence): wire up presence in MessagingPage + update webhook instructions"
```

---

## Verification

1. Configure "Presença do chat" webhook no Z-API com a mesma URL
2. Abrir /messaging no browser
3. De outro telefone, abrir o chat do WhatsApp com o número do Z-API
4. Deve aparecer dot verde na lista de conversas
5. Começar a digitar → "digitando..." aparece no thread
6. Parar de digitar → indicador some em ~30s
7. Sair do chat → dot verde some

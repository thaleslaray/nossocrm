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
  PAUSED: 'online',
};

const PRESENCE_TTL = 30_000;

export function useContactPresence() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [presenceMap, setPresenceMap] = useState<Map<string, ContactPresence>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

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

    timerRef.current = setInterval(() => {
      const now = Date.now();
      setPresenceMap((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id] of next) {
          if (now - next.get(id)!.lastSeen > PRESENCE_TTL) {
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

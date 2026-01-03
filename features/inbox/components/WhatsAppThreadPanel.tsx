'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

type ThreadMessage = {
  id: string;
  role: string;
  text: string | null;
  sent_at: string;
};

type ThreadConversation = {
  id: string;
  context_id: string;
  channel: string;
  contact_phone: string | null;
  contact_name: string | null;
  human_takeover_at: string | null;
  human_takeover_by: string | null;
  last_message_at: string | null;
};

export function WhatsAppThreadPanel(props: { dealId: string; contactId?: string | null }) {
  const contactId = props.contactId ?? null;

  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<ThreadConversation | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [takeoverLoading, setTakeoverLoading] = useState(false);

  const takeoverEnabled = useMemo(() => !!conversation && !conversation.human_takeover_at, [conversation]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!contactId) {
        setConversation(null);
        setMessages([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/whatsapp/thread?dealId=${encodeURIComponent(props.dealId)}&contactId=${encodeURIComponent(contactId)}`,
          { method: 'GET' }
        );

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Falha ao carregar (${res.status})`);
        }

        const data = (await res.json()) as { conversation: ThreadConversation | null; messages: ThreadMessage[] };

        if (cancelled) return;
        setConversation(data.conversation);
        setMessages(data.messages ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Erro ao carregar conversa');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [props.dealId, contactId]);

  async function handleTakeover() {
    if (!conversation) return;

    setTakeoverLoading(true);
    try {
      const res = await fetch('/api/whatsapp/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Falha ao assumir (${res.status})`);
      }

      setConversation({ ...conversation, human_takeover_at: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao assumir atendimento');
    } finally {
      setTakeoverLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            WhatsApp
            {conversation?.contact_name ? ` • ${conversation.contact_name}` : ''}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {conversation?.contact_phone ? conversation.contact_phone : '—'}
            {conversation?.human_takeover_at ? ' • atendimento humano' : ' • IA ativa'}
          </p>
        </div>

        <button
          type="button"
          disabled={!takeoverEnabled || takeoverLoading}
          onClick={handleTakeover}
          className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
            takeoverEnabled
              ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300 hover:bg-primary-500/15'
              : 'border-white/10 bg-white/5 text-slate-500 cursor-not-allowed'
          }`}
        >
          {takeoverLoading ? 'Assumindo...' : 'Assumir atendimento'}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-primary-500" />
          </div>
        )}

        {!loading && error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            {error}
          </div>
        )}

        {!loading && !error && !conversation && (
          <div className="text-sm text-slate-600 dark:text-slate-400 text-center py-8">Nenhuma conversa ainda</div>
        )}

        {!loading && !error && conversation && messages.length === 0 && (
          <div className="text-sm text-slate-600 dark:text-slate-400 text-center py-8">Nenhuma mensagem ainda</div>
        )}

        {!loading && !error && messages.map((m) => {
          const isUser = String(m.role).toLowerCase() === 'user';
          return (
            <div key={m.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 border ${
                  isUser
                    ? 'bg-white border-slate-200 text-slate-900 dark:bg-slate-900/40 dark:border-white/5 dark:text-slate-100'
                    : 'bg-primary-500/10 border-primary-500/20 text-slate-900 dark:text-white'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{m.text || ''}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {new Date(m.sent_at).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

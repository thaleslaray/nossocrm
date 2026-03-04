'use client';

import { useState, useRef, useEffect } from 'react';
import {
  useWhatsAppMessages,
  useSendWhatsAppMessage,
  useWhatsAppAIControl,
} from '@/lib/query/whatsapp';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import type { WhatsAppConversation, WhatsAppMessage } from '@/types/whatsapp';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Send,
  Bot,
  BotOff,
  User,
  Image as ImageIcon,
  FileText,
  Mic,
  MapPin,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Loader2,
  Phone,
  MoreVertical,
  Brain,
} from 'lucide-react';

interface MessageThreadProps {
  conversation: WhatsAppConversation;
  onToggleIntelligence?: () => void;
  showIntelligenceActive?: boolean;
}

export function MessageThread({ conversation, onToggleIntelligence, showIntelligenceActive }: MessageThreadProps) {
  const { data: messages, isLoading } = useWhatsAppMessages(conversation.id);
  const sendMutation = useSendWhatsAppMessage();
  const aiControl = useWhatsAppAIControl();
  const [text, setText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Supabase Realtime subscription for live message updates
  const queryClient = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.whatsappMessages.byConversation(conversation.id),
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.whatsappMessages.byConversation(conversation.id),
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id, queryClient]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMutation.mutate({
      conversationId: conversation.id,
      text: trimmed,
    });
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleAI = () => {
    aiControl.mutate({
      conversationId: conversation.id,
      action: conversation.ai_active ? 'pause' : 'resume',
    });
    setShowMenu(false);
  };

  const displayName = conversation.contact?.name || conversation.contact_name || conversation.phone;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-dark-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white dark:bg-dark-card border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-3">
          {conversation.contact_photo ? (
            <img
              src={conversation.contact_photo}
              alt={displayName}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{displayName}</h3>
            <p className="text-xs text-slate-500">{conversation.phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Intelligence Panel toggle */}
          {onToggleIntelligence && (
            <button
              onClick={onToggleIntelligence}
              className={`hidden xl:flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                showIntelligenceActive
                  ? 'bg-violet-500/10 text-violet-500'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200'
              }`}
              title="Painel de Inteligência"
            >
              <Brain className="w-3 h-3" />
              I.Q.
            </button>
          )}

          {/* AI status badge */}
          {conversation.ai_active ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/10 text-violet-500 text-xs font-medium">
              <Bot className="w-3 h-3" />
              I.A. ativa
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 text-xs font-medium">
              <BotOff className="w-3 h-3" />
              I.A. pausada
            </span>
          )}

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
            >
              <MoreVertical className="w-4 h-4 text-slate-500" />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl shadow-lg z-50 py-1">
                  <button
                    onClick={toggleAI}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    {conversation.ai_active ? (
                      <>
                        <BotOff className="w-4 h-4 text-amber-500" />
                        <span className="text-slate-700 dark:text-slate-300">Pausar I.A.</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4 text-violet-500" />
                        <span className="text-slate-700 dark:text-slate-300">Ativar I.A.</span>
                      </>
                    )}
                  </button>
                  {conversation.contact_id && (
                    <a
                      href={`/contacts`}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-slate-700 dark:text-slate-300"
                    >
                      <User className="w-4 h-4" />
                      Ver contato no CRM
                    </a>
                  )}
                  <a
                    href={`tel:${conversation.phone}`}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-slate-700 dark:text-slate-300"
                  >
                    <Phone className="w-4 h-4" />
                    Ligar
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            Nenhuma mensagem ainda.
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const showDate = !prevMsg || !isSameDay(msg, prevMsg);
              return (
                <div key={msg.id}>
                  {showDate && <DateSeparator date={msg.whatsapp_timestamp || msg.created_at} />}
                  <MessageBubble message={msg} />
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-white dark:bg-dark-card border-t border-slate-200 dark:border-white/10">
        {conversation.ai_active && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-violet-500/5 rounded-lg text-xs text-violet-500">
            <Bot className="w-3.5 h-3.5" />
            I.A. está respondendo. Ao enviar uma mensagem, a I.A. será pausada automaticamente.
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem..."
            rows={1}
            className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-dark-bg text-sm text-slate-900 dark:text-white placeholder-slate-400 resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent max-h-32"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="p-2.5 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const isMe = message.from_me;
  const time = message.whatsapp_timestamp
    ? format(new Date(message.whatsapp_timestamp), 'HH:mm')
    : format(new Date(message.created_at), 'HH:mm');

  const isAI = message.sent_by === 'ai_agent';

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 ${
          isMe
            ? isAI
              ? 'bg-violet-500/10 border border-violet-500/20 text-slate-900 dark:text-white rounded-br-md'
              : 'bg-green-500/10 border border-green-500/20 text-slate-900 dark:text-white rounded-br-md'
            : 'bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white rounded-bl-md'
        }`}
      >
        {/* AI badge */}
        {isAI && (
          <div className="flex items-center gap-1 mb-1 text-[10px] text-violet-500 font-medium">
            <Bot className="w-3 h-3" />
            I.A.
          </div>
        )}

        {/* Content based on type */}
        <MessageContent message={message} />

        {/* Footer */}
        <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-slate-400">{time}</span>
          {isMe && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ message }: { message: WhatsAppMessage }) {
  switch (message.message_type) {
    case 'text':
      return <p className="text-sm whitespace-pre-wrap break-words">{message.text_body}</p>;
    case 'image':
      return (
        <div>
          {message.media_url && (
            <img src={message.media_url} alt="Imagem" className="rounded-xl max-w-full mb-1" />
          )}
          {message.media_caption && (
            <p className="text-sm">{message.media_caption}</p>
          )}
          {!message.media_url && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ImageIcon className="w-4 h-4" />
              Imagem
            </div>
          )}
        </div>
      );
    case 'audio':
      return (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Mic className="w-4 h-4" />
          {message.media_url ? (
            <audio controls className="max-w-[200px]">
              <source src={message.media_url} />
            </audio>
          ) : (
            'Mensagem de voz'
          )}
        </div>
      );
    case 'document':
      return (
        <div className="flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-blue-500" />
          <span>{message.media_filename || 'Documento'}</span>
        </div>
      );
    case 'location':
      return (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <MapPin className="w-4 h-4 text-red-500" />
          Localização
        </div>
      );
    case 'sticker':
      return message.media_url ? (
        <img src={message.media_url} alt="Sticker" className="w-24 h-24" />
      ) : (
        <span className="text-sm text-slate-500">Figurinha</span>
      );
    case 'reaction':
      return <span className="text-2xl">{message.text_body}</span>;
    default:
      return <p className="text-sm text-slate-500">[{message.message_type}]</p>;
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <Clock className="w-3 h-3 text-slate-300" />;
    case 'sent':
      return <Check className="w-3 h-3 text-slate-400" />;
    case 'received':
      return <CheckCheck className="w-3 h-3 text-slate-400" />;
    case 'read':
      return <CheckCheck className="w-3 h-3 text-blue-500" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-red-500" />;
    default:
      return null;
  }
}

function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  let label: string;
  if (isToday) label = 'Hoje';
  else if (isYesterday) label = 'Ontem';
  else label = format(d, "dd 'de' MMM", { locale: ptBR });

  return (
    <div className="flex items-center justify-center my-4">
      <span className="px-3 py-1 rounded-full bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 text-[11px] text-slate-500 font-medium shadow-sm">
        {label}
      </span>
    </div>
  );
}

function isSameDay(a: WhatsAppMessage, b: WhatsAppMessage): boolean {
  const dateA = new Date(a.whatsapp_timestamp || a.created_at).toDateString();
  const dateB = new Date(b.whatsapp_timestamp || b.created_at).toDateString();
  return dateA === dateB;
}

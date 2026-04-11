'use client';

import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Clock, AlertCircle, FileText, MapPin, Play, Pause, Image, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { useSendMessage } from '@/lib/query/hooks/useMessagingMessagesQuery';
import type {
  MessagingMessage,
  MessageStatus,
  TextContent,
  ImageContent,
  AudioContent,
  DocumentContent,
  LocationContent,
  ReactionContent,
} from '@/lib/messaging/types';

const QUICK_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

// ---------------------------------------------------------------------------
// Audio player helpers
// ---------------------------------------------------------------------------

/** Deterministic waveform heights from a seed string (consistent per message). */
function generateWaveform(seed: string, count = 32): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return Array.from({ length: count }, (_, i) => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
    h ^= i * 2654435761;
    return 18 + (Math.abs(h) % 72); // 18–90 %
  });
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// WhatsApp-style audio player
// ---------------------------------------------------------------------------

const AudioPlayer = memo(function AudioPlayer({
  content,
  isOutbound,
}: {
  content: AudioContent;
  isOutbound: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(content.duration ?? 0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const safeUrl = sanitizeUrl(content.mediaUrl);

  // 24 bars — wide enough to look like waveform, not too thin
  const bars = useMemo(() => generateWaveform(content.mediaUrl, 24), [content.mediaUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onMeta = () => { if (Number.isFinite(el.duration)) setDuration(el.duration); };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onMeta);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !safeUrl) return;
    isPlaying ? el.pause() : el.play().catch(() => {});
  }, [isPlaying, safeUrl]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    const bar = waveformRef.current;
    if (!el || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    el.currentTime = t;
    setCurrentTime(t);
  }, [duration]);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-2.5 select-none" style={{ minWidth: 200 }}>
      {safeUrl && <audio ref={audioRef} src={safeUrl} preload="metadata" />}

      {/* Play / Pause button */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={!safeUrl}
        aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
        className={cn(
          'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
          isOutbound
            ? 'bg-white/25 hover:bg-white/40 text-white'
            : 'bg-slate-700 hover:bg-slate-600 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900',
          !safeUrl && 'opacity-40 cursor-not-allowed',
        )}
      >
        {isPlaying
          ? <Pause className="w-4 h-4 fill-current" />
          : <Play className="w-4 h-4 fill-current translate-x-px" />}
      </button>

      {/* Waveform */}
      <div
        ref={waveformRef}
        onClick={handleSeek}
        className="flex items-center gap-[3px] cursor-pointer"
        style={{ height: 32, flex: 1 }}
        role="slider"
        aria-label="Posição do áudio"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {bars.map((pct, i) => {
          const active = (i / bars.length) < progress;
          return (
            <div
              key={i}
              className={cn(
                'w-[3px] rounded-full transition-colors duration-75',
                active
                  ? isOutbound ? 'bg-white' : 'bg-slate-700 dark:bg-slate-200'
                  : isOutbound ? 'bg-white/35' : 'bg-slate-300 dark:bg-slate-600',
              )}
              style={{ height: `${pct}%` }}
            />
          );
        })}
      </div>

      {/* Duration */}
      <span
        className={cn(
          'flex-shrink-0 text-[11px] font-mono tabular-nums w-8 text-right',
          isOutbound ? 'text-white/70' : 'text-slate-500 dark:text-slate-400',
        )}
      >
        {formatAudioTime(isPlaying ? currentTime : duration)}
      </span>
    </div>
  );
});

interface MessageBubbleProps {
  message: MessagingMessage;
  conversationId: string;
  allMessages?: MessagingMessage[];
  onReply?: (message: MessagingMessage) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatusIcon = memo(function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'pending':
    case 'queued':
      return <Clock className="w-3 h-3 text-slate-400" />;
    case 'sent':
      return <Check className="w-3 h-3 text-slate-400" />;
    case 'delivered':
      return <CheckCheck className="w-3 h-3 text-slate-400" />;
    case 'read':
      return <CheckCheck className="w-3 h-3 text-blue-500" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-red-500" />;
    default:
      return null;
  }
});

const MessageContent = memo(function MessageContent({ message }: { message: MessagingMessage }) {
  const { content, contentType } = message;
  const isOutbound = message.direction === 'outbound';

  switch (contentType) {
    case 'text': {
      const textContent = content as TextContent;
      return <p className="whitespace-pre-wrap break-words">{textContent.text}</p>;
    }

    case 'image': {
      const imageContent = content as ImageContent;
      return (
        <div className="space-y-1">
          {sanitizeUrl(imageContent.mediaUrl) && (
            <img
              src={sanitizeUrl(imageContent.mediaUrl)}
              alt={imageContent.caption || 'Imagem'}
              className="max-w-[240px] rounded-lg"
            />
          )}
          {imageContent.caption && (
            <p className="whitespace-pre-wrap break-words">{imageContent.caption}</p>
          )}
        </div>
      );
    }

    case 'document': {
      const docContent = content as DocumentContent;
      const safeDocUrl = sanitizeUrl(docContent.mediaUrl);
      return safeDocUrl ? (
        <a
          href={safeDocUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <FileText className="w-8 h-8 text-primary-500" />
          <div className="min-w-0">
            <p className="font-medium truncate">{docContent.fileName}</p>
            {docContent.fileSize && (
              <p className="text-xs opacity-70">{(docContent.fileSize / 1024).toFixed(1)} KB</p>
            )}
          </div>
        </a>
      ) : null;
    }

    case 'location': {
      const locContent = content as LocationContent;
      return (
        <a
          href={`https://maps.google.com/?q=${locContent.latitude},${locContent.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <MapPin className="w-6 h-6 text-red-500" />
          <div>
            {locContent.name && <p className="font-medium">{locContent.name}</p>}
            {locContent.address && <p className="text-xs opacity-70">{locContent.address}</p>}
          </div>
        </a>
      );
    }

    case 'audio': {
      const audioContent = content as AudioContent;
      return <AudioPlayer content={audioContent} isOutbound={isOutbound} />;
    }

    case 'video':
      return (
        <div className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          <span>Vídeo</span>
        </div>
      );

    case 'sticker':
      return (
        <div className="text-4xl">
          {sanitizeUrl((content as { mediaUrl?: string }).mediaUrl ?? '') ? (
            <img
              src={sanitizeUrl((content as { mediaUrl?: string }).mediaUrl ?? '')}
              alt="Sticker"
              className="w-24 h-24"
            />
          ) : (
            '🏷️'
          )}
        </div>
      );

    default:
      return <p className="italic opacity-70">[Tipo de mensagem não suportado]</p>;
  }
});

/** Reaction pills shown below the bubble */
const ReactionPills = memo(function ReactionPills({
  reactions,
  onReact,
}: {
  reactions: Record<string, number>;
  onReact: (emoji: string) => void;
}) {
  const entries = Object.entries(reactions).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([emoji, count]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className={cn(
            'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm',
            'bg-white dark:bg-slate-800 shadow-sm',
            'border border-slate-200 dark:border-slate-700',
            'hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors',
          )}
          aria-label={`${emoji} ${count}`}
        >
          <span>{emoji}</span>
          {count > 1 && (
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{count}</span>
          )}
        </button>
      ))}
    </div>
  );
});

/**
 * Emoji quick-picker trigger — a small smiley button that appears on hover
 * next to the bubble (in the flex row, so hover is never lost).
 * Opens a floating strip of 6 quick emojis.
 */
function EmojiPickerButton({
  onReact,
}: {
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative self-end mb-1 flex-shrink-0">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-7 h-7 flex items-center justify-center rounded-full text-base',
          'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
          'hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        )}
        aria-label="Reagir"
      >
        😊
      </button>

      {/* Floating emoji strip */}
      {open && (
        <div
          className={cn(
            'absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30',
            'flex items-center gap-0.5 px-2 py-1.5',
            'bg-white dark:bg-slate-800 rounded-full shadow-xl',
            'border border-slate-200 dark:border-slate-700',
          )}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(emoji);
                setOpen(false);
              }}
              className="text-xl w-9 h-9 flex items-center justify-center rounded-full hover:scale-125 hover:bg-slate-100 dark:hover:bg-slate-700 transition-transform duration-100"
              aria-label={`Reagir com ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Compact text preview of a message for reply quotes. */
function replyPreviewText(msg: MessagingMessage): string {
  const c = msg.content as unknown as Record<string, unknown>;
  switch (msg.contentType) {
    case 'text': return (c.text as string) || '';
    case 'audio': return '🎤 Áudio';
    case 'image': return '📷 Foto';
    case 'video': return '🎥 Vídeo';
    case 'document': return `📄 ${c.fileName ?? 'Documento'}`;
    case 'location': return '📍 Localização';
    default: return 'Mensagem';
  }
}

export const MessageBubble = memo(function MessageBubble({
  message,
  conversationId,
  allMessages,
  onReply,
}: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const time = format(new Date(message.createdAt), 'HH:mm');
  const { mutate: sendMessage } = useSendMessage();

  const reactions = (message.metadata?.reactions as Record<string, number> | undefined) ?? {};
  const canReact = !isOutbound && !!message.externalId;

  // Find the message being replied to
  const repliedToMessage = message.replyToMessageId
    ? allMessages?.find((m) => m.id === message.replyToMessageId || m.externalId === message.replyToMessageId)
    : undefined;

  const handleReact = useCallback(
    (emoji: string) => {
      if (!message.externalId) return;
      sendMessage({
        conversationId,
        content: {
          type: 'reaction',
          emoji,
          messageId: message.externalId,
        } as ReactionContent,
      });
    },
    [message.externalId, conversationId, sendMessage],
  );

  return (
    <div
      className={cn(
        'flex items-end gap-1 group',
        isOutbound ? 'justify-end' : 'justify-start',
      )}
    >
      {/* Bubble + reaction pills */}
      <div className="relative max-w-[70%]">
        <div
          className={cn(
            'rounded-2xl px-4 py-2 shadow-sm',
            isOutbound
              ? 'bg-primary-500 text-white rounded-br-md'
              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-md border border-slate-200 dark:border-slate-700',
          )}
        >
          {/* Reply quote */}
          {repliedToMessage && (
            <div
              className={cn(
                'flex gap-2 mb-2 pl-2 py-1 rounded-lg border-l-2 text-xs',
                isOutbound
                  ? 'border-white/60 bg-white/10 text-white/80'
                  : 'border-primary-400 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
              )}
            >
              <div className="min-w-0">
                <p className={cn('font-medium truncate text-[10px] mb-0.5', isOutbound ? 'text-white/60' : 'text-primary-500')}>
                  {repliedToMessage.direction === 'outbound' ? 'Você' : (repliedToMessage.senderName ?? 'Contato')}
                </p>
                <p className="truncate">{replyPreviewText(repliedToMessage)}</p>
              </div>
            </div>
          )}

          {/* Sender name (inbound only) */}
          {!isOutbound && message.senderName && (
            <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1">
              {message.senderName}
            </p>
          )}

          {/* Content */}
          <div className="text-sm">
            <MessageContent message={message} />
          </div>

          {/* Timestamp + delivery status */}
          <div
            className={cn(
              'flex items-center justify-end gap-1 mt-1',
              isOutbound ? 'text-white/70' : 'text-slate-400',
            )}
          >
            <span className="text-[10px]">{time}</span>
            {isOutbound && <StatusIcon status={message.status} />}
          </div>

          {/* Error detail */}
          {message.status === 'failed' && message.errorMessage && (
            <p className="text-xs text-red-300 mt-1">{message.errorMessage}</p>
          )}
        </div>

        <ReactionPills reactions={reactions} onReact={handleReact} />
      </div>

      {/* Action buttons — appear on hover, between bubble and edge */}
      <div
        className={cn(
          'flex items-center gap-0.5 mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          isOutbound ? 'order-first flex-row-reverse' : '',
        )}
      >
        {/* Reply button */}
        {onReply && (
          <button
            type="button"
            onClick={() => onReply(message)}
            aria-label="Responder"
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Reply className="w-4 h-4" />
          </button>
        )}

        {/* Emoji picker — only for inbound */}
        {canReact && <EmojiPickerButton onReact={handleReact} />}
      </div>
    </div>
  );
});

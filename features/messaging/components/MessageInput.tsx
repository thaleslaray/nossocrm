'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Smile, Clock, FileText, X, Loader2, Image, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSendTextMessage, useSendMessage } from '@/lib/query/hooks/useMessagingMessagesQuery';
import { useMediaUploadMutation } from '@/lib/query/hooks/useMediaUploadMutation';
import {
  useApprovedTemplatesQuery,
  useSendTemplateMutation,
} from '@/lib/query/hooks/useTemplatesQuery';
import { TemplateSelector, type TemplateData } from './TemplateSelector';
import type { ConversationView, MessageContent } from '@/lib/messaging/types';

interface MessageInputProps {
  conversation: ConversationView;
}

interface PendingMedia {
  file: File;
  preview: string | null;
  mediaType: 'image' | 'video' | 'audio' | 'document';
}

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/3gpp',
  'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
].join(',');

function getMediaType(mimeType: string): PendingMedia['mediaType'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function MessageInput({ conversation }: MessageInputProps) {
  const [text, setText] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: sendTextMessage, isPending } = useSendTextMessage();
  const sendMessage = useSendMessage();
  const uploadMedia = useMediaUploadMutation();
  const { mutate: sendTemplate, isPending: isSendingTemplate } = useSendTemplateMutation();
  const { data: templates = [], isLoading: isLoadingTemplates } = useApprovedTemplatesQuery(
    conversation.channelId
  );

  const isUploading = uploadMedia.isPending;
  const isDisabled = conversation.isWindowExpired || isPending || isSendingTemplate || isUploading;

  // Cleanup blob URL on unmount to prevent memory leaks (FIX-03)
  // Also used by clearMedia to avoid depending on the entire pendingMedia object.
  const pendingMediaRef = useRef(pendingMedia);
  useEffect(() => { pendingMediaRef.current = pendingMedia; }, [pendingMedia]);
  useEffect(() => {
    return () => {
      if (pendingMediaRef.current?.preview) {
        URL.revokeObjectURL(pendingMediaRef.current.preview);
      }
    };
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mediaType = getMediaType(file.type);
    const preview = mediaType === 'image' ? URL.createObjectURL(file) : null;

    setPendingMedia({ file, preview, mediaType });

    // Reset input so same file can be selected again
    e.target.value = '';
  }, []);

  // Stable callback — reads latest pendingMedia via ref, no dep on the state value.
  const clearMedia = useCallback(() => {
    if (pendingMediaRef.current?.preview) {
      URL.revokeObjectURL(pendingMediaRef.current.preview);
    }
    setPendingMedia(null);
  }, []);

  const handleSendMedia = useCallback(async () => {
    if (!pendingMedia || isDisabled) return;

    uploadMedia.mutate(
      { file: pendingMedia.file, conversationId: conversation.id },
      {
        onSuccess: (result) => {
          const content: MessageContent = {
            type: result.mediaType,
            mediaUrl: result.mediaUrl,
            mimeType: result.mimeType,
            fileName: result.fileName,
            fileSize: result.fileSize,
            ...(text.trim() ? { caption: text.trim() } : {}),
          } as MessageContent;

          sendMessage.mutate(
            { conversationId: conversation.id, content },
            {
              onSuccess: () => {
                setText('');
                clearMedia();
                textareaRef.current?.focus();
              },
            }
          );
        },
      }
    );
  }, [pendingMedia, isDisabled, uploadMedia, conversation.id, text, sendMessage]);

  const handleTemplateSelect = useCallback(
    (template: TemplateData, params?: Record<string, string>) => {
      const bodyParams = params
        ? Object.entries(params)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([, value]) => ({ type: 'text' as const, text: value }))
        : [];

      sendTemplate(
        {
          conversationId: conversation.id,
          templateId: template.id,
          parameters: bodyParams.length > 0 ? { body: bodyParams } : undefined,
        },
        {
          onSuccess: () => {
            setShowTemplates(false);
          },
        }
      );
    },
    [sendTemplate, conversation.id]
  );

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();

    // If media is pending, send media message instead
    if (pendingMedia) {
      handleSendMedia();
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText || isDisabled) return;

    sendTextMessage(
      { conversationId: conversation.id, text: trimmedText },
      {
        onSuccess: () => {
          setText('');
          textareaRef.current?.focus();
        },
      }
    );
  }, [text, isDisabled, sendTextMessage, conversation.id, pendingMedia, handleSendMedia]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    setText(textarea.value);
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = newHeight + 'px';
  }, []);

  // Show template selector when window expired or when manually opened
  if (showTemplates || conversation.isWindowExpired) {
    return (
      <div className="border-t border-slate-200 dark:border-white/10">
        {conversation.isWindowExpired && !showTemplates && (
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
              <Clock className="w-5 h-5" />
              <div>
                <p className="font-medium">Janela de resposta expirada</p>
                <p className="text-sm opacity-80">
                  Use um template aprovado para reabrir a conversa
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="mt-3 px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
            >
              Enviar template
            </button>
          </div>
        )}
        {showTemplates && (
          <div className="h-[400px] bg-white dark:bg-slate-900">
            <TemplateSelector
              templates={templates}
              isLoading={isLoadingTemplates || isSendingTemplate}
              onSelect={handleTemplateSelect}
              onCancel={() => setShowTemplates(false)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900"
    >
      {/* Media preview */}
      {pendingMedia && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10">
            {pendingMedia.preview ? (
              <img
                src={pendingMedia.preview}
                alt="Preview"
                className="w-16 h-16 rounded-lg object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center">
                {pendingMedia.mediaType === 'document' ? (
                  <File className="w-6 h-6 text-slate-400" />
                ) : (
                  <Image className="w-6 h-6 text-slate-400" />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                {pendingMedia.file.name}
              </p>
              <p className="text-xs text-slate-400">
                {formatFileSize(pendingMedia.file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={clearMedia}
              className="p-1 text-slate-400 hover:text-red-500 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
          title="Anexar arquivo"
          aria-label="Anexar arquivo"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Paperclip className="w-5 h-5" />
          )}
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={pendingMedia ? 'Adicionar legenda (opcional)...' : 'Digite uma mensagem...'}
            disabled={isDisabled}
            rows={1}
            className={cn(
              'w-full px-4 py-2.5 text-sm resize-none',
              'bg-slate-100 dark:bg-white/5 border border-transparent rounded-2xl',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
              'text-slate-900 dark:text-white placeholder-slate-400',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'max-h-[120px]'
            )}
            style={{ height: 'auto', minHeight: '40px' }}
          />
        </div>

        <button
          type="button"
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          title="Emojis"
          aria-label="Emojis"
        >
          <Smile className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          title="Enviar template"
          aria-label="Enviar template"
        >
          <FileText className="w-5 h-5" />
        </button>

        <button
          type="submit"
          disabled={(!text.trim() && !pendingMedia) || isDisabled}
          className={cn(
            'p-2.5 rounded-full transition-colors',
            (text.trim() || pendingMedia) && !isDisabled
              ? 'bg-primary-500 hover:bg-primary-600 text-white'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          )}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </form>
  );
}

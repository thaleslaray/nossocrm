/**
 * @fileoverview Hook de Agente de IA (Non-Streaming)
 *
 * Hook que gerencia conversação com múltiplos provedores de IA (Google, OpenAI, Anthropic)
 * usando resposta completa (não streaming) para máxima compatibilidade.
 *
 * @module hooks/useAgent
 */

import { useState, useCallback, useEffect } from 'react';
import { CallOptions } from '@/types/ai';

/**
 * Anexo em mensagem do chat
 */
export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'audio';
  url: string;
  name?: string;
  mimeType?: string;
}

export interface ToolInvocation {
  state: 'partial-call' | 'call' | 'result';
  toolCallId: string;
  toolName: string;
  args: any;
  result?: any;
}

/**
 * Mensagem na conversa com a IA
 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'data';
  content: string;
  attachments?: Attachment[];
  toolInvocations?: ToolInvocation[];
}

export type Message = AgentMessage;

interface UseAgentOptions {
  initialMessages?: AgentMessage[];
  system?: string;
  onFinish?: (message: AgentMessage) => void;
  id?: string;
  context?: CallOptions;
}

/**
 * Hook para gerenciar conversação com IA (Non-Streaming)
 */
export function useAgent({ initialMessages = [], system, onFinish, id, context }: UseAgentOptions = {}) {
  // Load from localStorage if id is provided
  const [messages, setMessages] = useState<Message[]>(() => {
    if (id) {
      const saved = localStorage.getItem(`chat_history_${id}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse chat history', e);
        }
      }
    }
    return initialMessages;
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Helper to generate unique IDs
  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Send message to AI
  const append = useCallback(
    async (content: string, attachments: Attachment[] = []) => {
      setInput('');
      setError(null);
      setIsLoading(true);

      // 1. Add user message optimistically
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content,
        attachments,
      };

      setMessages(prev => [...prev, userMessage]);

      try {
        // Este hook era um fallback non-streaming baseado em `/api/ai/actions`.
        // Como adotamos *corte seco*, o endpoint legado foi removido.
        // Migração recomendada:
        // - Chat: `components/ai/UIChat.tsx` (useChat) + `POST /api/ai/chat` (streaming)
        // - Tasks determinísticas: `POST /api/ai/tasks/*`
        throw new Error(
          'useAgent foi descontinuado: o endpoint /api/ai/actions foi removido. Use /api/ai/chat (streaming) ou /api/ai/tasks/*.'
        );

        // 3. Add assistant message (unreachable)
        // const assistantMessage: Message = {
        //   id: generateId(),
        //   role: 'assistant',
        //   content: data.result || '',
        // };

        // setMessages(prev => [...prev, assistantMessage]);
        // if (onFinish) onFinish(assistantMessage);
      } catch (err: unknown) {
        console.error('[useAgent] Error:', err);
        const asError = err instanceof Error ? err : new Error('Falha na comunicação com a IA');
        setError(asError);

        // Add error message to chat
        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: `❌ Erro: ${asError.message}`,
        };
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, system, context, onFinish]
  );

  // Handle form submit
  const handleSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      if (!input.trim()) return;
      append(input);
    },
    [input, append]
  );

  // Persistence
  useEffect(() => {
    if (id && messages.length > 0) {
      localStorage.setItem(`chat_history_${id}`, JSON.stringify(messages));
    }
  }, [messages, id]);

  // Placeholder for addToolResult (not used in non-streaming mode)
  const addToolResult = useCallback((_params: { toolCallId: string; result: any }) => {
    console.warn('[useAgent] addToolResult is a no-op in non-streaming mode');
  }, []);

  return {
    messages,
    input,
    setInput,
    append,
    handleSubmit,
    isLoading,
    error,
    setMessages,
    addToolResult,
  };
}

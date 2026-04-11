import { useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
}

interface UseCRMAgentOptions {
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
}

/**
 * Hook React `useCRMAgent` — interface para o AI Hub chat.
 *
 * Delega ao `useChat` do @ai-sdk/react apontando para `/api/ai/crm-agent`,
 * onde a lógica de IA e as API keys ficam exclusivamente no servidor.
 *
 * Expõe a mesma interface que `AIHubPage` consome:
 * `{ messages, isLoading, error, sendMessage, clearMessages, stopGeneration }`
 */
export function useCRMAgent(_options: UseCRMAgentOptions = {}) {
  const { messages: uiMessages, sendMessage: chatSendMessage, stop, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/crm-agent',
    }),
  });

  // Mapeia UIMessage[] (parts-based) → AgentMessage[] (content string)
  // para compatibilidade com o ChatMessage renderer do AIHubPage.
  const messages: AgentMessage[] = useMemo(() =>
    uiMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.parts
          .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
          .map(p => p.text)
          .join(''),
      })),
    [uiMessages]
  );

  // isLoading: true quando submetido ou streaming
  const isLoading = status === 'submitted' || status === 'streaming';

  // sendMessage: aceita string como o AIHubPage espera
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    chatSendMessage({ text: content });
  }, [chatSendMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  const stopGeneration = useCallback(() => {
    stop();
  }, [stop]);

  return {
    messages,
    isLoading,
    error: error ?? null,
    sendMessage,
    clearMessages,
    stopGeneration,
  };
}

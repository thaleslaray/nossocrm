'use client';

/**
 * @fileoverview Telegram Notification Settings Component
 *
 * Allows admins to configure the Telegram bot used for handoff notifications.
 * The bot token is write-only (never displayed after save); only the configured
 * status badge and chat ID are shown after initial setup.
 *
 * @module features/settings/components/ai/TelegramNotificationSettings
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface AISettingsResponse {
  hasTelegramBot: boolean;
  telegramChatId: string | null;
  [key: string]: unknown;
}

interface SavePayload {
  telegramBotToken?: string;
  telegramChatId?: string;
}

// =============================================================================
// API helpers
// =============================================================================

async function fetchAISettings(): Promise<AISettingsResponse> {
  const res = await fetch('/api/settings/ai', { credentials: 'include' });
  if (!res.ok) throw new Error('Falha ao carregar configurações');
  return res.json();
}

async function saveTelegramSettings(payload: SavePayload): Promise<void> {
  const res = await fetch('/api/settings/ai', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao salvar configurações');
}

// =============================================================================
// Query key (inline — no orgId needed, endpoint is auth-scoped)
// =============================================================================

const QUERY_KEY = ['settings', 'ai'] as const;

// =============================================================================
// Component
// =============================================================================

export function TelegramNotificationSettings() {
  const queryClient = useQueryClient();

  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery<AISettingsResponse>({
    queryKey: QUERY_KEY,
    queryFn: fetchAISettings,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Populate chatId from fetched data; token is never shown
  useEffect(() => {
    if (data?.telegramChatId) {
      setChatId(data.telegramChatId);
    }
  }, [data?.telegramChatId]);

  const mutation = useMutation({
    mutationFn: saveTelegramSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Also invalidate orgSettings so hasTelegramBot badge stays in sync
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] });
      setBotToken('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = () => {
    const payload: SavePayload = {};

    if (botToken.trim()) {
      payload.telegramBotToken = botToken.trim();
    }

    const trimmedChatId = chatId.trim();
    if (trimmedChatId !== (data?.telegramChatId ?? '')) {
      payload.telegramChatId = trimmedChatId;
    }

    if (Object.keys(payload).length === 0) return;

    mutation.mutate(payload);
  };

  const isSaveDisabled =
    mutation.isPending ||
    (!botToken.trim() && chatId.trim() === (data?.telegramChatId ?? ''));

  const tokenPlaceholder = data?.hasTelegramBot
    ? '••••••• (token já configurado)'
    : 'Cole o token do BotFather';

  return (
    <Card>
      <CardHeader>
        <CardTitle className={cn('flex items-center gap-2')}>
          Notificações Telegram
          {data?.hasTelegramBot && (
            <Badge variant="secondary">Configurado ✓</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Configure um bot do Telegram para receber alertas quando o agente AI
          fizer handoff para a equipe humana.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-9 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-md" />
            <div className="h-9 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-md" />
          </div>
        ) : (
          <>
            {/* Bot Token */}
            <div className="space-y-2">
              <Label htmlFor="telegram-token">Token do Bot</Label>
              <Input
                id="telegram-token"
                type="password"
                placeholder={tokenPlaceholder}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Crie um bot via @BotFather no Telegram e cole o token aqui. O
                token nunca é exibido após salvo.
              </p>
            </div>

            {/* Chat ID */}
            <div className="space-y-2">
              <Label htmlFor="telegram-chat">Chat ID ou @canal</Label>
              <Input
                id="telegram-chat"
                placeholder="Ex: -1001234567890 ou @meugrupo"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ID do grupo, canal ou usuário que receberá as notificações de
                handoff.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={isSaveDisabled}>
                {mutation.isPending
                  ? 'Salvando...'
                  : saved
                    ? 'Salvo ✓'
                    : 'Salvar'}
              </Button>
            </div>

            {/* Error feedback */}
            {mutation.isError && (
              <p className="text-sm text-destructive">
                Erro ao salvar. Verifique os dados e tente novamente.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
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
  telegramChatId?: string | null;
}

interface BotInfo {
  username: string;
  firstName: string;
}

interface DetectResult {
  found: boolean;
  chatId?: number;
  firstName?: string;
  username?: string;
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

async function fetchBotInfo(): Promise<BotInfo> {
  const res = await fetch('/api/settings/ai/telegram-info', { credentials: 'include' });
  if (!res.ok) throw new Error('Token inválido');
  return res.json();
}

async function detectTelegram(): Promise<DetectResult> {
  const res = await fetch('/api/settings/ai/telegram-detect', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return { found: false };
  return res.json();
}

// =============================================================================
// Constants
// =============================================================================

const QUERY_KEY = ['settings', 'ai'] as const;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

// =============================================================================
// Component
// =============================================================================

export function TelegramNotificationSettings() {
  const queryClient = useQueryClient();

  const [botToken, setBotToken] = useState('');
  const [saved, setSaved] = useState(false);

  // Bot info for the "open in Telegram" link
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [botInfoError, setBotInfoError] = useState(false);

  // Polling state
  const [polling, setPolling] = useState(false);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Test message state
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const { data, isLoading } = useQuery<AISettingsResponse>({
    queryKey: QUERY_KEY,
    queryFn: fetchAISettings,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const hasToken = data?.hasTelegramBot ?? false;
  const hasChatId = Boolean(data?.telegramChatId);
  const isConnected = hasToken && hasChatId;
  const isAwaiting = hasToken && !hasChatId;

  // When token is saved but no chat_id yet → fetch bot info and start polling
  useEffect(() => {
    if (!isAwaiting) return;

    setBotInfo(null);
    setBotInfoError(false);
    fetchBotInfo()
      .then(info => setBotInfo(info))
      .catch(() => setBotInfoError(true));

    startPolling();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAwaiting]);

  function startPolling() {
    setPolling(true);

    pollTimerRef.current = setInterval(async () => {
      const result = await detectTelegram();
      if (result.found && result.firstName) {
        setConnectedName(result.firstName);
        setPolling(false);
        stopPolling();
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: ['orgSettings'] });
      }
    }, POLL_INTERVAL_MS);

    pollTimeoutRef.current = setTimeout(() => {
      setPolling(false);
      stopPolling();
    }, POLL_TIMEOUT_MS);
  }

  function stopPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }

  const mutation = useMutation({
    mutationFn: saveTelegramSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['orgSettings'] });
      setBotToken('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = () => {
    if (!botToken.trim()) return;
    mutation.mutate({ telegramBotToken: botToken.trim() });
  };

  const handleDisconnect = () => {
    stopPolling();
    setConnectedName(null);
    mutation.mutate({ telegramChatId: '' });
  };

  const handleTest = async () => {
    setTestStatus('sending');
    setTestError('');
    try {
      const res = await fetch('/api/settings/ai/test-telegram', {
        method: 'POST',
        credentials: 'include',
      });
      const body = await res.json();
      if (!res.ok) {
        setTestStatus('error');
        setTestError(body.error ?? 'Erro ao enviar mensagem de teste.');
      } else {
        setTestStatus('ok');
        setTimeout(() => setTestStatus('idle'), 5000);
      }
    } catch {
      setTestStatus('error');
      setTestError('Falha de rede. Tente novamente.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={cn('flex items-center gap-2')}>
          Notificações Telegram
          {isConnected && <Badge variant="secondary">Configurado ✓</Badge>}
        </CardTitle>
        <CardDescription>
          Receba alertas no Telegram quando o agente AI fizer handoff para a equipe humana.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-9 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-md" />
            <div className="h-9 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-md" />
          </div>
        ) : isConnected ? (
          // ─── Estado: conectado ────────────────────────────────────────────
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-lg shrink-0">✓</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    {connectedName
                      ? `Conectado como ${connectedName}`
                      : 'Bot conectado e pronto para notificações'}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
                    Alertas de handoff serão enviados para este chat.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={mutation.isPending}
                className="shrink-0 text-xs"
              >
                Trocar
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleTest}
                disabled={testStatus === 'sending'}
              >
                {testStatus === 'sending'
                  ? 'Enviando...'
                  : testStatus === 'ok'
                    ? 'Mensagem enviada ✓'
                    : 'Enviar mensagem de teste'}
              </Button>
            </div>

            {testStatus === 'error' && (
              <p className="text-sm text-destructive">{testError}</p>
            )}
            {testStatus === 'ok' && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Mensagem de teste enviada com sucesso!
              </p>
            )}

            {/* Campo para atualizar o token se necessário */}
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                Atualizar token do bot
              </summary>
              <div className="mt-3 space-y-2">
                <Input
                  type="password"
                  placeholder="Cole o novo token do BotFather"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  autoComplete="off"
                />
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!botToken.trim() || mutation.isPending}
                >
                  {mutation.isPending ? 'Salvando...' : saved ? 'Salvo ✓' : 'Salvar novo token'}
                </Button>
              </div>
            </details>
          </div>
        ) : isAwaiting ? (
          // ─── Estado: aguardando o usuário dar /start ──────────────────────
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5 space-y-3 text-center">
              <p className="text-sm font-medium">Abra o bot no Telegram e clique em Start</p>
              {botInfo ? (
                <a
                  href={`https://t.me/${botInfo.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md bg-[#229ED9] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a8bbf] transition-colors"
                >
                  Abrir @{botInfo.username} no Telegram
                </a>
              ) : botInfoError ? (
                <p className="text-sm text-destructive">
                  Token inválido — verifique o token e salve novamente.
                </p>
              ) : (
                <div className="h-9 w-48 mx-auto bg-slate-100 dark:bg-slate-800 animate-pulse rounded-md" />
              )}
              {polling && (
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                  Aguardando conexão...
                </p>
              )}
              {!polling && !botInfoError && (
                <p className="text-xs text-muted-foreground">
                  Tempo esgotado.{' '}
                  <button
                    onClick={startPolling}
                    className="underline hover:text-foreground"
                  >
                    Tentar novamente
                  </button>
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Após clicar em Start no Telegram, a conexão será detectada automaticamente.
            </p>
          </div>
        ) : (
          // ─── Estado: sem token ────────────────────────────────────────────
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="telegram-token">Token do Bot</Label>
              <Input
                id="telegram-token"
                type="password"
                placeholder="Cole o token do BotFather"
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Crie um bot via{' '}
                <a
                  href="https://t.me/botfather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  @BotFather
                </a>{' '}
                no Telegram e cole o token aqui.
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={!botToken.trim() || mutation.isPending}
            >
              {mutation.isPending ? 'Salvando...' : saved ? 'Salvo ✓' : 'Salvar'}
            </Button>

            {mutation.isError && (
              <p className="text-sm text-destructive">
                Erro ao salvar. Verifique o token e tente novamente.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

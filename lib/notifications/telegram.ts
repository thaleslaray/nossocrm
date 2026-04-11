const TELEGRAM_API = 'https://api.telegram.org';

export interface TelegramBotInfo {
  id: number;
  username: string;
  firstName: string;
}

export interface TelegramRecentMessage {
  chatId: number;
  firstName: string;
  username?: string;
}

export async function getTelegramBotInfo(botToken: string): Promise<TelegramBotInfo> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`);
  const body = await res.json() as { ok: boolean; result?: { id: number; username: string; first_name: string }; description?: string };
  if (!res.ok || !body.ok) {
    throw new Error(body.description ?? `Telegram API error ${res.status}`);
  }
  return {
    id: body.result!.id,
    username: body.result!.username,
    firstName: body.result!.first_name,
  };
}

export async function detectRecentTelegramMessage(
  botToken: string,
  sinceSeconds = 120,
): Promise<TelegramRecentMessage | null> {
  const res = await fetch(
    `${TELEGRAM_API}/bot${botToken}/getUpdates?limit=20&allowed_updates=%5B%22message%22%5D`,
  );
  const body = await res.json() as {
    ok: boolean;
    result?: Array<{
      message?: {
        date: number;
        chat: { id: number; type: string };
        from?: { first_name: string; username?: string };
      };
    }>;
  };
  if (!res.ok || !body.ok || !body.result) return null;

  const cutoff = Math.floor(Date.now() / 1000) - sinceSeconds;
  const recent = body.result
    .filter(u => u.message && u.message.date >= cutoff && ['private', 'group', 'supergroup'].includes(u.message.chat.type))
    .at(-1);

  if (!recent?.message) return null;
  return {
    chatId: recent.message.chat.id,
    firstName: recent.message.from?.first_name ?? 'Usuário',
    username: recent.message.from?.username,
  };
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

interface HandoffMessageParams {
  contactName: string;
  dealTitle: string;
  stageName: string;
  lastMessage: string;
  appUrl?: string;
  dealId?: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatHandoffMessage({
  contactName,
  dealTitle,
  stageName,
  lastMessage,
  appUrl,
  dealId,
}: HandoffMessageParams): string {
  const truncated = lastMessage.slice(0, 300) + (lastMessage.length > 300 ? '...' : '');
  const lines = [
    `🔔 <b>Lead precisa de atenção humana</b>`,
    ``,
    `👤 <b>Contato:</b> ${escapeHtml(contactName)}`,
    `💼 <b>Deal:</b> ${escapeHtml(dealTitle)}`,
    `📍 <b>Estágio:</b> ${escapeHtml(stageName)}`,
    ``,
    `💬 <b>Última mensagem:</b>`,
    `<i>${escapeHtml(truncated)}</i>`,
  ];
  if (appUrl && dealId) {
    lines.push(``);
    lines.push(`🔗 <a href="${appUrl}/deals/${dealId}">Abrir no CRM</a>`);
  }
  return lines.join('\n');
}

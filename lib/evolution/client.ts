/**
 * Evolution API v2 HTTP client for WhatsApp integration.
 *
 * All instance-scoped calls go through:
 *   `${baseUrl}/endpoint/${instanceName}`
 * with `apikey` header for authentication.
 */

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface EvolutionCredentials {
  baseUrl: string;       // Evolution API server URL (e.g. https://evo.example.com)
  apiKey: string;        // Per-instance API key (from instance creation)
  instanceName: string;  // Instance name used in URL paths
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function evoRequest<T = unknown>(
  baseUrl: string,
  apiKey: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: apiKey,
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Evolution API ${res.status}: ${body}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;

  return JSON.parse(text) as T;
}

/** Shorthand for instance-scoped requests. */
function instanceRequest<T = unknown>(
  creds: EvolutionCredentials,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return evoRequest<T>(creds.baseUrl, creds.apiKey, path, options);
}

// ---------------------------------------------------------------------------
// Instance Management (use global API key)
// ---------------------------------------------------------------------------

export interface CreateInstanceConfig {
  instanceName: string;
  integration?: string;
  qrcode?: boolean;
  number?: string;
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
  webhook?: {
    url: string;
    webhookByEvents?: boolean;
    webhookBase64?: boolean;
    events: string[];
  };
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
  };
  hash: {
    apikey: string;
  };
  settings: Record<string, unknown>;
}

export function createInstance(
  baseUrl: string,
  globalApiKey: string,
  config: CreateInstanceConfig,
): Promise<CreateInstanceResponse> {
  return evoRequest<CreateInstanceResponse>(baseUrl, globalApiKey, '/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      ...config,
      integration: config.integration ?? 'WHATSAPP-BAILEYS',
    }),
  });
}

export interface FetchInstanceItem {
  instanceName: string;
  instanceId: string;
  owner?: string;
  profileName?: string;
  profilePictureUrl?: string;
  status: string;
  apikey?: string;
}

export function fetchInstances(
  baseUrl: string,
  globalApiKey: string,
  instanceName?: string,
): Promise<FetchInstanceItem[]> {
  const qs = instanceName ? `?instanceName=${encodeURIComponent(instanceName)}` : '';
  return evoRequest<FetchInstanceItem[]>(baseUrl, globalApiKey, `/instance/fetchInstances${qs}`);
}

export function deleteEvolutionInstance(
  baseUrl: string,
  globalApiKey: string,
  instanceName: string,
): Promise<{ status: string }> {
  return evoRequest(baseUrl, globalApiKey, `/instance/delete/${instanceName}`, {
    method: 'DELETE',
  });
}

export function logoutInstance(creds: EvolutionCredentials): Promise<{ status: string }> {
  return instanceRequest(creds, `/instance/logout/${creds.instanceName}`, {
    method: 'DELETE',
  });
}

export function restartInstance(creds: EvolutionCredentials): Promise<{ instance: { instanceName: string; state: string } }> {
  return instanceRequest(creds, `/instance/restart/${creds.instanceName}`, {
    method: 'PUT',
  });
}

// ---------------------------------------------------------------------------
// Connection / QR Code
// ---------------------------------------------------------------------------

export interface ConnectResponse {
  pairingCode?: string;
  code?: string;       // QR code data
  base64?: string;     // QR code as base64 image
  count?: number;
}

export function connectInstance(creds: EvolutionCredentials): Promise<ConnectResponse> {
  return instanceRequest<ConnectResponse>(creds, `/instance/connect/${creds.instanceName}`);
}

export interface ConnectionState {
  instance: {
    instanceName: string;
    state: 'open' | 'close' | 'connecting';
  };
}

export function getConnectionState(creds: EvolutionCredentials): Promise<ConnectionState> {
  return instanceRequest<ConnectionState>(creds, `/instance/connectionState/${creds.instanceName}`);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  events: string[];
}

export function setWebhook(creds: EvolutionCredentials, config: WebhookConfig): Promise<unknown> {
  return instanceRequest(creds, `/webhook/set/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export function findWebhook(creds: EvolutionCredentials): Promise<WebhookConfig> {
  return instanceRequest<WebhookConfig>(creds, `/webhook/find/${creds.instanceName}`);
}

export interface WebSocketConfig {
  enabled: boolean;
  events: string[];
}

export function setWebSocket(creds: EvolutionCredentials, config: WebSocketConfig): Promise<unknown> {
  return instanceRequest(creds, `/websocket/set/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export interface InstanceSettings {
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

export function setSettings(creds: EvolutionCredentials, settings: InstanceSettings): Promise<unknown> {
  return instanceRequest(creds, `/settings/set/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export function findSettings(creds: EvolutionCredentials): Promise<InstanceSettings> {
  return instanceRequest<InstanceSettings>(creds, `/settings/find/${creds.instanceName}`);
}

// ---------------------------------------------------------------------------
// Sending Messages
// ---------------------------------------------------------------------------

export interface MessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export interface SendMessageResponse {
  key: MessageKey;
  message: Record<string, unknown>;
  messageTimestamp: string;
  status: string;
}

export interface SendTextPayload {
  number: string;
  text: string;
  delay?: number;
  linkPreview?: boolean;
  quoted?: {
    key: { id: string };
    message?: { conversation?: string };
  };
}

export function sendText(creds: EvolutionCredentials, payload: SendTextPayload): Promise<SendMessageResponse> {
  return instanceRequest<SendMessageResponse>(creds, `/message/sendText/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface SendMediaPayload {
  number: string;
  mediatype: 'image' | 'video' | 'document';
  mimetype: string;
  caption?: string;
  media: string;       // URL or base64
  fileName?: string;
  delay?: number;
}

export function sendMedia(creds: EvolutionCredentials, payload: SendMediaPayload): Promise<SendMessageResponse> {
  return instanceRequest<SendMessageResponse>(creds, `/message/sendMedia/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface SendAudioPayload {
  number: string;
  audio: string;       // URL or base64
  delay?: number;
}

export function sendAudio(creds: EvolutionCredentials, payload: SendAudioPayload): Promise<SendMessageResponse> {
  return instanceRequest<SendMessageResponse>(creds, `/message/sendWhatsAppAudio/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendLocation(creds: EvolutionCredentials, payload: {
  number: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}): Promise<SendMessageResponse> {
  return instanceRequest<SendMessageResponse>(creds, `/message/sendLocation/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendReaction(creds: EvolutionCredentials, key: MessageKey, reaction: string): Promise<SendMessageResponse> {
  return instanceRequest<SendMessageResponse>(creds, `/message/sendReaction/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ key, reaction }),
  });
}

// ---------------------------------------------------------------------------
// Chat Management
// ---------------------------------------------------------------------------

export function findChats(creds: EvolutionCredentials): Promise<unknown[]> {
  return instanceRequest<unknown[]>(creds, `/chat/findChats/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function findMessages(
  creds: EvolutionCredentials,
  remoteJid: string,
): Promise<unknown[]> {
  return instanceRequest<unknown[]>(creds, `/chat/findMessages/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      where: { key: { remoteJid } },
    }),
  });
}

export function findContacts(
  creds: EvolutionCredentials,
  remoteJid?: string,
): Promise<unknown[]> {
  return instanceRequest<unknown[]>(creds, `/chat/findContacts/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify(remoteJid ? { where: { id: remoteJid } } : {}),
  });
}

export function checkPhoneExists(
  creds: EvolutionCredentials,
  numbers: string[],
): Promise<Array<{ exists: boolean; jid: string; number: string }>> {
  return instanceRequest(creds, `/chat/whatsappNumbers/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ numbers }),
  });
}

export function markAsRead(
  creds: EvolutionCredentials,
  readMessages: Array<{ remoteJid: string; fromMe: boolean; id: string }>,
): Promise<unknown> {
  return instanceRequest(creds, `/chat/markMessageAsRead/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ readMessages }),
  });
}

export function sendPresence(
  creds: EvolutionCredentials,
  number: string,
  presence: 'composing' | 'recording' = 'composing',
  delay = 3000,
): Promise<unknown> {
  return instanceRequest(creds, `/chat/sendPresence/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number,
      options: { delay, presence, number },
    }),
  });
}

export function getBase64FromMedia(
  creds: EvolutionCredentials,
  messageId: string,
  convertToMp4 = false,
): Promise<{ base64: string; mimetype: string }> {
  return instanceRequest(creds, `/chat/getBase64FromMediaMessage/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      message: { key: { id: messageId } },
      convertToMp4,
    }),
  });
}

export function fetchProfilePicUrl(
  creds: EvolutionCredentials,
  number: string,
): Promise<{ profilePictureUrl?: string }> {
  return instanceRequest(creds, `/chat/fetchProfilePicUrl/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ number }),
  });
}

// ---------------------------------------------------------------------------
// Presence (instance-level)
// ---------------------------------------------------------------------------

export function setInstancePresence(
  creds: EvolutionCredentials,
  presence: 'available' | 'unavailable',
): Promise<unknown> {
  return instanceRequest(creds, `/instance/setPresence/${creds.instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ presence }),
  });
}

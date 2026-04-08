/**
 * @fileoverview Channel Providers Index
 *
 * Exports all channel providers and registers them with the factory.
 *
 * @module lib/messaging/providers
 */

// Base provider
export { BaseChannelProvider } from './base.provider';

// WhatsApp providers
export { ZApiWhatsAppProvider, MetaCloudWhatsAppProvider, EvolutionWhatsAppProvider } from './whatsapp';
export type {
  ZApiCredentials,
  ZApiWebhookPayload,
  MetaCloudCredentials,
  MetaCloudWebhookPayload,
  EvolutionCredentials,
  EvolutionWebhookPayload,
} from './whatsapp';

// Instagram providers
export { MetaInstagramProvider } from './instagram';
export type { MetaInstagramCredentials } from './instagram';

// Email providers
export { ResendEmailProvider } from './email';
export type { ResendCredentials, ResendWebhookPayload } from './email';

// =============================================================================
// FACTORY REGISTRATION
// =============================================================================

import { registerProvider } from '../channel-factory';
import { ZApiWhatsAppProvider, MetaCloudWhatsAppProvider, EvolutionWhatsAppProvider } from './whatsapp';
import { MetaInstagramProvider } from './instagram';
import { ResendEmailProvider } from './email';

// Register Z-API provider
registerProvider({
  channelType: 'whatsapp',
  providerName: 'z-api',
  constructor: ZApiWhatsAppProvider,
  displayName: 'Z-API',
  description: 'WhatsApp via Z-API (não oficial, baseado em QR code)',
  configFields: [
    {
      key: 'instanceId',
      label: 'Instance ID',
      type: 'text',
      required: true,
      placeholder: 'seu-instance-id',
    },
    {
      key: 'token',
      label: 'Token',
      type: 'password',
      required: true,
      placeholder: 'seu-token',
    },
    {
      key: 'clientToken',
      label: 'Client Token (opcional)',
      type: 'password',
      required: false,
      placeholder: 'seu-client-token',
    },
  ],
  features: ['media', 'read_receipts', 'qr_code'],
});

// Register Meta Cloud API provider
registerProvider({
  channelType: 'whatsapp',
  providerName: 'meta-cloud',
  constructor: MetaCloudWhatsAppProvider,
  displayName: 'Meta Cloud API',
  description: 'WhatsApp oficial via Meta Business API (requer verificação)',
  configFields: [
    {
      key: 'phoneNumberId',
      label: 'Phone Number ID',
      type: 'text',
      required: true,
      placeholder: 'ID do número no Meta Business',
      helpText: 'Encontre no Meta Business Suite > WhatsApp > API Setup',
    },
    {
      key: 'accessToken',
      label: 'Access Token',
      type: 'password',
      required: true,
      placeholder: 'Token de acesso permanente',
      helpText: 'Gere um token permanente no Meta Business Suite',
    },
    {
      key: 'wabaId',
      label: 'WABA ID (opcional)',
      type: 'text',
      required: false,
      placeholder: 'ID da conta WhatsApp Business',
      helpText: 'Necessário para sincronizar templates',
    },
    {
      key: 'appSecret',
      label: 'App Secret (opcional)',
      type: 'password',
      required: false,
      placeholder: 'Segredo do app Meta',
      helpText: 'Para verificação de assinatura de webhooks',
    },
    {
      key: 'verifyToken',
      label: 'Verify Token (opcional)',
      type: 'text',
      required: false,
      placeholder: 'Token de verificação de webhook',
      helpText: 'Token customizado para validar configuração de webhook',
    },
  ],
  features: ['media', 'read_receipts', 'templates'],
});

// Register Meta Instagram provider
registerProvider({
  channelType: 'instagram',
  providerName: 'meta',
  constructor: MetaInstagramProvider,
  displayName: 'Meta (Instagram)',
  description: 'Instagram DM via Meta Messenger Platform API',
  configFields: [
    {
      key: 'pageId',
      label: 'Page ID',
      type: 'text',
      required: true,
      placeholder: 'ID da página Facebook vinculada',
      helpText: 'ID da página Facebook conectada à conta Instagram',
    },
    {
      key: 'instagramAccountId',
      label: 'Instagram Account ID',
      type: 'text',
      required: true,
      placeholder: 'ID da conta Instagram Business',
      helpText: 'Encontre no Meta Business Suite > Instagram > Configurações',
    },
    {
      key: 'accessToken',
      label: 'Access Token',
      type: 'password',
      required: true,
      placeholder: 'Token de acesso da página',
      helpText: 'Token com permissão instagram_manage_messages',
    },
    {
      key: 'appSecret',
      label: 'App Secret (opcional)',
      type: 'password',
      required: false,
      placeholder: 'Segredo do app Meta',
      helpText: 'Para verificação de assinatura de webhooks',
    },
    {
      key: 'verifyToken',
      label: 'Verify Token (opcional)',
      type: 'text',
      required: false,
      placeholder: 'Token de verificação de webhook',
      helpText: 'Token customizado para validar configuração de webhook',
    },
  ],
  features: ['media', 'read_receipts'],
});

// Register Resend Email provider
registerProvider({
  channelType: 'email',
  providerName: 'resend',
  constructor: ResendEmailProvider,
  displayName: 'Resend',
  description: 'Email transacional via Resend API (moderno, fácil setup)',
  configFields: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 're_xxxxxxxxxx',
      helpText: 'Encontre em resend.com/api-keys',
    },
    {
      key: 'fromName',
      label: 'Nome do Remetente',
      type: 'text',
      required: true,
      placeholder: 'Sua Empresa',
      helpText: 'Nome que aparece no "De:" do email',
    },
    {
      key: 'fromEmail',
      label: 'Email do Remetente',
      type: 'email',
      required: true,
      placeholder: 'noreply@suaempresa.com',
      helpText: 'Deve ser de um domínio verificado no Resend',
    },
    {
      key: 'replyTo',
      label: 'Reply-To (opcional)',
      type: 'email',
      required: false,
      placeholder: 'contato@suaempresa.com',
      helpText: 'Endereço para receber respostas',
    },
  ],
  features: ['read_receipts'],
});

// Register Evolution API provider
registerProvider({
  channelType: 'whatsapp',
  providerName: 'evolution',
  constructor: EvolutionWhatsAppProvider,
  displayName: 'Evolution API',
  description: 'WhatsApp via Evolution API (self-hosted, gratuito, open-source)',
  configFields: [
    {
      key: 'serverUrl',
      label: 'URL do Servidor',
      type: 'text',
      required: true,
      placeholder: 'http://localhost:8080',
      helpText: 'URL do servidor Evolution API (sem barra no final)',
    },
    {
      key: 'instanceName',
      label: 'Nome da Instância',
      type: 'text',
      required: true,
      placeholder: 'minha-instancia',
      helpText: 'Nome da instância criada no servidor Evolution API',
    },
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'sua-api-key',
      helpText: 'AUTHENTICATION_API_KEY configurado no servidor Evolution API',
    },
    {
      key: 'webhookSecret',
      label: 'Webhook Secret (opcional)',
      type: 'password',
      required: false,
      placeholder: 'secret-para-validar-webhooks',
      helpText: 'Se configurado, valida os webhooks recebidos. Recomendado para produção.',
    },
  ],
  features: ['media', 'read_receipts', 'qr_code'],
});

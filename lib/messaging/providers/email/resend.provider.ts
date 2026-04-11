/**
 * @fileoverview Resend Email Provider
 *
 * Implements email sending via Resend API.
 * Supports plain text and HTML emails with tracking.
 *
 * @see https://resend.com/docs
 * @module lib/messaging/providers/email/resend
 */

import { Resend } from 'resend';
import { BaseChannelProvider } from '../base.provider';
import type {
  ProviderConfig,
  ValidationResult,
  ValidationError,
  ConnectionStatusResult,
  SendMessageParams,
  SendMessageResult,
  WebhookHandlerResult,
  MessageReceivedEvent,
  StatusUpdateEvent,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

export interface ResendCredentials {
  apiKey: string;
  fromName: string;
  fromEmail: string;
  /** Optional reply-to address */
  replyTo?: string;
}

export interface ResendWebhookPayload {
  type:
    | 'email.sent'
    | 'email.delivered'
    | 'email.delivery_delayed'
    | 'email.complained'
    | 'email.bounced'
    | 'email.opened'
    | 'email.clicked';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // For bounced emails
    bounce?: {
      message: string;
    };
    // For clicked emails
    click?: {
      link: string;
      timestamp: string;
      userAgent: string;
    };
  };
}

// =============================================================================
// PROVIDER IMPLEMENTATION
// =============================================================================

/**
 * Email provider using Resend API.
 *
 * Features:
 * - Plain text and HTML email support
 * - Delivery tracking via webhooks
 * - Open and click tracking
 * - Bounce handling
 *
 * @example
 * ```ts
 * const provider = new ResendEmailProvider();
 * await provider.initialize({
 *   channelId: 'abc123',
 *   channelType: 'email',
 *   provider: 'resend',
 *   externalIdentifier: 'noreply@empresa.com',
 *   credentials: {
 *     apiKey: 're_xxxx',
 *     fromName: 'Empresa',
 *     fromEmail: 'noreply@empresa.com',
 *   },
 * });
 *
 * await provider.sendMessage({
 *   conversationId: 'conv123',
 *   to: 'cliente@email.com',
 *   content: {
 *     type: 'text',
 *     text: 'Olá! Esta é uma mensagem de teste.',
 *     // Optional: subject for email
 *     subject: 'Assunto do email',
 *   },
 * });
 * ```
 */
export class ResendEmailProvider extends BaseChannelProvider {
  readonly channelType = 'email' as const;
  readonly providerName = 'resend';

  private client: Resend | null = null;
  private fromName: string = '';
  private fromEmail: string = '';
  private replyTo: string | undefined;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);

    const apiKey = this.getRequiredCredential('apiKey');
    this.fromName = this.getRequiredCredential('fromName');
    this.fromEmail = this.getRequiredCredential('fromEmail');
    this.replyTo = this.getCredential('replyTo');

    this.client = new Resend(apiKey);

    this.log('info', 'Initialized Resend provider', {
      from: `${this.fromName} <${this.fromEmail}>`,
    });
  }

  async disconnect(): Promise<void> {
    this.client = null;
    await super.disconnect();
  }

  async getStatus(): Promise<ConnectionStatusResult> {
    this.ensureInitialized();

    // Resend doesn't have a status endpoint, but we can verify the API key
    // by attempting to list domains (lightweight call)
    try {
      const response = await this.client!.domains.list();

      if (response.error) {
        return {
          status: 'error',
          message: response.error.message,
        };
      }

      return {
        status: 'connected',
        message: 'API key válida',
        details: {
          domainsCount: response.data?.data?.length ?? 0,
          fromEmail: this.fromEmail,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  validateConfig(config: ProviderConfig): ValidationResult {
    const baseValidation = super.validateConfig(config);
    const errors: ValidationError[] = [...(baseValidation.errors || [])];

    const { credentials } = config;

    if (!credentials.apiKey) {
      errors.push({
        field: 'credentials.apiKey',
        message: 'API Key do Resend é obrigatória',
        code: 'REQUIRED',
      });
    } else if (!String(credentials.apiKey).startsWith('re_')) {
      errors.push({
        field: 'credentials.apiKey',
        message: 'API Key do Resend deve começar com "re_"',
        code: 'INVALID_FORMAT',
      });
    }

    if (!credentials.fromName) {
      errors.push({
        field: 'credentials.fromName',
        message: 'Nome do remetente é obrigatório',
        code: 'REQUIRED',
      });
    }

    if (!credentials.fromEmail) {
      errors.push({
        field: 'credentials.fromEmail',
        message: 'Email do remetente é obrigatório',
        code: 'REQUIRED',
      });
    } else if (!this.isValidEmail(String(credentials.fromEmail))) {
      errors.push({
        field: 'credentials.fromEmail',
        message: 'Email do remetente inválido',
        code: 'INVALID_FORMAT',
      });
    }

    if (credentials.replyTo && !this.isValidEmail(String(credentials.replyTo))) {
      errors.push({
        field: 'credentials.replyTo',
        message: 'Reply-To inválido',
        code: 'INVALID_FORMAT',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    this.ensureInitialized();

    const { to, content, replyToExternalId } = params;

    // Validate recipient
    if (!this.isValidEmail(to)) {
      return this.errorResult('INVALID_RECIPIENT', `Email inválido: ${to}`);
    }

    // Build email content
    const subject = (content as { subject?: string }).subject || 'Mensagem';
    const textContent = (content as { text?: string }).text || '';
    const htmlContent = (content as { html?: string }).html;

    try {
      const response = await this.client!.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: [to],
        subject,
        text: textContent,
        html: htmlContent,
        replyTo: this.replyTo,
        headers: replyToExternalId
          ? { 'In-Reply-To': replyToExternalId, References: replyToExternalId }
          : undefined,
      });

      if (response.error) {
        this.log('error', 'Failed to send email', response.error);
        return this.errorResult(
          response.error.name || 'SEND_ERROR',
          response.error.message,
          this.isRetryable(response.error.name)
        );
      }

      this.log('info', 'Email sent successfully', { emailId: response.data?.id });

      return this.successResult(response.data?.id || '');
    } catch (error) {
      this.log('error', 'Exception sending email', error);
      return this.errorResult(
        'EXCEPTION',
        error instanceof Error ? error.message : 'Erro desconhecido',
        true
      );
    }
  }

  private isRetryable(errorName?: string): boolean {
    // Resend error types that are retryable
    const retryableErrors = ['rate_limit_exceeded', 'internal_server_error'];
    return retryableErrors.includes(errorName?.toLowerCase() || '');
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  async handleWebhook(payload: unknown): Promise<WebhookHandlerResult> {
    const data = payload as ResendWebhookPayload;

    if (!data.type || !data.data) {
      return {
        type: 'error',
        data: {
          type: 'error',
          code: 'INVALID_PAYLOAD',
          message: 'Payload inválido do webhook Resend',
          timestamp: new Date(),
        },
        raw: payload,
      };
    }

    const emailId = data.data.email_id;
    const timestamp = new Date(data.created_at);

    switch (data.type) {
      case 'email.sent':
        return {
          type: 'status_update',
          externalId: emailId,
          data: {
            type: 'status_update',
            externalMessageId: emailId,
            status: 'sent',
            timestamp,
          } as StatusUpdateEvent,
          raw: payload,
        };

      case 'email.delivered':
        return {
          type: 'status_update',
          externalId: emailId,
          data: {
            type: 'status_update',
            externalMessageId: emailId,
            status: 'delivered',
            timestamp,
          } as StatusUpdateEvent,
          raw: payload,
        };

      case 'email.opened':
        return {
          type: 'status_update',
          externalId: emailId,
          data: {
            type: 'status_update',
            externalMessageId: emailId,
            status: 'read',
            timestamp,
          } as StatusUpdateEvent,
          raw: payload,
        };

      case 'email.bounced':
        return {
          type: 'status_update',
          externalId: emailId,
          data: {
            type: 'status_update',
            externalMessageId: emailId,
            status: 'failed',
            error: {
              code: 'BOUNCED',
              message: data.data.bounce?.message || 'Email bounced',
            },
            timestamp,
          } as StatusUpdateEvent,
          raw: payload,
        };

      case 'email.complained':
        return {
          type: 'status_update',
          externalId: emailId,
          data: {
            type: 'status_update',
            externalMessageId: emailId,
            status: 'failed',
            error: {
              code: 'COMPLAINED',
              message: 'Recipient marked email as spam',
            },
            timestamp,
          } as StatusUpdateEvent,
          raw: payload,
        };

      case 'email.clicked':
        // Click events don't change status, but we log them
        this.log('info', 'Email link clicked', {
          emailId,
          link: data.data.click?.link,
        });
        return {
          type: 'status_update',
          externalId: emailId,
          data: {
            type: 'status_update',
            externalMessageId: emailId,
            status: 'read', // Keep as read
            timestamp,
          } as StatusUpdateEvent,
          raw: payload,
        };

      case 'email.delivery_delayed':
        // Delayed delivery doesn't fail, just log
        this.log('warn', 'Email delivery delayed', { emailId });
        return {
          type: 'status_update',
          externalId: emailId,
          data: {
            type: 'status_update',
            externalMessageId: emailId,
            status: 'sent', // Still sent, just delayed
            timestamp,
          } as StatusUpdateEvent,
          raw: payload,
        };

      default:
        return {
          type: 'error',
          data: {
            type: 'error',
            code: 'UNKNOWN_EVENT',
            message: `Unknown webhook event: ${data.type}`,
            timestamp: new Date(),
          },
          raw: payload,
        };
    }
  }

  /**
   * Verify Resend webhook signature.
   *
   * Resend uses Svix for webhook signatures.
   * @see https://resend.com/docs/webhooks#verify-webhook-signatures
   */
  verifyWebhookSignature(payload: unknown, signature: string): boolean {
    // For now, we trust the webhook if it comes from a valid source
    // Full Svix verification can be implemented with the svix package
    // const svixId = headers['svix-id'];
    // const svixTimestamp = headers['svix-timestamp'];
    // const svixSignature = headers['svix-signature'];
    // Use: https://docs.svix.com/receiving/verifying-payloads/how

    // Basic check: signature should exist
    return !!signature;
  }
}

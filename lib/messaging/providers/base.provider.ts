/**
 * @fileoverview Base Channel Provider
 *
 * Abstract base class for channel providers.
 * Provides common functionality and enforces interface compliance.
 *
 * @module lib/messaging/providers/base
 */

import type {
  ChannelType,
  IChannelProvider,
  ProviderConfig,
  ValidationResult,
  ValidationError,
  ConnectionStatusResult,
  SendMessageParams,
  SendMessageResult,
  WebhookHandlerResult,
} from '../types';

/**
 * Abstract base class for channel providers.
 *
 * Provides:
 * - Configuration storage
 * - Default implementations for optional methods
 * - Utility methods for common operations
 *
 * @example
 * ```ts
 * class MyProvider extends BaseChannelProvider {
 *   readonly channelType = 'whatsapp';
 *   readonly providerName = 'my-provider';
 *
 *   async initialize(config: ProviderConfig): Promise<void> {
 *     await super.initialize(config);
 *     // Custom initialization
 *   }
 *
 *   async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
 *     // Implementation
 *   }
 *
 *   // ... other methods
 * }
 * ```
 */
export abstract class BaseChannelProvider implements IChannelProvider {
  // -------------------------------------------------------------------------
  // Abstract Properties (must be implemented)
  // -------------------------------------------------------------------------

  abstract readonly channelType: ChannelType;
  abstract readonly providerName: string;

  // -------------------------------------------------------------------------
  // Protected State
  // -------------------------------------------------------------------------

  protected config: ProviderConfig | null = null;
  protected isInitialized: boolean = false;

  // -------------------------------------------------------------------------
  // Lifecycle Methods
  // -------------------------------------------------------------------------

  /**
   * Initialize the provider with configuration.
   * Override to add custom initialization logic.
   */
  async initialize(config: ProviderConfig): Promise<void> {
    // Validate config first
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      const errors = validation.errors?.map((e) => e.message).join(', ');
      throw new Error(`Invalid configuration: ${errors}`);
    }

    this.config = config;
    this.isInitialized = true;
  }

  /**
   * Disconnect from the service.
   * Override to add cleanup logic.
   */
  async disconnect(): Promise<void> {
    this.config = null;
    this.isInitialized = false;
  }

  /**
   * Get connection status.
   * Must be implemented by subclasses.
   */
  abstract getStatus(): Promise<ConnectionStatusResult>;

  // -------------------------------------------------------------------------
  // Messaging Methods (must be implemented)
  // -------------------------------------------------------------------------

  abstract sendMessage(params: SendMessageParams): Promise<SendMessageResult>;

  abstract handleWebhook(payload: unknown): Promise<WebhookHandlerResult>;

  // -------------------------------------------------------------------------
  // Validation (can be overridden)
  // -------------------------------------------------------------------------

  /**
   * Validate provider configuration.
   * Override to add custom validation.
   */
  validateConfig(config: ProviderConfig): ValidationResult {
    const errors: ValidationError[] = [];

    if (!config.channelId) {
      errors.push({
        field: 'channelId',
        message: 'Channel ID is required',
        code: 'REQUIRED',
      });
    }

    if (!config.externalIdentifier) {
      errors.push({
        field: 'externalIdentifier',
        message: 'External identifier is required',
        code: 'REQUIRED',
      });
    }

    if (!config.credentials) {
      errors.push({
        field: 'credentials',
        message: 'Credentials are required',
        code: 'REQUIRED',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Ensure the provider is initialized before operations.
   */
  protected ensureInitialized(): void {
    if (!this.isInitialized || !this.config) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
  }

  /**
   * Get a credential value.
   */
  protected getCredential(key: string): string | undefined {
    return this.config?.credentials[key];
  }

  /**
   * Get a required credential value.
   * @throws Error if the credential is missing
   */
  protected getRequiredCredential(key: string): string {
    const value = this.getCredential(key);
    if (!value) {
      throw new Error(`Missing required credential: ${key}`);
    }
    return value;
  }

  /**
   * Get a setting value.
   */
  protected getSetting<T>(key: string, defaultValue: T): T {
    const value = this.config?.settings?.[key];
    return (value as T) ?? defaultValue;
  }

  /**
   * Create a successful send result.
   */
  protected successResult(externalMessageId: string): SendMessageResult {
    return {
      success: true,
      externalMessageId,
      status: 'sent',
    };
  }

  /**
   * Create an error send result.
   */
  protected errorResult(
    code: string,
    message: string,
    retryable: boolean = false
  ): SendMessageResult {
    return {
      success: false,
      error: { code, message, retryable },
    };
  }

  /**
   * Log with provider context.
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    const prefix = `[${this.channelType}/${this.providerName}]`;
    const fn = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error;
    fn(`${prefix} ${message}`, data ?? '');
  }
}

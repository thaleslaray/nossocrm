/**
 * @fileoverview Channel Provider Factory
 *
 * Factory pattern implementation for creating channel provider instances.
 * Providers are registered at runtime and created on-demand.
 *
 * @module lib/messaging/channel-factory
 *
 * @example
 * ```ts
 * // Get a provider instance
 * const provider = ChannelProviderFactory.createProvider('whatsapp', 'z-api');
 *
 * // Initialize with config
 * await provider.initialize({
 *   channelId: 'uuid',
 *   channelType: 'whatsapp',
 *   provider: 'z-api',
 *   externalIdentifier: '+5511999999999',
 *   credentials: { instanceId: '...', token: '...' },
 * });
 *
 * // Send a message
 * const result = await provider.sendMessage({
 *   conversationId: 'uuid',
 *   to: '+5511888888888',
 *   content: { type: 'text', text: 'Hello!' },
 * });
 * ```
 */

import type {
  ChannelType,
  IChannelProvider,
  ProviderConstructor,
  ProviderRegistryEntry,
  ProviderConfigField,
  ProviderFeature,
} from './types';

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

/**
 * Internal registry of provider constructors.
 * Maps channel type -> provider name -> constructor.
 */
const PROVIDER_REGISTRY: Record<string, Record<string, ProviderRegistryEntry>> = {};

// =============================================================================
// FACTORY CLASS
// =============================================================================

/**
 * Factory for creating channel provider instances.
 *
 * Uses the Factory pattern to:
 * - Decouple provider creation from usage
 * - Support runtime registration of new providers
 * - Provide metadata about available providers
 *
 * @example
 * ```ts
 * // Register a custom provider
 * ChannelProviderFactory.registerProvider({
 *   channelType: 'whatsapp',
 *   providerName: 'custom-api',
 *   constructor: CustomWhatsAppProvider,
 *   displayName: 'Custom WhatsApp API',
 *   description: 'Custom implementation',
 *   configFields: [...],
 *   features: ['media', 'templates'],
 * });
 *
 * // Create an instance
 * const provider = ChannelProviderFactory.createProvider('whatsapp', 'custom-api');
 * ```
 */
export class ChannelProviderFactory {
  /**
   * Create a new provider instance.
   *
   * @param channelType - The channel type (e.g., 'whatsapp', 'instagram')
   * @param providerName - The provider name (e.g., 'z-api', 'meta-cloud')
   * @returns A new provider instance
   * @throws Error if the channel type or provider is not registered
   */
  static createProvider(channelType: ChannelType, providerName: string): IChannelProvider {
    const channelProviders = PROVIDER_REGISTRY[channelType];

    if (!channelProviders) {
      throw new Error(
        `Unknown channel type: ${channelType}. ` +
          `Registered types: ${Object.keys(PROVIDER_REGISTRY).join(', ') || 'none'}`
      );
    }

    const entry = channelProviders[providerName];

    if (!entry) {
      throw new Error(
        `Unknown provider "${providerName}" for channel "${channelType}". ` +
          `Available providers: ${Object.keys(channelProviders).join(', ') || 'none'}`
      );
    }

    return new entry.constructor();
  }

  /**
   * Register a new provider.
   *
   * @param entry - The provider registry entry
   */
  static registerProvider(entry: ProviderRegistryEntry): void {
    const { channelType, providerName } = entry;

    if (!PROVIDER_REGISTRY[channelType]) {
      PROVIDER_REGISTRY[channelType] = {};
    }

    // Warn if overwriting
    if (PROVIDER_REGISTRY[channelType][providerName]) {
      console.warn(
        `[ChannelProviderFactory] Overwriting provider: ${channelType}/${providerName}`
      );
    }

    PROVIDER_REGISTRY[channelType][providerName] = entry;
  }

  /**
   * Check if a provider is registered.
   *
   * @param channelType - The channel type
   * @param providerName - The provider name
   * @returns True if the provider is registered
   */
  static hasProvider(channelType: ChannelType, providerName: string): boolean {
    return Boolean(PROVIDER_REGISTRY[channelType]?.[providerName]);
  }

  /**
   * Get list of supported providers for a channel type.
   *
   * @param channelType - The channel type
   * @returns Array of provider names
   */
  static getSupportedProviders(channelType: ChannelType): string[] {
    return Object.keys(PROVIDER_REGISTRY[channelType] || {});
  }

  /**
   * Get list of supported channel types.
   *
   * @returns Array of channel types
   */
  static getSupportedChannelTypes(): ChannelType[] {
    return Object.keys(PROVIDER_REGISTRY) as ChannelType[];
  }

  /**
   * Get provider metadata.
   *
   * @param channelType - The channel type
   * @param providerName - The provider name
   * @returns Provider registry entry or undefined
   */
  static getProviderInfo(
    channelType: ChannelType,
    providerName: string
  ): ProviderRegistryEntry | undefined {
    return PROVIDER_REGISTRY[channelType]?.[providerName];
  }

  /**
   * Get all providers for a channel type with metadata.
   *
   * @param channelType - The channel type
   * @returns Array of provider registry entries
   */
  static getProvidersForChannel(channelType: ChannelType): ProviderRegistryEntry[] {
    const channelProviders = PROVIDER_REGISTRY[channelType];
    if (!channelProviders) return [];
    return Object.values(channelProviders);
  }

  /**
   * Get all registered providers across all channel types.
   *
   * @returns Array of provider registry entries
   */
  static getAllProviders(): ProviderRegistryEntry[] {
    const providers: ProviderRegistryEntry[] = [];
    for (const channelType of Object.keys(PROVIDER_REGISTRY)) {
      providers.push(...Object.values(PROVIDER_REGISTRY[channelType]));
    }
    return providers;
  }

  /**
   * Get configuration fields for a provider.
   *
   * @param channelType - The channel type
   * @param providerName - The provider name
   * @returns Array of config fields or empty array
   */
  static getConfigFields(
    channelType: ChannelType,
    providerName: string
  ): ProviderConfigField[] {
    return PROVIDER_REGISTRY[channelType]?.[providerName]?.configFields || [];
  }

  /**
   * Get features supported by a provider.
   *
   * @param channelType - The channel type
   * @param providerName - The provider name
   * @returns Array of features or empty array
   */
  static getProviderFeatures(
    channelType: ChannelType,
    providerName: string
  ): ProviderFeature[] {
    return PROVIDER_REGISTRY[channelType]?.[providerName]?.features || [];
  }

  /**
   * Check if a provider supports a specific feature.
   *
   * @param channelType - The channel type
   * @param providerName - The provider name
   * @param feature - The feature to check
   * @returns True if the provider supports the feature
   */
  static providerSupportsFeature(
    channelType: ChannelType,
    providerName: string,
    feature: ProviderFeature
  ): boolean {
    const features = this.getProviderFeatures(channelType, providerName);
    return features.includes(feature);
  }

  /**
   * Clear all registered providers (for testing).
   */
  static clearRegistry(): void {
    for (const key of Object.keys(PROVIDER_REGISTRY)) {
      delete PROVIDER_REGISTRY[key];
    }
  }
}

// =============================================================================
// PROVIDER REGISTRATION HELPER
// =============================================================================

/**
 * Helper function to register a provider with less boilerplate.
 *
 * @param entry - The provider registry entry
 *
 * @example
 * ```ts
 * registerProvider({
 *   channelType: 'whatsapp',
 *   providerName: 'z-api',
 *   constructor: ZApiProvider,
 *   displayName: 'Z-API',
 *   description: 'WhatsApp Web API não-oficial',
 *   configFields: [
 *     { key: 'instanceId', label: 'Instance ID', type: 'text', required: true },
 *     { key: 'token', label: 'Token', type: 'password', required: true },
 *   ],
 *   features: ['media', 'qr_code'],
 * });
 * ```
 */
export function registerProvider(entry: ProviderRegistryEntry): void {
  ChannelProviderFactory.registerProvider(entry);
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type { ProviderRegistryEntry, ProviderConfigField, ProviderFeature };

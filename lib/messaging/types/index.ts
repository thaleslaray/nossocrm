/**
 * @fileoverview Messaging Types Index
 *
 * Central export for all messaging-related types.
 * Import from this file for cleaner imports.
 *
 * @module lib/messaging/types
 *
 * @example
 * ```ts
 * import {
 *   MessagingChannel,
 *   MessagingConversation,
 *   MessagingMessage,
 *   IChannelProvider,
 * } from '@/lib/messaging/types';
 * ```
 */

// =============================================================================
// BUSINESS UNITS
// =============================================================================

export type {
  DbBusinessUnit,
  DbBusinessUnitMember,
  BusinessUnit,
  BusinessUnitView,
  BusinessUnitMember,
  CreateBusinessUnitInput,
  UpdateBusinessUnitInput,
  ManageMembersInput,
} from './business-unit.types';

export {
  transformBusinessUnit,
  transformBusinessUnitToDb,
  validateBusinessUnitKey,
  generateBusinessUnitKey,
} from './business-unit.types';

// =============================================================================
// CHANNELS
// =============================================================================

export type {
  ChannelType,
  ChannelStatus,
  DbMessagingChannel,
  MessagingChannel,
  ChannelSettings,
  ZApiCredentials,
  MetaCloudCredentials,
  MetaInstagramCredentials,
  SmtpCredentials,
  ResendCredentials,
  CreateChannelInput,
  UpdateChannelInput,
} from './channel.types';

export {
  CHANNEL_PROVIDERS,
  CHANNEL_STATUS_LABELS,
  CHANNEL_STATUS_COLORS,
  CHANNEL_TYPE_INFO,
  transformChannel,
  transformChannelToDb,
} from './channel.types';

// =============================================================================
// MESSAGES & CONVERSATIONS
// =============================================================================

export type {
  ConversationStatus,
  ConversationPriority,
  MessageDirection,
  MessageContentType,
  MessageStatus,
  DbMessagingConversation,
  DbMessagingMessage,
  MessagingConversation,
  ConversationView,
  MessagingMessage,
  MessageContent,
  TextContent,
  ImageContent,
  VideoContent,
  AudioContent,
  DocumentContent,
  StickerContent,
  LocationContent,
  ContactContent,
  TemplateContent,
  TemplateComponent,
  TemplateParameter,
  InteractiveContent,
  InteractiveAction,
  ReactionContent,
  SendMessageInput,
  UpdateConversationInput,
  ConversationFilters,
} from './message.types';

export {
  CONVERSATION_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  MESSAGE_STATUS_LABELS,
  transformConversation,
  transformMessage,
  isWindowExpired,
  getWindowMinutesRemaining,
  createTextContent,
  getMessagePreview,
} from './message.types';

// =============================================================================
// PROVIDERS
// =============================================================================

export type {
  IChannelProvider,
  ProviderConfig,
  ValidationResult,
  ValidationError,
  ConnectionStatusResult,
  QrCodeResult,
  SendMessageParams,
  SendTemplateParams,
  TemplateComponentParam,
  SendMessageResult,
  ProviderError,
  MediaUploadResult,
  MediaDownloadResult,
  WebhookEventType,
  WebhookHandlerResult,
  WebhookEventData,
  MessageReceivedEvent,
  MessageSentEvent,
  StatusUpdateEvent,
  ConnectionUpdateEvent,
  ErrorEvent,
  TemplateSyncResult,
  ProviderTemplate,
  ProviderTemplateComponent,
  ProviderConstructor,
  ProviderRegistryEntry,
  ProviderConfigField,
  ProviderFeature,
} from './provider.types';

// =============================================================================
// TEMPLATES
// =============================================================================

export type {
  TemplateCategory,
  TemplateStatus,
  DbMessagingTemplate,
  MessagingTemplate,
  TemplateComponent as MessagingTemplateComponent,
  TemplateExample,
  TemplateButton,
  CreateTemplateInput,
  SendTemplateInput,
  TemplateParameterValues,
  TemplateParameterValue,
} from './template.types';

export {
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_STATUS_LABELS,
  TEMPLATE_STATUS_COLORS,
  transformTemplate,
  countTemplateVariables,
  replaceTemplateVariables,
  getTemplatePreview,
  templateRequiresParameters,
} from './template.types';

// =============================================================================
// WEBHOOKS
// =============================================================================

export type {
  DbMessagingWebhookEvent,
  MessagingWebhookEvent,
  WebhookProcessingStatus,
  WebhookProcessingResult,
} from './webhook.types';

export { transformWebhookEvent } from './webhook.types';

// =============================================================================
// ROUTING RULES
// =============================================================================

export type {
  DbLeadRoutingRule,
  LeadRoutingRule,
  LeadRoutingRuleView,
  CreateLeadRoutingRuleInput,
  UpdateLeadRoutingRuleInput,
  LeadRoutingRuleFilters,
} from './routing.types';

export {
  transformLeadRoutingRule,
  transformLeadRoutingRuleToDb,
} from './routing.types';

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * Pagination state for infinite/paginated queries.
 */
export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

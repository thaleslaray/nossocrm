/**
 * Chatwoot to WhatsApp Type Adapters
 *
 * These functions convert Chatwoot API types to the WhatsApp types
 * expected by the existing messaging components, allowing a gradual
 * migration without rewriting all UI components.
 */

import type {
    ChatwootConversation,
    ChatwootMessage,
    ConversationStatus,
} from '@/lib/chatwoot';
import type {
    WhatsAppConversationView,
    WhatsAppMessage,
    WhatsAppConversationStatus,
    MessageDirection,
    WhatsAppMediaType,
    WhatsAppMessageStatus,
    MessagingSource,
} from '@/types/types';

/**
 * Maps Chatwoot conversation status to WhatsApp status
 */
function mapConversationStatus(status: ConversationStatus): WhatsAppConversationStatus {
    const statusMap: Record<ConversationStatus, WhatsAppConversationStatus> = {
        open: 'open',
        resolved: 'resolved',
        pending: 'pending',
        snoozed: 'pending', // Map snoozed to pending
    };
    return statusMap[status] || 'open';
}

/**
 * Maps Chatwoot message type to message direction
 *
 * Chatwoot API may return message_type as:
 * - String: 'incoming', 'outgoing', 'activity', 'template'
 * - Number: 0 (incoming), 1 (outgoing), 2 (activity), 3 (template)
 */
function mapMessageDirection(messageType: string | number): MessageDirection {
    // Handle number values (Chatwoot API sometimes returns these)
    if (typeof messageType === 'number') {
        return messageType === 0 ? 'inbound' : 'outbound';
    }
    // Handle string values
    return messageType === 'incoming' ? 'inbound' : 'outbound';
}

/**
 * Maps Chatwoot attachment file_type to WhatsApp media type
 */
function mapMediaType(fileType?: string, contentType?: string): WhatsAppMediaType {
    if (!fileType && !contentType) return 'text';

    const type = fileType || contentType || '';

    if (type.includes('image')) return 'image';
    if (type.includes('audio')) return 'audio';
    if (type.includes('video')) return 'video';
    if (type.includes('document') || type.includes('file')) return 'document';
    if (type.includes('location')) return 'location';
    if (type.includes('contact')) return 'contact';

    return 'text';
}

/**
 * Maps Chatwoot message status to WhatsApp message status
 */
function mapMessageStatus(status?: string): WhatsAppMessageStatus {
    const statusMap: Record<string, WhatsAppMessageStatus> = {
        sent: 'sent',
        delivered: 'delivered',
        read: 'read',
        failed: 'failed',
    };
    return statusMap[status || ''] || 'sent';
}

function getStringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Converts Chatwoot timestamp to ISO string
 * Handles both Unix timestamp (seconds) and ISO string formats
 */
function parseTimestamp(value: string | number | undefined | null): string | null {
    if (!value) return null;

    // If it's a number, treat as Unix timestamp (seconds)
    if (typeof value === 'number') {
        return new Date(value * 1000).toISOString();
    }

    // If it's a string that looks like a Unix timestamp (all digits)
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        return new Date(parseInt(value, 10) * 1000).toISOString();
    }

    // Otherwise treat as ISO string or parseable date string
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
}

function inferMessagingSource(conversation: ChatwootConversation): MessagingSource {
    const additional = conversation.additional_attributes || {};
    const custom = conversation.custom_attributes || {};

    const channelHints = [
        getStringValue(conversation.meta?.channel),
        getStringValue((additional as Record<string, unknown>).channel_type),
        getStringValue((additional as Record<string, unknown>).channel),
        getStringValue((custom as Record<string, unknown>).channel_type),
        getStringValue((custom as Record<string, unknown>).channel),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (channelHints.includes('instagram')) {
        return 'INSTAGRAM';
    }

    if (channelHints.includes('whatsapp') || channelHints.includes('wpp')) {
        return 'WHATSAPP';
    }

    const contact = conversation.meta?.sender || conversation.contact;
    if (contact?.identifier && !contact?.phone_number) {
        return 'INSTAGRAM';
    }

    return 'WHATSAPP';
}

/**
 * Converts a Chatwoot conversation to WhatsAppConversationView format
 */
export function adaptChatwootConversation(
    conversation: ChatwootConversation
): WhatsAppConversationView {
    const contact = conversation.meta?.sender || conversation.contact;
    const lastMessage = conversation.messages?.[0];
    const messagingSource = inferMessagingSource(conversation);
    const remoteId = messagingSource === 'INSTAGRAM'
        ? (contact?.identifier || contact?.phone_number || '')
        : (contact?.phone_number || contact?.identifier || '');

    return {
        // Base fields
        id: conversation.id.toString(),
        organization_id: '', // Not available from Chatwoot, will be filled by caller
        session_id: conversation.inbox_id.toString(),
        contact_id: contact?.id?.toString() || null,
        deal_id: null, // Will be filled from conversation_links if available
        remote_jid: remoteId,
        is_group: false, // Chatwoot doesn't expose this directly in conversations
        group_name: null,
        status: mapConversationStatus(conversation.status),
        assigned_to: conversation.assignee?.id?.toString() || null,
        ai_enabled: !conversation.labels?.includes('atendimento-humano'),
        unread_count: conversation.unread_count,
        total_messages: conversation.messages?.length || 0,
        last_message_at: parseTimestamp(conversation.last_activity_at),
        last_message_preview: lastMessage?.content?.substring(0, 100) || null,
        last_message_direction: lastMessage
            ? mapMessageDirection(lastMessage.message_type)
            : null,
        created_at: new Date(conversation.created_at * 1000).toISOString(),
        updated_at: parseTimestamp(conversation.last_activity_at) || new Date().toISOString(),

        // View extension fields
        contact_name: contact?.name || null,
        contact_phone: contact?.phone_number || null,
        contact_email: contact?.email || null,
        contact_avatar: contact?.thumbnail || null,
        deal_title: null, // Will be filled from conversation_links
        deal_value: null,
        deal_stage: null,
        session_name: `Inbox ${conversation.inbox_id}`, // Could be enhanced with inbox lookup
        session_phone: null,
        messaging_source: messagingSource,
    };
}

/**
 * Converts a Chatwoot message to WhatsAppMessage format
 */
export function adaptChatwootMessage(message: ChatwootMessage): WhatsAppMessage {
    const attachment = message.attachments?.[0];
    // Handle both string 'outgoing' and number 1 for outgoing messages
    const messageType = message.message_type;
    const isFromMe = messageType === 'outgoing' || messageType === 1;
    const sender = message.sender;

    // Determine media type
    let mediaType: WhatsAppMediaType = 'text';
    if (attachment) {
        mediaType = mapMediaType(attachment.file_type);
    }

    return {
        id: message.id.toString(),
        conversation_id: message.conversation_id.toString(),
        wpp_message_id: null, // Not available from Chatwoot
        direction: mapMessageDirection(message.message_type),
        media_type: mediaType,
        content: message.content || null,
        caption: null, // Not directly available
        media_url: attachment?.data_url || null,
        media_mime_type: attachment?.extension ? `application/${attachment.extension}` : null,
        media_filename: null, // Not directly available
        media_size_bytes: attachment?.file_size || null,
        location_lat: null, // Could parse from content_attributes if needed
        location_lng: null,
        location_name: null,
        status: mapMessageStatus(message.status),
        status_updated_at: null,
        error_message: null,
        sender_jid: sender && 'phone_number' in sender ? sender.phone_number || null : null,
        sender_name: sender?.name || null,
        sender_phone: sender && 'phone_number' in sender ? sender.phone_number || null : null,
        quoted_message_id: null, // Not directly available
        is_from_me: isFromMe,
        is_forwarded: false, // Not available from Chatwoot
        is_broadcast: false, // Not available from Chatwoot
        wpp_timestamp: new Date(message.created_at * 1000).toISOString(),
        created_at: new Date(message.created_at * 1000).toISOString(),
    };
}

/**
 * Batch convert Chatwoot conversations
 */
export function adaptChatwootConversations(
    conversations: ChatwootConversation[]
): WhatsAppConversationView[] {
    return conversations.map(adaptChatwootConversation);
}

/**
 * Batch convert Chatwoot messages
 * Filters out activity messages (type 2 or 'activity') which have no user content
 */
export function adaptChatwootMessages(messages: ChatwootMessage[]): WhatsAppMessage[] {
    return messages
        .filter(m => {
            // Filter out activity messages (system messages like "assigned to", "resolved", etc.)
            const isActivity = m.message_type === 'activity' || m.message_type === 2;
            if (isActivity) return false;

            // Filter out messages with no content and no attachments
            const hasContent = m.content || (m.attachments && m.attachments.length > 0);
            return hasContent;
        })
        .map(adaptChatwootMessage);
}

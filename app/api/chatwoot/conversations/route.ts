import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createChatwootClientForOrg } from '@/lib/chatwoot';
import type { ConversationFilters } from '@/lib/chatwoot';

/**
 * GET /api/chatwoot/conversations
 *
 * List conversations from Chatwoot for the current user's organization.
 *
 * Query params:
 * - status: 'open' | 'resolved' | 'pending' | 'snoozed'
 * - inbox_id: number
 * - page: number
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Auth do usuario
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // 2. Buscar org do usuario
        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single();

        if (!profile?.organization_id) {
            return NextResponse.json(
                { error: 'No organization found' },
                { status: 400 }
            );
        }

        // 3. Buscar config da org (inclui inbox_id)
        const { getChannelConfig } = await import('@/lib/chatwoot/config');
        const channelConfig = await getChannelConfig(supabase, profile.organization_id);
        if (!channelConfig) {
            throw new Error('No active Chatwoot configuration found for organization');
        }

        const chatwoot = await createChatwootClientForOrg(
            supabase,
            profile.organization_id
        );

        // 4. Parse query params
        const { searchParams } = new URL(request.url);
        const filters: ConversationFilters = {};

        const status = searchParams.get('status');
        if (status && ['open', 'resolved', 'pending', 'snoozed'].includes(status)) {
            filters.status = status as ConversationFilters['status'];
        }

        const inboxId = searchParams.get('inbox_id');
        if (inboxId) {
            filters.inbox_id = parseInt(inboxId, 10);
        } else if (channelConfig.chatwootInboxId) {
            // Auto-filter by org's configured inbox
            filters.inbox_id = channelConfig.chatwootInboxId;
        }

        const page = searchParams.get('page');
        if (page) {
            filters.page = parseInt(page, 10);
        }

        // 5. Buscar conversas
        const conversations = await chatwoot.getConversations(filters);

        return NextResponse.json({
            data: conversations,
            meta: {
                organizationId: profile.organization_id,
            },
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);

        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('No active Chatwoot configuration')) {
            return NextResponse.json(
                { error: 'Chatwoot not configured for this organization' },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to fetch conversations' },
            { status: 500 }
        );
    }
}

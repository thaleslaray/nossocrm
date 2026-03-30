import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createChatwootClientForOrg } from '@/lib/chatwoot';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/chatwoot/conversations/[id]/labels
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const conversationId = parseInt(id, 10);
        if (isNaN(conversationId)) {
            return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single();
        if (!profile?.organization_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

        const chatwoot = await createChatwootClientForOrg(supabase, profile.organization_id);
        const labels = await chatwoot.getConversationLabels(conversationId);

        return NextResponse.json({ labels });
    } catch (error) {
        console.error('Error fetching labels:', error);
        return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 });
    }
}

/**
 * POST /api/chatwoot/conversations/[id]/labels
 * Body: { labels: string[] }
 *
 * Sets the full list of labels on a conversation (replaces existing).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const conversationId = parseInt(id, 10);
        if (isNaN(conversationId)) {
            return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
        }

        const body = await request.json();
        const labels: string[] = body?.labels;
        if (!Array.isArray(labels)) {
            return NextResponse.json({ error: 'labels must be an array' }, { status: 422 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single();
        if (!profile?.organization_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

        const chatwoot = await createChatwootClientForOrg(supabase, profile.organization_id);
        const updatedLabels = await chatwoot.addLabels(conversationId, labels);

        return NextResponse.json({ labels: updatedLabels });
    } catch (error) {
        console.error('Error updating labels:', error);
        return NextResponse.json({ error: 'Failed to update labels' }, { status: 500 });
    }
}

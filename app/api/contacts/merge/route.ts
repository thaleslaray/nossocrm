import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface MergeRequestBody {
  sourceId: string;
  targetId: string;
}

/**
 * POST /api/contacts/merge
 * Executa merge atômico de dois contatos.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Fetch caller's organization
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.organization_id) {
      return NextResponse.json({ message: 'Profile not found' }, { status: 404 });
    }

    const orgId = profile.organization_id;

    const body: MergeRequestBody = await request.json();
    const { sourceId, targetId } = body;

    if (!sourceId || !targetId) {
      return NextResponse.json(
        { message: 'sourceId and targetId are required' },
        { status: 400 }
      );
    }

    // Verify both contacts belong to the caller's organization (prevents IDOR)
    const { data: ownershipCheck, error: ownershipError } = await supabase
      .from('contacts')
      .select('id')
      .in('id', [sourceId, targetId])
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (ownershipError) {
      return NextResponse.json({ message: 'Failed to verify contacts' }, { status: 500 });
    }

    if (!ownershipCheck || ownershipCheck.length !== 2) {
      return NextResponse.json(
        { message: 'One or both contacts not found in your organization' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase.rpc('merge_contacts', {
      p_source_id: sourceId,
      p_target_id: targetId,
    });

    if (error) {
      console.error('[contacts/merge] RPC error:', error);
      return NextResponse.json(
        { message: error.message || 'Merge failed' },
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      '[contacts/merge]',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

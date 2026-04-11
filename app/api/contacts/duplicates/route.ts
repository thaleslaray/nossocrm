import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/contacts/duplicates
 * Retorna grupos de contatos duplicados da organização.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ message: 'Profile not found' }, { status: 404 });
    }

    const { data, error } = await supabase.rpc('find_duplicate_contacts', {
      p_org_id: profile.organization_id,
    });

    if (error) {
      console.error('[contacts/duplicates] RPC error:', error);
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      '[contacts/duplicates]',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

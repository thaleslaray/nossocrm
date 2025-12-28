import { z } from 'zod';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const runtime = 'nodejs';

const RollbackSchema = z.object({
  supabase: z.object({
    url: z.string().url(),
    serviceRoleKey: z.string().min(1),
  }),
  actions: z.array(z.enum([
    'delete_admin',
    'delete_organization', 
    'truncate_tables',
  ])).min(1),
});

export async function POST(req: Request) {
  const t0 = Date.now();
  const log = (msg: string) => console.log('[rollback]', ((Date.now() - t0) / 1000).toFixed(1) + 's', msg);
  
  log('🔄 START');
  
  if (!isAllowedOrigin(req)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = RollbackSchema.safeParse(raw);
  
  if (!parsed.success) {
    log('ERROR: Invalid payload');
    return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const { supabase: supabaseConfig, actions } = parsed.data;
  
  const supabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false },
  });

  const results: { action: string; success: boolean; error?: string }[] = [];

  for (const action of actions) {
    log(`Executing: ${action}`);
    
    try {
      switch (action) {
        case 'delete_admin': {
          // Delete admin users from auth
          const { data: admins } = await supabase
            .from('user_settings')
            .select('user_id')
            .eq('role', 'admin');
          
          if (admins && admins.length > 0) {
            for (const admin of admins) {
              await supabase.auth.admin.deleteUser(admin.user_id);
              log(`Deleted admin user: ${admin.user_id}`);
            }
          }
          
          // Delete from user_settings
          await supabase.from('user_settings').delete().eq('role', 'admin');
          
          results.push({ action, success: true });
          break;
        }
        
        case 'delete_organization': {
          // Delete all organizations (cascade should handle related data)
          const { error } = await supabase.from('organizations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          
          if (error) throw error;
          results.push({ action, success: true });
          break;
        }
        
        case 'truncate_tables': {
          // Truncate main tables in order (respecting FK constraints)
          const tables = [
            'activities',
            'deals', 
            'contacts',
            'companies',
            'boards',
            'user_settings',
            'organizations',
          ];
          
          for (const table of tables) {
            const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (error) {
              log(`Warning: Failed to truncate ${table}: ${error.message}`);
            }
          }
          
          results.push({ action, success: true });
          break;
        }
      }
      
      log(`✅ ${action} completed`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      log(`❌ ${action} failed: ${errorMsg}`);
      results.push({ action, success: false, error: errorMsg });
    }
  }

  const allSuccess = results.every(r => r.success);
  log(`🏁 DONE - ${allSuccess ? 'All actions succeeded' : 'Some actions failed'}`);

  return Response.json({
    ok: allSuccess,
    results,
  });
}

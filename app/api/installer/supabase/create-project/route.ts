import { z } from 'zod';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { createSupabaseProject, listAllSupabaseOrganizationProjects, listSupabaseProjects } from '@/lib/installer/edgeFunctions';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const Schema = z
  .object({
    installerToken: z.string().optional(),
    accessToken: z.string().min(1),
    organizationSlug: z.string().min(1),
    name: z.string().min(2).max(64),
    dbPass: z.string().min(12),
    regionSmartGroup: z.enum(['americas', 'emea', 'apac']).optional(),
    regionCode: z.string().min(2).optional(),
  })
  .strict();

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  if (process.env.INSTALLER_ENABLED === 'false') {
    return json({ error: 'Installer disabled' }, 403);
  }

  const raw = await req.json().catch(() => null);
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const expectedToken = process.env.INSTALLER_TOKEN;
  if (expectedToken && parsed.data.installerToken !== expectedToken) {
    return json({ error: 'Invalid installer token' }, 403);
  }

  const created = await createSupabaseProject({
    accessToken: parsed.data.accessToken.trim(),
    organizationSlug: parsed.data.organizationSlug.trim(),
    name: parsed.data.name.trim(),
    dbPass: parsed.data.dbPass,
    regionSmartGroup: parsed.data.regionSmartGroup,
    regionCode: parsed.data.regionCode,
  });

  if (!created.ok) {
    // Never reuse existing projects — always fail if name conflicts.
    // But provide details of the existing project so the UI can offer actions (pause/delete/rename).
    const msg = String(created.error || '').toLowerCase();
    if ((created.status === 400 || created.status === 409) && msg.includes('already exists')) {
      // Try to find the existing project to provide details
      const existing = await listAllSupabaseOrganizationProjects({
        accessToken: parsed.data.accessToken.trim(),
        organizationSlug: parsed.data.organizationSlug.trim(),
        statuses: undefined,
        search: parsed.data.name.trim(),
      });
      
      if (existing.ok) {
        const match = existing.projects.find(
          (p) => String(p?.name || '').toLowerCase().trim() === parsed.data.name.trim().toLowerCase()
        );
        if (match) {
          return json({
            error: 'Project already exists',
            code: 'PROJECT_EXISTS',
            existingProject: {
              ref: match.ref,
              name: match.name,
              status: match.status,
              region: match.region,
            },
          }, 409);
        }
      }
    }
    
    return json({ error: created.error, status: created.status, details: created.response }, created.status || 500);
  }

  return json({
    ok: true,
    projectRef: created.projectRef,
    projectName: created.projectName,
    supabaseUrl: `https://${created.projectRef}.supabase.co`,
  });
}

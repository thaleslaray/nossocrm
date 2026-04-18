/**
 * POST /api/ai/board-config/generate-persona
 *
 * Gera persona_prompt automaticamente a partir do business_context e agent_goal.
 * Chamado pelo onboarding wizard (BoardAIConfigModal).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';
import { sanitizeIncomingMessage } from '@/lib/ai/agent/input-filter';
import { generatePersonaPrompt } from '@/lib/ai/messaging/persona-generator';
import { scrapeUrl } from '@/lib/ai/utils/web-scraper';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as { businessContext?: string; agentGoal?: string; websiteUrl?: string };
  const { businessContext, agentGoal, websiteUrl } = body;

  if (!businessContext?.trim()) {
    return NextResponse.json({ error: 'businessContext is required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Sanitize admin-supplied inputs against prompt injection
  const { text: safeContext } = sanitizeIncomingMessage(businessContext, { org_id: profile.organization_id });
  const { text: safeGoal } = sanitizeIncomingMessage(agentGoal ?? '', { org_id: profile.organization_id });

  // Scrape website content if URL provided — validated by scrapeUrl (https + IP blocklist)
  let scrapedWebContent: string | undefined;
  if (websiteUrl) {
    const scraped = await scrapeUrl(websiteUrl);
    if (scraped) {
      scrapedWebContent = [
        scraped.title ? `Título do site: ${scraped.title}` : '',
        `Conteúdo do site (${scraped.source === 'jina' ? 'renderizado com JS' : 'HTML estático'}):\n${scraped.markdown}`,
      ].filter(Boolean).join('\n\n');
    }
  }

  const aiConfig = await getOrgAIConfig(supabase, profile.organization_id);
  if (!aiConfig) {
    return NextResponse.json({ error: 'AI not configured for this organization' }, { status: 422 });
  }

  try {
    const personaPrompt = await generatePersonaPrompt({
      businessContext: safeContext,
      agentGoal: safeGoal,
      aiConfig,
      scrapedWebContent,
    });
    console.log('[BoardConfig] persona generated for org %s (%d chars)', profile.organization_id, personaPrompt.length);
    return NextResponse.json({ personaPrompt });
  } catch (err) {
    console.error('[BoardConfig] persona generation failed:', err);
    return NextResponse.json({ error: 'Failed to generate persona' }, { status: 500 });
  }
}

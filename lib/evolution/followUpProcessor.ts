/**
 * Follow-up Processor
 *
 * Processes pending follow-ups that have reached their trigger time.
 * Called by:
 * 1. Vercel Cron job (every minute)
 * 2. API route manually
 *
 * For each pending follow-up:
 * 1. Check if the customer already replied (auto-cancelled by trigger)
 * 2. Check quiet hours
 * 3. Generate a contextual follow-up message using AI + memory
 * 4. Send via Evolution API
 * 5. Re-activate AI on the conversation
 * 6. Log the action
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppFollowUp } from '@/types/whatsapp';
import {
  getPendingFollowUps,
  updateFollowUpStatus,
  getMemories,
} from '@/lib/supabase/whatsappIntelligence';
import { getAIConfig, insertAILog, updateConversation, getConversation } from '@/lib/supabase/whatsapp';
import { generateFollowUpMessage } from '@/lib/evolution/intelligence';
import * as evolution from '@/lib/evolution/client';

export interface ProcessResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

export async function processFollowUps(supabase: SupabaseClient): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  // Get all pending follow-ups that have reached their trigger time
  const pending = await getPendingFollowUps(supabase);

  for (const followUp of pending) {
    result.processed++;

    try {
      await processOneFollowUp(supabase, followUp, result);
    } catch (err) {
      console.error(`[follow-up-processor] Error processing ${followUp.id}:`, err);
      result.failed++;

      if (followUp.retry_count < followUp.max_retries) {
        // Increment retry count
        await supabase
          .from('whatsapp_follow_ups')
          .update({ retry_count: followUp.retry_count + 1, updated_at: new Date().toISOString() })
          .eq('id', followUp.id);
      } else {
        await updateFollowUpStatus(supabase, followUp.id, 'failed');
      }
    }
  }

  return result;
}

async function processOneFollowUp(
  supabase: SupabaseClient,
  followUp: WhatsAppFollowUp,
  result: ProcessResult,
): Promise<void> {
  // Get instance
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', followUp.instance_id)
    .single();

  if (!instance || instance.status !== 'connected') {
    await updateFollowUpStatus(supabase, followUp.id, 'failed');
    result.failed++;
    return;
  }

  // Get Evolution API URL from organization settings
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('evolution_api_url')
    .eq('organization_id', followUp.organization_id)
    .single();

  if (!orgSettings?.evolution_api_url) {
    await updateFollowUpStatus(supabase, followUp.id, 'failed');
    result.failed++;
    return;
  }

  // Get AI config
  const config = await getAIConfig(supabase, instance.id);
  if (!config) {
    await updateFollowUpStatus(supabase, followUp.id, 'failed');
    result.failed++;
    return;
  }

  // Check quiet hours
  if (config.follow_up_quiet_hours_start && config.follow_up_quiet_hours_end) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (currentTime >= config.follow_up_quiet_hours_start && currentTime <= config.follow_up_quiet_hours_end) {
      // In quiet hours - skip and reschedule for after quiet hours
      const [endH, endM] = config.follow_up_quiet_hours_end.split(':').map(Number);
      const reschedule = new Date();
      reschedule.setHours(endH, endM + 5, 0, 0); // 5 min after quiet hours end
      if (reschedule <= now) {
        reschedule.setDate(reschedule.getDate() + 1); // Next day
      }
      await supabase
        .from('whatsapp_follow_ups')
        .update({ trigger_at: reschedule.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', followUp.id);
      result.skipped++;
      return;
    }
  }

  // Get conversation
  const conversation = await getConversation(supabase, followUp.conversation_id);
  if (!conversation) {
    await updateFollowUpStatus(supabase, followUp.id, 'failed');
    result.failed++;
    return;
  }

  // Get memories for context
  const memories = await getMemories(supabase, followUp.conversation_id);
  const customerName = conversation.contact_name || conversation.contact?.name || '';

  // Generate or use pre-generated message
  let message = followUp.ai_generated_message;
  if (!message) {
    message = await generateFollowUpMessage(
      supabase,
      followUp.organization_id,
      followUp,
      customerName,
      memories,
      config,
    );
  }

  // Send via Evolution API
  const creds: evolution.EvolutionCredentials = {
    baseUrl: orgSettings.evolution_api_url,
    apiKey: instance.instance_token,
    instanceName: instance.evolution_instance_name || instance.instance_id,
  };

  const response = await evolution.sendText(creds, {
    number: conversation.phone,
    text: message,
  });

  // Persist message
  const { data: sentMsg } = await supabase
    .from('whatsapp_messages')
    .insert({
      conversation_id: followUp.conversation_id,
      organization_id: followUp.organization_id,
      evolution_message_id: response.key?.id || undefined,
      from_me: true,
      message_type: 'text',
      text_body: message,
      status: 'sent',
      sent_by: 'ai_agent',
      whatsapp_timestamp: new Date().toISOString(),
    })
    .select('id')
    .single();

  // Mark follow-up as sent
  await updateFollowUpStatus(supabase, followUp.id, 'sent', sentMsg?.id);

  // Re-activate AI on the conversation (so it can respond to the reply)
  await updateConversation(supabase, followUp.conversation_id, {
    ai_active: true,
  } as Parameters<typeof updateConversation>[2]);

  // Log the action
  await insertAILog(supabase, {
    conversation_id: followUp.conversation_id,
    organization_id: followUp.organization_id,
    action: 'follow_up_sent',
    details: {
      follow_up_id: followUp.id,
      detected_intent: followUp.detected_intent,
      message_preview: message.slice(0, 100),
    },
    message_id: sentMsg?.id,
    triggered_by: 'ai',
  });

  result.sent++;
}

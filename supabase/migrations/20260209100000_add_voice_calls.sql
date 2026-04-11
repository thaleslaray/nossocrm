-- Migration: Add Voice Calls
-- Description: Creates voice_calls table and adds voice columns to organization_settings.
-- Supports both AI Agent (ElevenLabs) and Human Call (LiveKit) modes.
-- Date: 2026-02-09

-- =============================================================================
-- 1. Organization Settings: voice columns
-- =============================================================================

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS elevenlabs_agent_id TEXT;

COMMENT ON COLUMN organization_settings.voice_enabled IS 'Whether voice features are enabled for this org';
COMMENT ON COLUMN organization_settings.elevenlabs_agent_id IS 'ElevenLabs Conversational AI agent ID for this org';

-- =============================================================================
-- 2. Voice Calls table
-- =============================================================================

CREATE TABLE voice_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  deal_id UUID REFERENCES deals(id),
  conversation_id UUID REFERENCES messaging_conversations(id),
  contact_id UUID REFERENCES contacts(id),

  -- Provider references (one of these will be filled)
  elevenlabs_conversation_id TEXT,
  livekit_room_name TEXT,

  -- Call metadata
  mode TEXT NOT NULL CHECK (mode IN ('ai_agent', 'human_call')),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'failed', 'no_answer')),
  initiated_by UUID REFERENCES profiles(id),
  channel TEXT NOT NULL DEFAULT 'web'
    CHECK (channel IN ('web', 'whatsapp', 'phone')),
  direction TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('inbound', 'outbound')),

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Content
  transcript JSONB,
  analysis JSONB,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_voice_calls_org ON voice_calls(organization_id);
CREATE INDEX idx_voice_calls_deal ON voice_calls(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_voice_calls_contact ON voice_calls(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_voice_calls_el ON voice_calls(elevenlabs_conversation_id)
  WHERE elevenlabs_conversation_id IS NOT NULL;
CREATE INDEX idx_voice_calls_lk ON voice_calls(livekit_room_name)
  WHERE livekit_room_name IS NOT NULL;
CREATE INDEX idx_voice_calls_status ON voice_calls(status);

-- RLS
ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_calls FORCE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view voice calls"
  ON voice_calls FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Org members can create voice calls"
  ON voice_calls FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can manage voice calls"
  ON voice_calls FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = voice_calls.organization_id
        AND role = 'admin'
    )
  );

-- Service role bypass for webhooks
CREATE POLICY "Service role full access to voice calls"
  ON voice_calls FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER set_voice_calls_updated_at
  BEFORE UPDATE ON voice_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE voice_calls IS 'Voice call records for AI agent and human call modes';
COMMENT ON COLUMN voice_calls.mode IS 'ai_agent = ElevenLabs AI, human_call = LiveKit softphone';
COMMENT ON COLUMN voice_calls.transcript IS 'Array of {role, message, timestamp} objects';
COMMENT ON COLUMN voice_calls.analysis IS 'AI-generated summary and insights from the call';

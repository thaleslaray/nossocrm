-- Migration: WhatsApp Business Calling API
-- Description: Creates whatsapp_calls table for signaling/state management
--              and adds call_permission_status JSONB to contacts.
-- Date: 2026-02-09

-- =============================================================================
-- 1. WhatsApp Calls table
-- =============================================================================

CREATE TABLE whatsapp_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  wa_call_id TEXT,
  channel_id UUID NOT NULL REFERENCES messaging_channels(id),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),

  -- Phone numbers
  caller_phone TEXT,
  callee_phone TEXT,

  -- SDP for WebRTC signaling
  sdp_offer TEXT,
  sdp_answer TEXT,

  -- Call state machine
  status TEXT NOT NULL DEFAULT 'initiating'
    CHECK (status IN (
      'initiating', 'ringing', 'connecting', 'connected',
      'completed', 'rejected', 'missed', 'failed'
    )),

  -- References
  initiated_by UUID REFERENCES profiles(id),
  contact_id UUID REFERENCES contacts(id),
  contact_name TEXT,
  voice_call_id UUID REFERENCES voice_calls(id),

  -- Timing
  received_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- BIC permission
  call_permission_granted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_whatsapp_calls_org ON whatsapp_calls(organization_id);
CREATE INDEX idx_whatsapp_calls_channel ON whatsapp_calls(channel_id);
CREATE INDEX idx_whatsapp_calls_wa_call_id ON whatsapp_calls(wa_call_id)
  WHERE wa_call_id IS NOT NULL;
CREATE INDEX idx_whatsapp_calls_active ON whatsapp_calls(organization_id, status)
  WHERE status IN ('initiating', 'ringing', 'connecting', 'connected');

-- RLS
ALTER TABLE whatsapp_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_calls FORCE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view whatsapp calls"
  ON whatsapp_calls FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Org members can create whatsapp calls"
  ON whatsapp_calls FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Org members can update whatsapp calls"
  ON whatsapp_calls FOR UPDATE TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Service role full access to whatsapp calls"
  ON whatsapp_calls FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER set_whatsapp_calls_updated_at
  BEFORE UPDATE ON whatsapp_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE whatsapp_calls IS 'WhatsApp Business Calling API call records (signaling + state)';
COMMENT ON COLUMN whatsapp_calls.wa_call_id IS 'Call ID returned by Meta Graph API';
COMMENT ON COLUMN whatsapp_calls.sdp_offer IS 'SDP offer for WebRTC connection setup';
COMMENT ON COLUMN whatsapp_calls.sdp_answer IS 'SDP answer for WebRTC connection setup';

-- =============================================================================
-- 2. Contacts: add call_permission_status JSONB
-- =============================================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS call_permission_status JSONB DEFAULT '{}';

COMMENT ON COLUMN contacts.call_permission_status IS 'BIC permission status per channel: { channelId: { status, grantedAt, expiresAt } }';

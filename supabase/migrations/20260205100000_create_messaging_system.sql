-- =============================================================================
-- MESSAGING SYSTEM - OMNICHANNEL INBOX
-- =============================================================================
--
-- Version: 1.0
-- Date: 2026-02-05
-- Purpose: Create complete messaging infrastructure for omnichannel inbox
--
-- Includes:
-- 1. Business Units (organizational segmentation)
-- 2. Messaging Channels (WhatsApp, Instagram, Email, SMS)
-- 3. Conversations & Messages
-- 4. Templates (WhatsApp HSM)
-- 5. Webhook Events (audit/idempotency)
--
-- =============================================================================

-- #############################################################################
-- PART 1: BUSINESS UNITS
-- #############################################################################
-- Business units segment the organization into logical groups (e.g., "Sales", "Support")
-- Each channel and conversation belongs to exactly one business unit

CREATE TABLE IF NOT EXISTS public.business_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                    -- slug (e.g., 'vendas', 'suporte')
  name TEXT NOT NULL,
  description TEXT,
  auto_create_deal BOOLEAN DEFAULT false,
  default_board_id UUID REFERENCES public.boards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT business_units_org_key_unique UNIQUE (organization_id, key)
);

ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_units FORCE ROW LEVEL SECURITY;

-- FK Index (Postgres does NOT create these automatically)
CREATE INDEX idx_business_units_org ON public.business_units(organization_id);
CREATE INDEX idx_business_units_board ON public.business_units(default_board_id);

-- Business Unit Members (many-to-many with profiles)
CREATE TABLE IF NOT EXISTS public.business_unit_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT business_unit_members_unique UNIQUE (business_unit_id, user_id)
);

ALTER TABLE public.business_unit_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_unit_members FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_business_unit_members_unit ON public.business_unit_members(business_unit_id);
CREATE INDEX idx_business_unit_members_user ON public.business_unit_members(user_id);

-- RLS Policies for Business Units (optimized with SELECT auth.uid())
DROP POLICY IF EXISTS "Users view their org units" ON public.business_units;
CREATE POLICY "Users view their org units"
  ON public.business_units FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins manage units" ON public.business_units;
CREATE POLICY "Admins manage units"
  ON public.business_units FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = business_units.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = business_units.organization_id
        AND role = 'admin'
    )
  );

-- RLS Policies for Business Unit Members
DROP POLICY IF EXISTS "Users view unit members in org" ON public.business_unit_members;
CREATE POLICY "Users view unit members in org"
  ON public.business_unit_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_units bu
      WHERE bu.id = business_unit_members.business_unit_id
        AND bu.organization_id = (
          SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Admins manage unit members" ON public.business_unit_members;
CREATE POLICY "Admins manage unit members"
  ON public.business_unit_members FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_units bu
      JOIN public.profiles p ON p.organization_id = bu.organization_id
      WHERE bu.id = business_unit_members.business_unit_id
        AND p.id = (SELECT auth.uid())
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_units bu
      JOIN public.profiles p ON p.organization_id = bu.organization_id
      WHERE bu.id = business_unit_members.business_unit_id
        AND p.id = (SELECT auth.uid())
        AND p.role = 'admin'
    )
  );

-- #############################################################################
-- PART 2: MESSAGING CHANNELS
-- #############################################################################
-- A channel represents a connected messaging account (e.g., a WhatsApp number)

CREATE TABLE IF NOT EXISTS public.messaging_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_unit_id UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,

  -- Type and provider
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'whatsapp', 'instagram', 'email', 'sms', 'telegram', 'voice'
  )),
  provider TEXT NOT NULL, -- 'z-api', 'meta-cloud', 'smtp', 'resend', etc.

  -- External identifier (phone number, email, Instagram handle)
  external_identifier TEXT NOT NULL,

  -- Friendly name
  name TEXT NOT NULL,

  -- Configuration (ENCRYPT IN PRODUCTION via Vault)
  credentials JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',

  -- Connection status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'connecting', 'connected', 'disconnected', 'error', 'waiting_qr'
  )),
  status_message TEXT,
  last_connected_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT messaging_channels_unique UNIQUE (organization_id, channel_type, external_identifier)
);

ALTER TABLE public.messaging_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_channels FORCE ROW LEVEL SECURITY;

-- FK Indexes
CREATE INDEX idx_messaging_channels_org ON public.messaging_channels(organization_id);
CREATE INDEX idx_messaging_channels_business_unit ON public.messaging_channels(business_unit_id);

-- Composite indexes for common queries
CREATE INDEX idx_messaging_channels_org_type_status
  ON public.messaging_channels(organization_id, channel_type, status);

-- Partial index for active channels
CREATE INDEX idx_messaging_channels_connected
  ON public.messaging_channels(organization_id, channel_type)
  WHERE status = 'connected' AND deleted_at IS NULL;

-- GIN indexes for JSONB
CREATE INDEX idx_messaging_channels_credentials_gin ON public.messaging_channels USING gin(credentials);
CREATE INDEX idx_messaging_channels_settings_gin ON public.messaging_channels USING gin(settings);

-- RLS Policies (Admin only for channels)
DROP POLICY IF EXISTS "Admins can manage channels" ON public.messaging_channels;
CREATE POLICY "Admins can manage channels"
  ON public.messaging_channels FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = messaging_channels.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = messaging_channels.organization_id
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users view channels in their org" ON public.messaging_channels;
CREATE POLICY "Users view channels in their org"
  ON public.messaging_channels FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- #############################################################################
-- PART 3: MESSAGING CONVERSATIONS
-- #############################################################################
-- A conversation is a thread of messages with a specific external contact

CREATE TABLE IF NOT EXISTS public.messaging_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.messaging_channels(id) ON DELETE CASCADE,
  business_unit_id UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,

  -- CRM Relations
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,

  -- External contact info
  external_contact_id TEXT NOT NULL,
  external_contact_name TEXT,
  external_contact_avatar TEXT,

  -- Status (MVP: open/resolved only)
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'resolved'
  )),
  priority TEXT DEFAULT 'normal' CHECK (priority IN (
    'low', 'normal', 'high', 'urgent'
  )),

  -- Assignment
  assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  -- Response window (WhatsApp/Instagram 24h rule)
  window_expires_at TIMESTAMPTZ,

  -- Counters (denormalized for performance)
  unread_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,

  -- Last message cache (avoids expensive JOINs)
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT messaging_conversations_unique UNIQUE (channel_id, external_contact_id)
);

ALTER TABLE public.messaging_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_conversations FORCE ROW LEVEL SECURITY;

-- FK Indexes
CREATE INDEX idx_messaging_conversations_channel ON public.messaging_conversations(channel_id);
CREATE INDEX idx_messaging_conversations_contact ON public.messaging_conversations(contact_id);
CREATE INDEX idx_messaging_conversations_business_unit ON public.messaging_conversations(business_unit_id);
CREATE INDEX idx_messaging_conversations_assigned ON public.messaging_conversations(assigned_user_id);

-- Composite indexes for inbox queries
CREATE INDEX idx_messaging_conversations_org_status_date
  ON public.messaging_conversations(organization_id, status, last_message_at DESC);
CREATE INDEX idx_messaging_conversations_unit_status_date
  ON public.messaging_conversations(business_unit_id, status, last_message_at DESC);

-- Partial index for open conversations (90% of queries)
CREATE INDEX idx_messaging_conversations_open
  ON public.messaging_conversations(last_message_at DESC)
  WHERE status = 'open';

-- Partial index for unread conversations
CREATE INDEX idx_messaging_conversations_unread
  ON public.messaging_conversations(organization_id, last_message_at DESC)
  WHERE status = 'open' AND unread_count > 0;

-- GIN index for metadata
CREATE INDEX idx_messaging_conversations_metadata_gin ON public.messaging_conversations USING gin(metadata);

-- RLS Policies for Conversations
DROP POLICY IF EXISTS "Users view conversations in accessible units" ON public.messaging_conversations;
CREATE POLICY "Users view conversations in accessible units"
  ON public.messaging_conversations FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
    AND (
      -- Admin sees all
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin'
      )
      OR
      -- Member sees their unit
      EXISTS (
        SELECT 1 FROM public.business_unit_members
        WHERE business_unit_id = messaging_conversations.business_unit_id
          AND user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users update conversations they can access" ON public.messaging_conversations;
CREATE POLICY "Users update conversations they can access"
  ON public.messaging_conversations FOR UPDATE TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin'
      )
      OR
      EXISTS (
        SELECT 1 FROM public.business_unit_members
        WHERE business_unit_id = messaging_conversations.business_unit_id
          AND user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "System can insert conversations" ON public.messaging_conversations;
CREATE POLICY "System can insert conversations"
  ON public.messaging_conversations FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- #############################################################################
-- PART 4: MESSAGING MESSAGES
-- #############################################################################
-- Individual messages within a conversation

CREATE TABLE IF NOT EXISTS public.messaging_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,

  -- External ID (wamid, ig_message_id, etc) for deduplication
  external_id TEXT,

  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),

  -- Content
  content_type TEXT NOT NULL CHECK (content_type IN (
    'text', 'image', 'video', 'audio', 'document', 'sticker',
    'location', 'contact', 'template', 'interactive', 'reaction'
  )),
  content JSONB NOT NULL,

  -- Reply reference
  reply_to_message_id UUID REFERENCES public.messaging_messages(id),

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'queued', 'sent', 'delivered', 'read', 'failed'
  )),

  -- Error info
  error_code TEXT,
  error_message TEXT,

  -- Status timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Sender info (for inbound)
  sender_name TEXT,
  sender_profile_url TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messaging_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_messages FORCE ROW LEVEL SECURITY;

-- FK Index
CREATE INDEX idx_messaging_messages_conversation ON public.messaging_messages(conversation_id);
CREATE INDEX idx_messaging_messages_reply ON public.messaging_messages(reply_to_message_id);

-- Composite index for message thread ordering
CREATE INDEX idx_messaging_messages_conversation_date
  ON public.messaging_messages(conversation_id, created_at DESC);

-- Unique index for idempotency (external_id when present)
CREATE UNIQUE INDEX idx_messaging_messages_external_id
  ON public.messaging_messages(external_id)
  WHERE external_id IS NOT NULL;

-- GIN indexes for JSONB
CREATE INDEX idx_messaging_messages_content_gin ON public.messaging_messages USING gin(content);
CREATE INDEX idx_messaging_messages_metadata_gin ON public.messaging_messages USING gin(metadata);

-- RLS Policies for Messages (via conversation access)
DROP POLICY IF EXISTS "Users view messages in accessible conversations" ON public.messaging_messages;
CREATE POLICY "Users view messages in accessible conversations"
  ON public.messaging_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messaging_conversations c
      WHERE c.id = messaging_messages.conversation_id
        AND c.organization_id = (
          SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users insert messages to accessible conversations" ON public.messaging_messages;
CREATE POLICY "Users insert messages to accessible conversations"
  ON public.messaging_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messaging_conversations c
      WHERE c.id = messaging_messages.conversation_id
        AND c.organization_id = (
          SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "System can update message status" ON public.messaging_messages;
CREATE POLICY "System can update message status"
  ON public.messaging_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messaging_conversations c
      WHERE c.id = messaging_messages.conversation_id
        AND c.organization_id = (
          SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
        )
    )
  );

-- #############################################################################
-- PART 5: MESSAGING TEMPLATES (WhatsApp HSM)
-- #############################################################################
-- Pre-approved message templates for WhatsApp

CREATE TABLE IF NOT EXISTS public.messaging_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.messaging_channels(id) ON DELETE CASCADE,

  external_id TEXT,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT NOT NULL CHECK (category IN ('marketing', 'utility', 'authentication')),

  components JSONB NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'paused'
  )),
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT messaging_templates_unique UNIQUE (channel_id, name, language)
);

ALTER TABLE public.messaging_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_templates FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_messaging_templates_channel ON public.messaging_templates(channel_id);

-- RLS for Templates (via channel access)
DROP POLICY IF EXISTS "Users view templates for their org channels" ON public.messaging_templates;
CREATE POLICY "Users view templates for their org channels"
  ON public.messaging_templates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messaging_channels c
      WHERE c.id = messaging_templates.channel_id
        AND c.organization_id = (
          SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Admins manage templates" ON public.messaging_templates;
CREATE POLICY "Admins manage templates"
  ON public.messaging_templates FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messaging_channels c
      JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = messaging_templates.channel_id
        AND p.id = (SELECT auth.uid())
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messaging_channels c
      JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = messaging_templates.channel_id
        AND p.id = (SELECT auth.uid())
        AND p.role = 'admin'
    )
  );

-- #############################################################################
-- PART 6: MESSAGING WEBHOOK EVENTS (Audit + Idempotency)
-- #############################################################################

CREATE TABLE IF NOT EXISTS public.messaging_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.messaging_channels(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,
  external_event_id TEXT, -- For idempotency
  payload JSONB NOT NULL,

  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT messaging_webhook_events_unique UNIQUE (channel_id, external_event_id)
);

ALTER TABLE public.messaging_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_webhook_events FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_messaging_webhook_events_channel ON public.messaging_webhook_events(channel_id);

-- Partial index for unprocessed events
CREATE INDEX idx_messaging_webhook_unprocessed
  ON public.messaging_webhook_events(created_at)
  WHERE processed = false;

-- RLS for Webhook Events (Admin view only)
DROP POLICY IF EXISTS "Admins view webhook events" ON public.messaging_webhook_events;
CREATE POLICY "Admins view webhook events"
  ON public.messaging_webhook_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messaging_channels c
      JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = messaging_webhook_events.channel_id
        AND p.id = (SELECT auth.uid())
        AND p.role = 'admin'
    )
  );

-- #############################################################################
-- PART 7: TRIGGERS
-- #############################################################################

-- Trigger: Update conversation counters when message is inserted
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.messaging_conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = CASE
      WHEN NEW.content_type = 'text' THEN LEFT(NEW.content->>'text', 100)
      WHEN NEW.content_type = 'image' THEN '[Imagem]'
      WHEN NEW.content_type = 'video' THEN '[Video]'
      WHEN NEW.content_type = 'audio' THEN '[Audio]'
      WHEN NEW.content_type = 'document' THEN '[Documento]'
      WHEN NEW.content_type = 'sticker' THEN '[Sticker]'
      WHEN NEW.content_type = 'location' THEN '[Localização]'
      WHEN NEW.content_type = 'contact' THEN '[Contato]'
      ELSE NEW.content_type
    END,
    last_message_direction = NEW.direction,
    message_count = message_count + 1,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    -- Update window on inbound messages (24h from now)
    window_expires_at = CASE
      WHEN NEW.direction = 'inbound' THEN NOW() + INTERVAL '24 hours'
      ELSE window_expires_at
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON public.messaging_messages;
CREATE TRIGGER trigger_update_conversation_on_message
AFTER INSERT ON public.messaging_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_on_message();

-- Trigger: Auto-update updated_at for business_units
DROP TRIGGER IF EXISTS update_business_units_updated_at ON public.business_units;
CREATE TRIGGER update_business_units_updated_at
BEFORE UPDATE ON public.business_units
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: Auto-update updated_at for messaging_channels
DROP TRIGGER IF EXISTS update_messaging_channels_updated_at ON public.messaging_channels;
CREATE TRIGGER update_messaging_channels_updated_at
BEFORE UPDATE ON public.messaging_channels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: Auto-update updated_at for messaging_conversations
DROP TRIGGER IF EXISTS update_messaging_conversations_updated_at ON public.messaging_conversations;
CREATE TRIGGER update_messaging_conversations_updated_at
BEFORE UPDATE ON public.messaging_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: Auto-update updated_at for messaging_templates
DROP TRIGGER IF EXISTS update_messaging_templates_updated_at ON public.messaging_templates;
CREATE TRIGGER update_messaging_templates_updated_at
BEFORE UPDATE ON public.messaging_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- #############################################################################
-- PART 8: REALTIME CONFIGURATION
-- #############################################################################

-- Enable Realtime for messaging tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messaging_conversations') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE messaging_conversations;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messaging_messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE messaging_messages;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messaging_channels') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE messaging_channels;
    END IF;
END $$;

-- #############################################################################
-- PART 9: HELPER FUNCTIONS
-- #############################################################################

-- Function: Get unread count for user's accessible conversations
CREATE OR REPLACE FUNCTION public.get_messaging_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  uid UUID;
  org_id UUID;
  is_admin BOOLEAN;
  total INTEGER;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN 0;
  END IF;

  SELECT organization_id, (role = 'admin')
  INTO org_id, is_admin
  FROM public.profiles
  WHERE id = uid;

  IF org_id IS NULL THEN
    RETURN 0;
  END IF;

  IF is_admin THEN
    -- Admin sees all unread
    SELECT COALESCE(SUM(unread_count), 0)
    INTO total
    FROM public.messaging_conversations
    WHERE organization_id = org_id
      AND status = 'open';
  ELSE
    -- Member sees only their units
    SELECT COALESCE(SUM(c.unread_count), 0)
    INTO total
    FROM public.messaging_conversations c
    WHERE c.organization_id = org_id
      AND c.status = 'open'
      AND EXISTS (
        SELECT 1 FROM public.business_unit_members bum
        WHERE bum.business_unit_id = c.business_unit_id
          AND bum.user_id = uid
      );
  END IF;

  RETURN total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_messaging_unread_count() TO authenticated;

-- Function: Mark conversation as read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.messaging_conversations
  SET unread_count = 0, updated_at = NOW()
  WHERE id = p_conversation_id
    AND organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

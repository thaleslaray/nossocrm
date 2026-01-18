-- GPTMaker / WhatsApp (MVP)

-- Fontes de webhook (token na URL) - admin-only
CREATE TABLE IF NOT EXISTS public.gptmaker_webhook_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'GPTMaker WhatsApp',
  token TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS gptmaker_webhook_sources_token_unique
  ON public.gptmaker_webhook_sources(token);

ALTER TABLE public.gptmaker_webhook_sources ENABLE ROW LEVEL SECURITY;

-- Conversas (contextId do GPTMaker) - membros podem ver
CREATE TABLE IF NOT EXISTS public.gptmaker_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  context_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  channel_id TEXT,
  contact_phone TEXT,
  contact_name TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  human_takeover_at TIMESTAMPTZ,
  human_takeover_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS gptmaker_conversations_org_context_unique
  ON public.gptmaker_conversations(organization_id, context_id);

CREATE INDEX IF NOT EXISTS gptmaker_conversations_contact_idx
  ON public.gptmaker_conversations(organization_id, contact_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS gptmaker_conversations_deal_idx
  ON public.gptmaker_conversations(organization_id, deal_id, last_message_at DESC);

ALTER TABLE public.gptmaker_conversations ENABLE ROW LEVEL SECURITY;

-- Mensagens (dedupe por messageId) - membros podem ver
CREATE TABLE IF NOT EXISTS public.gptmaker_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.gptmaker_conversations(id) ON DELETE CASCADE,
  message_id TEXT,
  role TEXT NOT NULL,
  text TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  audios JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS gptmaker_messages_dedupe
  ON public.gptmaker_messages(conversation_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gptmaker_messages_thread_idx
  ON public.gptmaker_messages(conversation_id, sent_at ASC);

ALTER TABLE public.gptmaker_messages ENABLE ROW LEVEL SECURITY;

-- Settings por estágio (mapeia agente/canal e auto-reply) - admin-only
CREATE TABLE IF NOT EXISTS public.gptmaker_whatsapp_stage_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.board_stages(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  agent_id TEXT,
  channel_id TEXT,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS gptmaker_whatsapp_stage_settings_unique
  ON public.gptmaker_whatsapp_stage_settings(organization_id, stage_id, channel);

ALTER TABLE public.gptmaker_whatsapp_stage_settings ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES
-- =====================

-- Admin manage webhook sources
DROP POLICY IF EXISTS "Admins can manage gptmaker webhook sources" ON public.gptmaker_webhook_sources;
CREATE POLICY "Admins can manage gptmaker webhook sources"
  ON public.gptmaker_webhook_sources
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = gptmaker_webhook_sources.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = gptmaker_webhook_sources.organization_id
        AND role = 'admin'
    )
  );

-- Members can view conversations
DROP POLICY IF EXISTS "Members can view gptmaker conversations" ON public.gptmaker_conversations;
CREATE POLICY "Members can view gptmaker conversations"
  ON public.gptmaker_conversations
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = gptmaker_conversations.organization_id
    )
  );

-- Members can update takeover fields (via app) - keep strict checks in API too
DROP POLICY IF EXISTS "Members can update gptmaker takeover" ON public.gptmaker_conversations;
CREATE POLICY "Members can update gptmaker takeover"
  ON public.gptmaker_conversations
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = gptmaker_conversations.organization_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = gptmaker_conversations.organization_id
    )
  );

-- Members can view messages
DROP POLICY IF EXISTS "Members can view gptmaker messages" ON public.gptmaker_messages;
CREATE POLICY "Members can view gptmaker messages"
  ON public.gptmaker_messages
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = gptmaker_messages.organization_id
    )
  );

-- Admin manage stage settings
DROP POLICY IF EXISTS "Admins can manage gptmaker stage settings" ON public.gptmaker_whatsapp_stage_settings;
CREATE POLICY "Admins can manage gptmaker stage settings"
  ON public.gptmaker_whatsapp_stage_settings
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = gptmaker_whatsapp_stage_settings.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = gptmaker_whatsapp_stage_settings.organization_id
        AND role = 'admin'
    )
  );

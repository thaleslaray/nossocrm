-- WhatsApp core (provider-agnostic) — Lite (Z-API) first

-- Accounts (one per provider connection) - admin-only
CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'WhatsApp',
  webhook_token TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_webhook_token_unique
  ON public.whatsapp_accounts(webhook_token);

CREATE INDEX IF NOT EXISTS whatsapp_accounts_org_provider_idx
  ON public.whatsapp_accounts(organization_id, provider);

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

-- Conversations (thread per contact / provider key) - members can view
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  provider_conversation_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
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

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_unique
  ON public.whatsapp_conversations(organization_id, account_id, provider_conversation_id);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_contact_idx
  ON public.whatsapp_conversations(organization_id, contact_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_deal_idx
  ON public.whatsapp_conversations(organization_id, deal_id, last_message_at DESC);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- Messages (in/out) - members can view
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  provider_message_id TEXT,
  direction TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT,
  media JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_dedupe
  ON public.whatsapp_messages(conversation_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_messages_thread_idx
  ON public.whatsapp_messages(conversation_id, sent_at ASC);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES
-- =====================

-- Admin manage accounts
DROP POLICY IF EXISTS "Admins can manage whatsapp accounts" ON public.whatsapp_accounts;
CREATE POLICY "Admins can manage whatsapp accounts"
  ON public.whatsapp_accounts
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = whatsapp_accounts.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = whatsapp_accounts.organization_id
        AND role = 'admin'
    )
  );

-- Members can view conversations
DROP POLICY IF EXISTS "Members can view whatsapp conversations" ON public.whatsapp_conversations;
CREATE POLICY "Members can view whatsapp conversations"
  ON public.whatsapp_conversations
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = whatsapp_conversations.organization_id
    )
  );

-- Members can update takeover fields (via app)
DROP POLICY IF EXISTS "Members can update whatsapp takeover" ON public.whatsapp_conversations;
CREATE POLICY "Members can update whatsapp takeover"
  ON public.whatsapp_conversations
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = whatsapp_conversations.organization_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = whatsapp_conversations.organization_id
    )
  );

-- Members can view messages
DROP POLICY IF EXISTS "Members can view whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Members can view whatsapp messages"
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE organization_id = whatsapp_messages.organization_id
    )
  );

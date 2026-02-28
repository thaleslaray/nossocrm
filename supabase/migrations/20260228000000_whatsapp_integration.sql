-- =============================================================================
-- WHATSAPP INTEGRATION (SmartZap)
-- =============================================================================
--
-- Tabelas para integração com SmartZap como provedor WhatsApp.
-- Armazena conversas e mensagens recebidas/enviadas via WhatsApp.
--
-- Created: 2026-02-28
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. WHATSAPP_CHANNELS — Configuração do canal SmartZap
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'SmartZap',
    provider TEXT NOT NULL DEFAULT 'smartzap',
    -- SmartZap connection settings
    smartzap_url TEXT,                -- Ex: https://meu-smartzap.vercel.app
    smartzap_api_key TEXT,            -- Chave de API do SmartZap
    -- Webhook inbound security
    webhook_secret TEXT,              -- Segredo compartilhado para validar webhooks inbound
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.whatsapp_channels
    USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. WHATSAPP_CONVERSATIONS — Conversas sincronizadas com SmartZap
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
    -- CRM link: associa ao contato local pelo telefone
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    -- Dados da conversa
    contact_phone TEXT NOT NULL,          -- Telefone E.164 do contato WhatsApp
    contact_name TEXT,                    -- Nome exibido (do SmartZap ou contato CRM)
    external_conversation_id TEXT,        -- ID da conversa no SmartZap (inbox_conversations.id)
    -- Estado
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'waiting')),
    unread_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,            -- Trecho da última mensagem para listagem
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_phone_unique
    ON public.whatsapp_conversations (contact_phone)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS whatsapp_conversations_contact_id
    ON public.whatsapp_conversations (contact_id);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_channel_id
    ON public.whatsapp_conversations (channel_id);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_last_message_at
    ON public.whatsapp_conversations (last_message_at DESC NULLS LAST);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.whatsapp_conversations
    USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. WHATSAPP_MESSAGES — Mensagens recebidas e enviadas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    -- ID externo da mensagem (Meta message ID, via SmartZap)
    external_message_id TEXT UNIQUE,
    -- Direção
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    -- Conteúdo
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'template', 'interactive', 'other')),
    content TEXT,                         -- Texto da mensagem
    media_url TEXT,                       -- URL de mídia (imagem, vídeo, etc.)
    media_mime_type TEXT,                 -- MIME type da mídia
    -- Status de entrega (para outbound)
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    error_message TEXT,                   -- Mensagem de erro se status=failed
    -- Timestamps de entrega
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    -- Metadados adicionais
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_id
    ON public.whatsapp_messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_messages_external_id
    ON public.whatsapp_messages (external_message_id)
    WHERE external_message_id IS NOT NULL;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.whatsapp_messages
    USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Trigger: atualiza updated_at automaticamente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER whatsapp_channels_updated_at
    BEFORE UPDATE ON public.whatsapp_channels
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER whatsapp_conversations_updated_at
    BEFORE UPDATE ON public.whatsapp_conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. Seed: canal padrão SmartZap (sem credenciais — configura via UI)
-- ---------------------------------------------------------------------------
INSERT INTO public.whatsapp_channels (name, provider, is_active)
VALUES ('SmartZap', 'smartzap', true)
ON CONFLICT DO NOTHING;

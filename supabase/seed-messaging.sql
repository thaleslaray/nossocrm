-- =============================================================================
-- MESSAGING SYSTEM - SEED DATA FOR TESTING
-- =============================================================================
--
-- This file creates test data for the messaging system.
-- Run this after the messaging migration has been applied.
--
-- IMPORTANT: This seed assumes you have at least one organization and profile
-- already created. Adjust the organization_id and user_id as needed.
--
-- Usage:
--   psql $DATABASE_URL -f supabase/seed-messaging.sql
-- Or via Supabase dashboard SQL editor
--
-- =============================================================================

DO $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_business_unit_id UUID;
  v_channel_whatsapp_id UUID;
  v_channel_instagram_id UUID;
  v_conv1_id UUID;
  v_conv2_id UUID;
  v_conv3_id UUID;
  v_contact1_id UUID;
  v_contact2_id UUID;
BEGIN
  -- Get the first organization (adjust if needed)
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found. Please create an organization first.';
  END IF;

  -- Get the first admin user in that org
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE organization_id = v_org_id AND role = 'admin'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE organization_id = v_org_id
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found in organization. Please create a user first.';
  END IF;

  RAISE NOTICE 'Using organization_id: % and user_id: %', v_org_id, v_user_id;

  -- ==========================================================================
  -- 1. CREATE BUSINESS UNIT
  -- ==========================================================================

  INSERT INTO public.business_units (organization_id, key, name, description, auto_create_deal)
  VALUES (
    v_org_id,
    'vendas',
    'Vendas',
    'Unidade de vendas principal',
    true
  )
  ON CONFLICT (organization_id, key) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_business_unit_id;

  RAISE NOTICE 'Business unit created/updated: %', v_business_unit_id;

  -- Add user as member
  INSERT INTO public.business_unit_members (business_unit_id, user_id)
  VALUES (v_business_unit_id, v_user_id)
  ON CONFLICT (business_unit_id, user_id) DO NOTHING;

  -- ==========================================================================
  -- 2. CREATE SAMPLE CHANNELS
  -- ==========================================================================

  -- WhatsApp Channel (Z-API)
  INSERT INTO public.messaging_channels (
    organization_id,
    business_unit_id,
    channel_type,
    provider,
    external_identifier,
    name,
    credentials,
    settings,
    status,
    last_connected_at
  ) VALUES (
    v_org_id,
    v_business_unit_id,
    'whatsapp',
    'z-api',
    '+5511999999999',
    'WhatsApp Comercial',
    '{"instanceId": "demo-instance-123", "token": "demo-token-xyz"}'::jsonb,
    '{"autoReplyEnabled": false}'::jsonb,
    'connected',
    NOW()
  )
  ON CONFLICT (organization_id, channel_type, external_identifier)
  DO UPDATE SET status = 'connected', last_connected_at = NOW()
  RETURNING id INTO v_channel_whatsapp_id;

  RAISE NOTICE 'WhatsApp channel created: %', v_channel_whatsapp_id;

  -- Instagram Channel
  INSERT INTO public.messaging_channels (
    organization_id,
    business_unit_id,
    channel_type,
    provider,
    external_identifier,
    name,
    credentials,
    settings,
    status
  ) VALUES (
    v_org_id,
    v_business_unit_id,
    'instagram',
    'meta',
    '@empresa_exemplo',
    'Instagram Oficial',
    '{"pageId": "123456789", "accessToken": "demo-token"}'::jsonb,
    '{}'::jsonb,
    'pending'
  )
  ON CONFLICT (organization_id, channel_type, external_identifier)
  DO UPDATE SET status = EXCLUDED.status
  RETURNING id INTO v_channel_instagram_id;

  RAISE NOTICE 'Instagram channel created: %', v_channel_instagram_id;

  -- ==========================================================================
  -- 3. CREATE SAMPLE CONTACTS (if they don't exist)
  -- ==========================================================================

  -- Try to get existing contacts or create them
  SELECT id INTO v_contact1_id
  FROM public.contacts
  WHERE organization_id = v_org_id AND phone = '+5511988887777'
  LIMIT 1;

  IF v_contact1_id IS NULL THEN
    INSERT INTO public.contacts (organization_id, name, phone, email)
    VALUES (v_org_id, 'Maria Silva', '+5511988887777', 'maria@exemplo.com')
    RETURNING id INTO v_contact1_id;
  END IF;

  SELECT id INTO v_contact2_id
  FROM public.contacts
  WHERE organization_id = v_org_id AND phone = '+5511966665555'
  LIMIT 1;

  IF v_contact2_id IS NULL THEN
    INSERT INTO public.contacts (organization_id, name, phone, email)
    VALUES (v_org_id, 'João Santos', '+5511966665555', 'joao@exemplo.com')
    RETURNING id INTO v_contact2_id;
  END IF;

  RAISE NOTICE 'Contacts: % and %', v_contact1_id, v_contact2_id;

  -- ==========================================================================
  -- 4. CREATE SAMPLE CONVERSATIONS
  -- ==========================================================================

  -- Conversation 1: Active WhatsApp conversation with Maria
  INSERT INTO public.messaging_conversations (
    organization_id,
    channel_id,
    business_unit_id,
    contact_id,
    external_contact_id,
    external_contact_name,
    status,
    priority,
    assigned_user_id,
    assigned_at,
    window_expires_at,
    unread_count,
    message_count,
    last_message_at,
    last_message_preview,
    last_message_direction
  ) VALUES (
    v_org_id,
    v_channel_whatsapp_id,
    v_business_unit_id,
    v_contact1_id,
    '+5511988887777',
    'Maria Silva',
    'open',
    'high',
    v_user_id,
    NOW(),
    NOW() + INTERVAL '24 hours',
    2,
    5,
    NOW() - INTERVAL '5 minutes',
    'Olá, gostaria de saber mais sobre o produto',
    'inbound'
  )
  ON CONFLICT (channel_id, external_contact_id)
  DO UPDATE SET
    status = 'open',
    unread_count = 2,
    last_message_at = NOW() - INTERVAL '5 minutes'
  RETURNING id INTO v_conv1_id;

  RAISE NOTICE 'Conversation 1 created: %', v_conv1_id;

  -- Conversation 2: Resolved WhatsApp conversation with João
  INSERT INTO public.messaging_conversations (
    organization_id,
    channel_id,
    business_unit_id,
    contact_id,
    external_contact_id,
    external_contact_name,
    status,
    priority,
    unread_count,
    message_count,
    last_message_at,
    last_message_preview,
    last_message_direction
  ) VALUES (
    v_org_id,
    v_channel_whatsapp_id,
    v_business_unit_id,
    v_contact2_id,
    '+5511966665555',
    'João Santos',
    'resolved',
    'normal',
    0,
    8,
    NOW() - INTERVAL '2 days',
    'Perfeito, muito obrigado!',
    'inbound'
  )
  ON CONFLICT (channel_id, external_contact_id)
  DO UPDATE SET status = 'resolved'
  RETURNING id INTO v_conv2_id;

  RAISE NOTICE 'Conversation 2 created: %', v_conv2_id;

  -- Conversation 3: New Instagram conversation (no contact linked)
  INSERT INTO public.messaging_conversations (
    organization_id,
    channel_id,
    business_unit_id,
    external_contact_id,
    external_contact_name,
    external_contact_avatar,
    status,
    priority,
    unread_count,
    message_count,
    last_message_at,
    last_message_preview,
    last_message_direction
  ) VALUES (
    v_org_id,
    v_channel_instagram_id,
    v_business_unit_id,
    'ig_user_12345',
    'ana_compras',
    'https://picsum.photos/100',
    'open',
    'normal',
    1,
    2,
    NOW() - INTERVAL '1 hour',
    'Vi o produto no stories, ainda tem?',
    'inbound'
  )
  ON CONFLICT (channel_id, external_contact_id)
  DO UPDATE SET
    status = 'open',
    unread_count = 1
  RETURNING id INTO v_conv3_id;

  RAISE NOTICE 'Conversation 3 created: %', v_conv3_id;

  -- ==========================================================================
  -- 5. CREATE SAMPLE MESSAGES
  -- ==========================================================================

  -- Messages for Conversation 1 (Maria - WhatsApp)
  INSERT INTO public.messaging_messages (conversation_id, external_id, direction, content_type, content, status, sent_at, sender_name, created_at)
  VALUES
    (v_conv1_id, 'wamid_001', 'inbound', 'text', '{"text": "Olá! Vi o anúncio de vocês no Google."}'::jsonb, 'delivered', NOW() - INTERVAL '30 minutes', 'Maria Silva', NOW() - INTERVAL '30 minutes'),
    (v_conv1_id, 'wamid_002', 'outbound', 'text', '{"text": "Oi Maria! Tudo bem? Como posso ajudar?"}'::jsonb, 'read', NOW() - INTERVAL '25 minutes', NULL, NOW() - INTERVAL '25 minutes'),
    (v_conv1_id, 'wamid_003', 'inbound', 'text', '{"text": "Quero saber sobre o plano empresarial"}'::jsonb, 'delivered', NOW() - INTERVAL '20 minutes', 'Maria Silva', NOW() - INTERVAL '20 minutes'),
    (v_conv1_id, 'wamid_004', 'outbound', 'text', '{"text": "Claro! O plano empresarial inclui acesso ilimitado a todas as funcionalidades, suporte prioritário e treinamento personalizado. O investimento é de R$ 299/mês."}'::jsonb, 'read', NOW() - INTERVAL '15 minutes', NULL, NOW() - INTERVAL '15 minutes'),
    (v_conv1_id, 'wamid_005', 'inbound', 'text', '{"text": "Olá, gostaria de saber mais sobre o produto"}'::jsonb, 'delivered', NOW() - INTERVAL '5 minutes', 'Maria Silva', NOW() - INTERVAL '5 minutes')
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;

  -- Messages for Conversation 2 (João - WhatsApp)
  INSERT INTO public.messaging_messages (conversation_id, external_id, direction, content_type, content, status, sent_at, sender_name, created_at)
  VALUES
    (v_conv2_id, 'wamid_101', 'inbound', 'text', '{"text": "Bom dia, preciso de ajuda com minha conta"}'::jsonb, 'delivered', NOW() - INTERVAL '3 days', 'João Santos', NOW() - INTERVAL '3 days'),
    (v_conv2_id, 'wamid_102', 'outbound', 'text', '{"text": "Bom dia João! Claro, o que aconteceu?"}'::jsonb, 'read', NOW() - INTERVAL '3 days' + INTERVAL '5 minutes', NULL, NOW() - INTERVAL '3 days' + INTERVAL '5 minutes'),
    (v_conv2_id, 'wamid_103', 'inbound', 'text', '{"text": "Não estou conseguindo acessar o sistema"}'::jsonb, 'delivered', NOW() - INTERVAL '3 days' + INTERVAL '10 minutes', 'João Santos', NOW() - INTERVAL '3 days' + INTERVAL '10 minutes'),
    (v_conv2_id, 'wamid_104', 'outbound', 'text', '{"text": "Entendi. Acabei de resetar sua senha. Você receberá um email com as instruções."}'::jsonb, 'read', NOW() - INTERVAL '3 days' + INTERVAL '15 minutes', NULL, NOW() - INTERVAL '3 days' + INTERVAL '15 minutes'),
    (v_conv2_id, 'wamid_105', 'inbound', 'text', '{"text": "Perfeito, muito obrigado!"}'::jsonb, 'delivered', NOW() - INTERVAL '2 days', 'João Santos', NOW() - INTERVAL '2 days')
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;

  -- Messages for Conversation 3 (Ana - Instagram)
  INSERT INTO public.messaging_messages (conversation_id, external_id, direction, content_type, content, status, sent_at, sender_name, created_at)
  VALUES
    (v_conv3_id, 'ig_msg_001', 'inbound', 'text', '{"text": "Oii! Amei o produto que vi no stories! 😍"}'::jsonb, 'delivered', NOW() - INTERVAL '2 hours', 'ana_compras', NOW() - INTERVAL '2 hours'),
    (v_conv3_id, 'ig_msg_002', 'inbound', 'text', '{"text": "Vi o produto no stories, ainda tem?"}'::jsonb, 'delivered', NOW() - INTERVAL '1 hour', 'ana_compras', NOW() - INTERVAL '1 hour')
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;

  -- ==========================================================================
  -- 6. CREATE SAMPLE TEMPLATES (WhatsApp)
  -- ==========================================================================

  INSERT INTO public.messaging_templates (channel_id, external_id, name, language, category, components, status)
  VALUES
    (
      v_channel_whatsapp_id,
      'tpl_welcome',
      'boas_vindas',
      'pt_BR',
      'utility',
      '[
        {"type": "HEADER", "format": "TEXT", "text": "Bem-vindo(a) à NossoCRM!"},
        {"type": "BODY", "text": "Olá {{1}}, obrigado por entrar em contato! 🎉\n\nEstamos aqui para ajudar você. Como podemos auxiliar hoje?"},
        {"type": "FOOTER", "text": "Responda a qualquer momento"}
      ]'::jsonb,
      'approved'
    ),
    (
      v_channel_whatsapp_id,
      'tpl_follow_up',
      'follow_up_proposta',
      'pt_BR',
      'marketing',
      '[
        {"type": "BODY", "text": "Oi {{1}}, tudo bem?\n\nVi que você demonstrou interesse na nossa proposta. Posso esclarecer alguma dúvida?"},
        {"type": "BUTTONS", "buttons": [
          {"type": "QUICK_REPLY", "text": "Tenho dúvidas"},
          {"type": "QUICK_REPLY", "text": "Quero fechar"}
        ]}
      ]'::jsonb,
      'approved'
    ),
    (
      v_channel_whatsapp_id,
      'tpl_payment',
      'confirmacao_pagamento',
      'pt_BR',
      'utility',
      '[
        {"type": "BODY", "text": "✅ Pagamento confirmado!\n\nOlá {{1}}, recebemos seu pagamento no valor de R$ {{2}}.\n\nSeu acesso será liberado em instantes. Obrigado pela confiança!"},
        {"type": "FOOTER", "text": "NossoCRM - Seu CRM favorito"}
      ]'::jsonb,
      'approved'
    ),
    (
      v_channel_whatsapp_id,
      'tpl_pending',
      'oferta_especial',
      'pt_BR',
      'marketing',
      '[
        {"type": "HEADER", "format": "TEXT", "text": "🎁 Oferta Exclusiva!"},
        {"type": "BODY", "text": "Olá {{1}}!\n\nPrepararmos uma oferta especial para você: {{2}}% de desconto na assinatura anual!\n\nVálido apenas até {{3}}. Não perca!"},
        {"type": "BUTTONS", "buttons": [
          {"type": "URL", "text": "Ver oferta", "url": "https://exemplo.com/oferta"}
        ]}
      ]'::jsonb,
      'pending'
    )
  ON CONFLICT (channel_id, name, language) DO NOTHING;

  RAISE NOTICE '✅ Seed complete! Created:';
  RAISE NOTICE '   - 1 Business Unit (Vendas)';
  RAISE NOTICE '   - 2 Channels (WhatsApp + Instagram)';
  RAISE NOTICE '   - 3 Conversations';
  RAISE NOTICE '   - 9+ Messages';
  RAISE NOTICE '   - 4 Templates';

END $$;

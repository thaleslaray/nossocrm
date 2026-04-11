-- =============================================================================
-- MEGA SEED: 100 deals, 60 contatos, 25 empresas
-- =============================================================================
SET role postgres;

DO $$
DECLARE
  v_org_id       UUID;
  v_user_id      UUID;
  -- Boards and stages
  v_boards       UUID[];
  v_board_names  TEXT[];
  v_board_stages UUID[][];
  v_board_won    UUID[];
  v_board_lost   UUID[];
  -- Temp
  v_bid          UUID;
  v_stages_arr   UUID[];
  v_stage_count  INT;
  rec            RECORD;
  i              INT;
  j              INT;
  -- Companies
  v_company_ids  UUID[];
  v_comp_id      UUID;
  -- Contacts
  v_contact_ids  UUID[];
  v_ct_id        UUID;
  -- Products
  v_prod_ids     UUID[];
  v_prod_id      UUID;
  -- Deal generation
  v_board_idx    INT;
  v_stage_idx    INT;
  v_contact_idx  INT;
  v_company_idx  INT;
  v_deal_id      UUID;
  v_deal_value   INT;
  v_deal_prob    INT;
  v_priority     TEXT;
  v_tags         TEXT[];
  v_is_won       BOOLEAN;
  v_is_lost      BOOLEAN;
  v_days_ago     INT;
  v_title        TEXT;
  -- Name arrays
  v_first_names  TEXT[] := ARRAY[
    'Ana','Bruno','Camila','Daniel','Eduarda','Fábio','Gabriela','Hugo',
    'Isabela','João','Karen','Lucas','Mariana','Nathan','Olivia','Pedro',
    'Rafaela','Samuel','Tatiana','Vinicius','Amanda','Bernardo','Carolina',
    'Diego','Elena','Fernando','Giovanna','Henrique','Juliana','Kaio',
    'Larissa','Matheus','Natália','Otávio','Patricia','Rodrigo','Sofia',
    'Thiago','Vanessa','Wagner','Adriana','Breno','Cecília','Danilo',
    'Evelyn','Felipe','Helena','Igor','Laura','Marcelo','Nicole',
    'Paulo','Renata','Sérgio','Tamires','Ulisses','Viviane','Wesley','Yasmin','Zélia'
  ];
  v_last_names   TEXT[] := ARRAY[
    'Silva','Santos','Oliveira','Souza','Pereira','Costa','Ferreira','Rodrigues',
    'Almeida','Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins',
    'Rocha','Ribeiro','Alves','Monteiro','Barros','Freitas','Barbosa','Pinto',
    'Moreira','Cardoso','Teixeira','Vieira','Nunes','Campos','Batista','Dias',
    'Ramos','Fonseca','Mendes','Castro','Duarte','Melo','Lopes','Torres'
  ];
  v_company_names TEXT[] := ARRAY[
    'TechFlow Soluções','Construtora Horizonte','Clínica Vida Plena',
    'Grupo Educacional Saber','MegaShop Digital','Advocacia Fernandes',
    'Agência Impulso','Distribuidora BemViver','Fintech PayRápido',
    'Logística Express BR','Consultoria Nexus','Farmácia Popular Saúde',
    'Restaurante Sabor & Arte','Imobiliária Teto Novo','Studio Fitness Pro',
    'Editora Conhecimento','Transportes VelozLog','Indústria Metalfort',
    'Clínica Odonto Sorriso','Escola Futuro Brilhante','Padaria Pão Dourado',
    'Pet Shop Animal Feliz','Hotel Refúgio Serra','Coworking Hub Central',
    'Energia Solar VerdeTech'
  ];
  v_industries   TEXT[] := ARRAY[
    'Tecnologia','Construção Civil','Saúde','Educação','E-commerce',
    'Jurídico','Marketing','Alimentos','Fintech','Logística',
    'Consultoria','Farmácia','Gastronomia','Imobiliário','Fitness',
    'Editorial','Transporte','Indústria','Odontologia','Educação',
    'Alimentos','Pet','Hotelaria','Coworking','Energia'
  ];
  v_roles        TEXT[] := ARRAY[
    'CEO','CTO','CFO','COO','Diretor Comercial','Diretor de Marketing',
    'Gerente de TI','Gerente Administrativo','Coordenador de Projetos',
    'Head de Operações','Sócio','Analista de Compras','Diretor Financeiro',
    'Product Manager','Growth Lead','Consultor','Designer Lead','Engenheiro',
    'Empreendedor','Freelancer'
  ];
  v_sources      TEXT[] := ARRAY[
    'Google Ads','Instagram','LinkedIn','WhatsApp','Indicação','Site','Evento','Facebook Ads','Email Marketing','Orgânico'
  ];
  v_tag_options  TEXT[] := ARRAY['Inbound','Outbound','Indicação','Enterprise','Urgente','Upsell','Renovação','Expansão'];
  v_activity_types TEXT[] := ARRAY['note','call','meeting','task','email'];
  v_act_titles   TEXT[] := ARRAY[
    'Primeiro contato realizado','Call de qualificação','Demo agendada','Proposta enviada',
    'Follow-up pós-demo','Negociação de valores','Reunião com decisor','Contrato em revisão',
    'Alinhamento de expectativas','Check-in mensal','Onboarding kickoff','Treinamento equipe',
    'Feedback de uso','Análise de resultados','Renovação discutida','Suporte técnico',
    'Escalação de problema','Upsell apresentado','Referência solicitada','NPS coletado'
  ];
BEGIN
  -- ========================================================================
  -- 0. BUSCAR ORG E USER
  -- ========================================================================
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Sem organização'; END IF;

  SELECT id INTO v_user_id FROM profiles WHERE organization_id = v_org_id AND role = 'admin' LIMIT 1;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM profiles WHERE organization_id = v_org_id LIMIT 1;
  END IF;

  RAISE NOTICE 'Org: %  User: %', v_org_id, v_user_id;

  -- ========================================================================
  -- 1. DESCOBRIR TODOS OS BOARDS + STAGES
  -- ========================================================================
  v_boards := ARRAY[]::UUID[];
  v_board_names := ARRAY[]::TEXT[];
  v_board_won := ARRAY[]::UUID[];
  v_board_lost := ARRAY[]::UUID[];

  FOR rec IN
    SELECT b.id, b.name, b.won_stage_id, b.lost_stage_id
    FROM boards b WHERE b.organization_id = v_org_id AND b.deleted_at IS NULL
    ORDER BY b.name
  LOOP
    v_boards := array_append(v_boards, rec.id);
    v_board_names := array_append(v_board_names, rec.name);
    v_board_won := array_append(v_board_won, rec.won_stage_id);
    v_board_lost := array_append(v_board_lost, rec.lost_stage_id);
  END LOOP;

  RAISE NOTICE 'Boards encontrados: %', array_length(v_boards, 1);

  -- ========================================================================
  -- 2. TAGS
  -- ========================================================================
  INSERT INTO tags (organization_id, name, color) VALUES
    (v_org_id, 'Inbound', 'bg-blue-500'),
    (v_org_id, 'Outbound', 'bg-purple-500'),
    (v_org_id, 'Indicação', 'bg-green-500'),
    (v_org_id, 'Enterprise', 'bg-amber-500'),
    (v_org_id, 'Urgente', 'bg-red-500'),
    (v_org_id, 'Upsell', 'bg-cyan-500'),
    (v_org_id, 'Renovação', 'bg-teal-500'),
    (v_org_id, 'Expansão', 'bg-indigo-500')
  ON CONFLICT (name, organization_id) DO NOTHING;

  -- ========================================================================
  -- 3. PRODUTOS
  -- ========================================================================
  v_prod_ids := ARRAY[]::UUID[];

  INSERT INTO products (organization_id, owner_id, name, description, price, sku, active) VALUES
    (v_org_id, v_user_id, 'Plano Starter',       'CRM básico até 3 usuários',    97,   'PLN-START', true),
    (v_org_id, v_user_id, 'Plano Professional',   'CRM completo com automações',  297,  'PLN-PRO',   true),
    (v_org_id, v_user_id, 'Plano Enterprise',     'CRM ilimitado + API + suporte', 697, 'PLN-ENT',   true),
    (v_org_id, v_user_id, 'Setup e Implantação',  'Config inicial + treinamento',  2500, 'SVC-SETUP', true),
    (v_org_id, v_user_id, 'Consultoria Mensal',   'Acompanhamento mensal (4h)',    1200, 'SVC-CONS',  true),
    (v_org_id, v_user_id, 'Plano Anual Starter',  'Starter com 2 meses grátis',   970,  'PLN-START-Y', true),
    (v_org_id, v_user_id, 'Plano Anual Pro',      'Pro com 2 meses grátis',       2970, 'PLN-PRO-Y',   true),
    (v_org_id, v_user_id, 'Treinamento Avançado', 'Workshop intensivo (16h)',      4500, 'SVC-TRAIN',   true)
  ON CONFLICT DO NOTHING;

  SELECT array_agg(id ORDER BY price) INTO v_prod_ids FROM products WHERE organization_id = v_org_id;

  -- ========================================================================
  -- 4. EMPRESAS (25)
  -- ========================================================================
  v_company_ids := ARRAY[]::UUID[];

  FOR i IN 1..25 LOOP
    INSERT INTO crm_companies (organization_id, owner_id, name, industry, website)
    VALUES (
      v_org_id, v_user_id,
      v_company_names[i],
      v_industries[i],
      'https://' || lower(replace(replace(v_company_names[i], ' ', ''), '&', '')) || '.com.br'
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_comp_id;

    IF v_comp_id IS NULL THEN
      SELECT id INTO v_comp_id FROM crm_companies WHERE organization_id = v_org_id AND name = v_company_names[i];
    END IF;
    v_company_ids := array_append(v_company_ids, v_comp_id);
  END LOOP;

  RAISE NOTICE 'Empresas: %', array_length(v_company_ids, 1);

  -- ========================================================================
  -- 5. CONTATOS (60)
  -- ========================================================================
  v_contact_ids := ARRAY[]::UUID[];

  FOR i IN 1..60 LOOP
    DECLARE
      v_fname TEXT := v_first_names[((i - 1) % array_length(v_first_names, 1)) + 1];
      v_lname TEXT := v_last_names[((i * 7) % array_length(v_last_names, 1)) + 1];
      v_full  TEXT := v_fname || ' ' || v_lname;
      v_email TEXT := lower(v_fname) || '.' || lower(v_lname) || i::text || '@email.com';
      v_phone TEXT := '+55' || (CASE WHEN i % 3 = 0 THEN '11' WHEN i % 3 = 1 THEN '21' ELSE '31' END) || '9' || lpad((90000000 + i * 1111)::text, 8, '0');
      v_comp_idx INT := ((i - 1) % 25) + 1;
    BEGIN
      INSERT INTO contacts (organization_id, owner_id, name, email, phone, role, company_name, client_company_id, source, status, stage)
      VALUES (
        v_org_id, v_user_id, v_full, v_email, v_phone,
        v_roles[((i - 1) % array_length(v_roles, 1)) + 1],
        CASE WHEN i <= 50 THEN v_company_names[v_comp_idx] ELSE NULL END,
        CASE WHEN i <= 50 THEN v_company_ids[v_comp_idx] ELSE NULL END,
        v_sources[((i - 1) % array_length(v_sources, 1)) + 1],
        'ACTIVE',
        CASE WHEN i <= 20 THEN 'LEAD' WHEN i <= 40 THEN 'QUALIFIED' ELSE 'CUSTOMER' END
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_ct_id;

      IF v_ct_id IS NULL THEN
        SELECT id INTO v_ct_id FROM contacts WHERE organization_id = v_org_id AND phone = v_phone;
      END IF;
      v_contact_ids := array_append(v_contact_ids, v_ct_id);
    END;
  END LOOP;

  RAISE NOTICE 'Contatos: %', array_length(v_contact_ids, 1);

  -- ========================================================================
  -- 6. CUSTOM FIELDS
  -- ========================================================================
  INSERT INTO custom_field_definitions (organization_id, key, label, type, entity_type, options) VALUES
    (v_org_id, 'origem_campanha', 'Origem da Campanha', 'select', 'deal', ARRAY['Google Ads','Meta Ads','LinkedIn Ads','Email Marketing','Evento','Orgânico']),
    (v_org_id, 'qtd_usuarios', 'Qtd. Usuários Estimada', 'number', 'deal', NULL),
    (v_org_id, 'segmento', 'Segmento', 'select', 'contact', ARRAY['Saúde','Educação','Tecnologia','Varejo','Serviços','Indústria','Outro']),
    (v_org_id, 'cnpj', 'CNPJ', 'text', 'contact', NULL)
  ON CONFLICT (key, organization_id) DO NOTHING;

  -- ========================================================================
  -- 7. DEALS (100!) — distribuídos por TODOS os boards
  -- ========================================================================
  RAISE NOTICE 'Criando 100 deals...';

  -- Distribution per board (based on typical CRM):
  -- Board 1 (Captação): 25 deals
  -- Board 2 (Vendas):   35 deals
  -- Board 3 (Onboarding): 15 deals
  -- Board 4 (CS): 15 deals
  -- Board 5 (Upsell): 10 deals

  FOR i IN 1..100 LOOP
    -- Determine board
    IF i <= 25 THEN
      v_board_idx := 1;  -- Captação
    ELSIF i <= 60 THEN
      v_board_idx := 2;  -- Vendas
    ELSIF i <= 75 THEN
      v_board_idx := 3;  -- Onboarding
    ELSIF i <= 90 THEN
      v_board_idx := 4;  -- CS
    ELSE
      v_board_idx := 5;  -- Upsell
    END IF;

    -- Clamp to available boards
    IF v_board_idx > array_length(v_boards, 1) THEN
      v_board_idx := ((v_board_idx - 1) % array_length(v_boards, 1)) + 1;
    END IF;

    v_bid := v_boards[v_board_idx];

    -- Get stages for this board
    SELECT array_agg(bs.id ORDER BY bs."order")
    INTO v_stages_arr
    FROM board_stages bs
    WHERE bs.board_id = v_bid
      AND (v_board_won[v_board_idx] IS NULL OR bs.id != v_board_won[v_board_idx])
      AND (v_board_lost[v_board_idx] IS NULL OR bs.id != v_board_lost[v_board_idx]);

    v_stage_count := coalesce(array_length(v_stages_arr, 1), 0);
    IF v_stage_count = 0 THEN
      -- Fallback: use all stages
      SELECT array_agg(bs.id ORDER BY bs."order") INTO v_stages_arr
      FROM board_stages bs WHERE bs.board_id = v_bid;
      v_stage_count := coalesce(array_length(v_stages_arr, 1), 1);
    END IF;

    -- Determine status: 80% open, 12% won, 8% lost
    v_is_won := false;
    v_is_lost := false;

    IF i % 25 IN (24, 23) AND v_board_won[v_board_idx] IS NOT NULL THEN
      -- Won deals (positions 23,24 out of every 25 = ~8%)
      v_is_won := true;
      v_stage_idx := 0; -- will use won stage
    ELSIF i % 25 = 0 AND v_board_lost[v_board_idx] IS NOT NULL THEN
      -- Lost deals (position 25 = ~4%)
      v_is_lost := true;
      v_stage_idx := 0; -- will use lost stage
    ELSE
      -- Open deals: distribute across stages
      v_stage_idx := ((i - 1) % v_stage_count) + 1;
    END IF;

    -- Contact and company
    v_contact_idx := ((i - 1) % array_length(v_contact_ids, 1)) + 1;
    v_company_idx := ((i - 1) % array_length(v_company_ids, 1)) + 1;

    -- Value based on board
    CASE v_board_idx
      WHEN 1 THEN v_deal_value := 500 + (i * 137) % 3000;   -- Captação: lower value
      WHEN 2 THEN v_deal_value := 1000 + (i * 293) % 15000;  -- Vendas: medium-high
      WHEN 3 THEN v_deal_value := 2000 + (i * 179) % 8000;   -- Onboarding: medium
      WHEN 4 THEN v_deal_value := 500 + (i * 89) % 5000;     -- CS: medium-low
      ELSE v_deal_value := 3000 + (i * 311) % 20000;          -- Upsell: highest
    END CASE;

    -- Probability
    IF v_is_won THEN v_deal_prob := 100;
    ELSIF v_is_lost THEN v_deal_prob := 0;
    ELSE v_deal_prob := 10 + (v_stage_idx * 20);
    END IF;

    -- Priority
    CASE (i % 10)
      WHEN 0, 1, 2 THEN v_priority := 'low';
      WHEN 3, 4, 5, 6 THEN v_priority := 'medium';
      ELSE v_priority := 'high';
    END CASE;

    -- Tags (1-2 random)
    v_tags := ARRAY[v_tag_options[((i - 1) % 8) + 1]];
    IF i % 3 = 0 THEN
      v_tags := array_append(v_tags, v_tag_options[((i * 3) % 8) + 1]);
    END IF;

    -- Days ago
    v_days_ago := 1 + (i * 3) % 90;

    -- Title
    v_title := split_part(
      (SELECT name FROM contacts WHERE id = v_contact_ids[v_contact_idx]),
      ' ', 1
    ) || ' ' || split_part(
      (SELECT name FROM contacts WHERE id = v_contact_ids[v_contact_idx]),
      ' ', 2
    ) || ' - ' || CASE v_board_idx
      WHEN 1 THEN CASE WHEN i % 3 = 0 THEN 'Lead Inbound' WHEN i % 3 = 1 THEN 'Lead Outbound' ELSE 'Lead Indicação' END
      WHEN 2 THEN CASE WHEN v_deal_value > 8000 THEN 'Enterprise' WHEN v_deal_value > 3000 THEN 'Professional' ELSE 'Starter' END
      WHEN 3 THEN 'Onboarding'
      WHEN 4 THEN CASE WHEN i % 2 = 0 THEN 'Health Check' ELSE 'Acompanhamento' END
      ELSE 'Expansão'
    END;

    -- Insert deal
    INSERT INTO deals (
      organization_id, owner_id, title, value, probability,
      board_id, stage_id, contact_id, client_company_id,
      tags, priority, is_won, is_lost,
      closed_at, loss_reason,
      created_at, last_stage_change_date
    ) VALUES (
      v_org_id, v_user_id, v_title, v_deal_value, v_deal_prob,
      v_bid,
      CASE
        WHEN v_is_won THEN v_board_won[v_board_idx]
        WHEN v_is_lost THEN v_board_lost[v_board_idx]
        ELSE v_stages_arr[v_stage_idx]
      END,
      v_contact_ids[v_contact_idx],
      CASE WHEN v_contact_idx <= 50 THEN v_company_ids[v_company_idx] ELSE NULL END,
      v_tags, v_priority, v_is_won, v_is_lost,
      CASE WHEN v_is_won OR v_is_lost THEN NOW() - (v_days_ago || ' days')::interval ELSE NULL END,
      CASE WHEN v_is_lost THEN 'Optou pelo concorrente' ELSE NULL END,
      NOW() - (v_days_ago || ' days')::interval,
      CASE WHEN v_stage_idx > 1 THEN NOW() - ((v_days_ago / 2) || ' days')::interval ELSE NULL END
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_deal_id;

    -- Add deal items for higher-value deals (every 3rd deal)
    IF v_deal_id IS NOT NULL AND i % 3 = 0 AND array_length(v_prod_ids, 1) > 0 THEN
      INSERT INTO deal_items (deal_id, product_id, organization_id, name, quantity, price)
      VALUES (
        v_deal_id,
        v_prod_ids[((i - 1) % array_length(v_prod_ids, 1)) + 1],
        v_org_id,
        (SELECT name FROM products WHERE id = v_prod_ids[((i - 1) % array_length(v_prod_ids, 1)) + 1]),
        CASE WHEN v_deal_value > 5000 THEN 12 ELSE 1 END,
        v_deal_value
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Add activity for every 2nd deal
    IF v_deal_id IS NOT NULL AND i % 2 = 0 THEN
      INSERT INTO activities (
        organization_id, owner_id, title, description, type, date,
        completed, deal_id, contact_id
      ) VALUES (
        v_org_id, v_user_id,
        v_act_titles[((i - 1) % array_length(v_act_titles, 1)) + 1],
        'Registro automático do seed — deal #' || i,
        v_activity_types[((i - 1) % array_length(v_activity_types, 1)) + 1],
        CASE WHEN i % 4 < 2
          THEN NOW() - ((v_days_ago / 2) || ' days')::interval  -- past (completed)
          ELSE NOW() + ((1 + i % 7) || ' days')::interval       -- future (pending)
        END,
        i % 4 < 2,  -- completed if past
        v_deal_id,
        v_contact_ids[v_contact_idx]
      )
      ON CONFLICT DO NOTHING;
    END IF;

  END LOOP;

  -- ========================================================================
  -- RESUMO
  -- ========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  MEGA SEED COMPLETO!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  % Boards usados', array_length(v_boards, 1);
  RAISE NOTICE '  25 Empresas';
  RAISE NOTICE '  60 Contatos';
  RAISE NOTICE '  100 Deals distribuídos';
  RAISE NOTICE '  ~33 Deal Items';
  RAISE NOTICE '  ~50 Atividades';
  RAISE NOTICE '  8 Tags, 8 Produtos, 4 Custom Fields';
  RAISE NOTICE '============================================';

END $$;

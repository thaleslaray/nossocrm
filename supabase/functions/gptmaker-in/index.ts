import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1"

function json(status: number, body: unknown, corsHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    },
  });
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function formatDateBR(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, year, month, day] = match
    return `${day}/${month}/${year}`
  }
  return dateStr
}

function classifyLead({
  data_ida,
  data_volta,
  urgencia_viagem,
  categoria_viagem,
}: {
  data_ida: string | null;
  data_volta: string | null;
  urgencia_viagem: string | null;
  categoria_viagem: string | null;
}) {
  const hasDates = !!data_ida || !!data_volta;
  const highUrgency =
    ["alta", "urgente", "urgencia alta", "imediato", "curto_prazo"].includes(
      (urgencia_viagem || "").toLowerCase()
    );
  const hasBudget = !!categoria_viagem;

  if (hasDates && highUrgency && hasBudget) {
    return { classificacao: "Quente", stage_label: "Interessado" };
  }

  if ((hasDates && hasBudget) || (hasDates && highUrgency) || (hasBudget && highUrgency)) {
    return { classificacao: "Morno", stage_label: "Novo Contato" };
  }

  return { classificacao: "Frio", stage_label: "Novo Contato" };
}

// Detecta se o payload é o formato nativo do GPTMaker (onFirstInteraction)
function isGptMakerEvent(body: Record<string, unknown>): boolean {
  return typeof body.agentId === "string" && typeof body.interactionId === "string";
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Organization-ID",
    "Access-Control-Max-Age": "86400"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    if (req.method !== "POST") {
      return json(405, { error: "Método não permitido" }, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json(500, { error: "Configuração do servidor incompleta" }, corsHeaders);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();

    const organizationId = req.headers.get("X-Organization-ID") ||
                           Deno.env.get("DEFAULT_ORGANIZATION_ID") ||
                           "00000000-0000-0000-0000-000000000000";

    // ── Caso 1: Webhook nativo GPTMaker (onFirstInteraction) ──────────────────
    if (isGptMakerEvent(body)) {
      const { agentId, channel, contextId, recipient, interactionId, name } = body as Record<string, unknown>;

      // Busca organization
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", organizationId)
        .maybeSingle();

      if (orgErr || !org) {
        return json(400, { error: "Organization ID inválido ou não encontrado" }, corsHeaders);
      }

      // Busca board e stage "Novo Contato"
      const { data: board } = await supabase
        .from("boards")
        .select("id, name")
        .eq("name", "Captação de Leads")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!board) {
        return json(200, { success: true, message: "Board não encontrado, lead ignorado", interactionId }, corsHeaders);
      }

      const { data: stage } = await supabase
        .from("board_stages")
        .select("id, name")
        .eq("board_id", board.id)
        .eq("name", "Novo Contato")
        .maybeSingle();

      if (!stage) {
        return json(200, { success: true, message: "Stage não encontrado, lead ignorado", interactionId }, corsHeaders);
      }

      // Verifica se já existe interação com esse contextId
      const { data: existingDeal } = await supabase
        .from("deals")
        .select("id")
        .eq("organization_id", organizationId)
        .contains("custom_fields", { context_id: contextId })
        .maybeSingle();

      if (existingDeal) {
        return json(200, { success: true, message: "Interação já registrada", deal_id: existingDeal.id }, corsHeaders);
      }

      // Cria contato mínimo (sem dados de viagem ainda)
      const contactName = toText(name) || "Novo Lead (Widget)";
      const { data: newContact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          name: contactName,
          organization_id: organizationId,
          stage: "lead",
          source: "gptmaker",
        })
        .select("id")
        .single();

      if (contactErr || !newContact) {
        return json(500, { error: "Erro ao criar contato", details: contactErr?.message }, corsHeaders);
      }

      // Cria deal com metadados da sessão
      const { data: deal, error: dealErr } = await supabase
        .from("deals")
        .insert({
          title: `${contactName} | Widget`,
          contact_id: newContact.id,
          board_id: board.id,
          stage_id: stage.id,
          status: "open",
          organization_id: organizationId,
          custom_fields: {
            source: "gptmaker",
            channel: channel || "WIDGET",
            agent_id: agentId,
            context_id: contextId,
            recipient,
            interaction_id: interactionId,
            classificacao: "Frio",
            stage_label: "Novo Contato",
          },
        })
        .select("id, title")
        .single();

      if (dealErr) {
        return json(500, { error: "Erro ao criar deal", details: dealErr.message }, corsHeaders);
      }

      return json(200, {
        success: true,
        message: "Primeiro contato registrado",
        event: "onFirstInteraction",
        deal: { id: deal.id, title: deal.title, stage: "Novo Contato" },
        contact: { id: newContact.id, name: contactName },
      }, corsHeaders);
    }

    // ── Caso 2: Payload completo de lead ─────────────────────────────────────
    // Aceita nomes do schema do banco (destino_viagem, categoria_viagem, etc.)
    // e também os nomes legados (destino, orcamento_categoria, urgencia)
    const nome = toText(body.nome);
    const contato = toText(body.contato) || toText(body.telefone) || toText(body["e-mail"]);

    // Destino
    const destino_viagem = toText(body.destino_viagem) || toText(body.destino);

    // Datas
    const data_ida_raw = toText(body.data_ida);
    const data_volta_raw = toText(body.data_volta);
    const data_ida = formatDateBR(data_ida_raw);
    const data_volta = formatDateBR(data_volta_raw);
    const data_viagem_raw = data_ida_raw || toText(body.data_viagem) || toText(body.data);

    // Viajantes
    const quantidade_adultos_str = toText(body.quantidade_adultos) || toText(body.numero_viajantes);
    const quantidade_adultos = quantidade_adultos_str ? (parseInt(quantidade_adultos_str) || 1) : 1;
    const quantidade_criancas_str = toText(body.quantidade_criancas);
    const quantidade_criancas = quantidade_criancas_str ? (parseInt(quantidade_criancas_str) || 0) : 0;
    const idade_criancas = toText(body.idade_criancas);

    // Outros campos
    const tipo_viagem = toText(body.tipo_viagem);
    const categoria_viagem = toText(body.categoria_viagem) || toText(body.orcamento_categoria);
    const urgencia_viagem = toText(body.urgencia_viagem) || toText(body.urgencia);
    const origem_lead = toText(body.origem_lead) || "outro";
    const indicado_por = toText(body.indicado_por);
    const observacoes_viagem = toText(body.observacoes_viagem);
    const pipeline = toText(body.pipeline) || "Captação de Leads";

    if (!nome) {
      return json(400, { error: "Campo obrigatório: nome" }, corsHeaders);
    }

    const auto = classifyLead({
      data_ida: data_ida_raw,
      data_volta: data_volta_raw,
      urgencia_viagem,
      categoria_viagem,
    });

    const classificacao = toText(body.classificacao) || auto.classificacao;
    const stageLabel = auto.stage_label;
    const dealTitle = destino_viagem ? `${nome} | ${destino_viagem}` : nome;

    const custom_fields = {
      nome,
      contato,
      destino_viagem,
      data_ida,
      data_volta,
      quantidade_adultos,
      quantidade_criancas,
      idade_criancas,
      tipo_viagem,
      categoria_viagem,
      urgencia_viagem,
      origem_lead,
      indicado_por,
      observacoes_viagem,
      classificacao,
      pipeline,
      stage_label: stageLabel,
      source: "gptmaker",
    };

    // 1. Buscar organization
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();

    if (orgErr || !org) {
      return json(400, { error: "Organization ID inválido ou não encontrado" }, corsHeaders);
    }

    // 2. Buscar board
    const { data: board, error: boardErr } = await supabase
      .from("boards")
      .select("id, name")
      .eq("name", pipeline)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (boardErr) {
      return json(500, { error: "Erro ao buscar board", details: boardErr.message }, corsHeaders);
    }
    if (!board) {
      return json(400, { error: `Board não encontrado: ${pipeline}` }, corsHeaders);
    }

    // 3. Buscar stage
    const { data: stage, error: stageErr } = await supabase
      .from("board_stages")
      .select("id, name")
      .eq("board_id", board.id)
      .eq("name", stageLabel)
      .maybeSingle();

    if (stageErr) {
      return json(500, { error: "Erro ao buscar stage", details: stageErr.message }, corsHeaders);
    }
    if (!stage) {
      return json(400, { error: `Stage não encontrado: ${stageLabel}` }, corsHeaders);
    }

    // 4. Buscar ou criar contato
    const emailMatch = contato?.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
    const email = emailMatch ? emailMatch[1] : null;
    const phone = email ? contato?.replace(email, "").trim() : contato;

    let contactId: string;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .or(`email.eq.${email || ""},phone.eq.${contato || ""}`)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          name: nome || "Lead sem nome",
          email: email,
          phone: phone || contato,
          organization_id: organizationId,
          stage: "lead",
          source: "gptmaker",
        })
        .select("id")
        .single();

      if (contactErr || !newContact) {
        return json(500, { error: "Erro ao criar contato", details: contactErr?.message || "Unknown" }, corsHeaders);
      }

      contactId = newContact.id;
    }

    // 5. Criar deal
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        title: dealTitle,
        contact_id: contactId,
        board_id: board.id,
        stage_id: stage.id,
        status: "open",
        organization_id: organizationId,
        custom_fields,
      })
      .select("id, title, board_id, stage_id, custom_fields")
      .single();

    if (dealErr) {
      return json(500, { error: "Erro ao criar deal", details: dealErr.message }, corsHeaders);
    }

    return json(200, {
      success: true,
      message: "Lead criado com sucesso",
      classification: auto,
      deal: {
        id: deal.id,
        title: deal.title,
        board: board.name,
        stage: stage.name,
      },
      contact: {
        id: contactId,
        name: nome,
      },
    }, corsHeaders);

  } catch (err) {
    console.error("Error:", err);
    return json(500, {
      error: "Erro interno",
      details: err instanceof Error ? err.message : String(err),
    }, corsHeaders);
  }
});

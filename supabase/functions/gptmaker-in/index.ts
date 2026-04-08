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
  urgencia,
  orcamento_categoria,
}: {
  data_ida: string | null;
  data_volta: string | null;
  urgencia: string | null;
  orcamento_categoria: string | null;
}) {
  const hasDates = !!data_ida || !!data_volta;
  const highUrgency =
    ["alta", "urgente", "urgencia alta"].includes((urgencia || "").toLowerCase());
  const hasBudget = !!orcamento_categoria;

  if (hasDates && highUrgency && hasBudget) {
    return { classificacao: "Quente", stage_label: "Interessado" };
  }

  if ((hasDates && hasBudget) || (hasDates && highUrgency) || (hasBudget && highUrgency)) {
    return { classificacao: "Morno", stage_label: "Novo Contato" };
  }

  return { classificacao: "Frio", stage_label: "Novo Contato" };
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

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // DEBUG: salva payload bruto no banco para inspecionar formato do GPTMaker
    try {
      const debugClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!
      );
      const headersObj: Record<string, string> = {};
      req.headers.forEach((v, k) => { headersObj[k] = v; });
      await debugClient.from("webhook_debug_logs").insert({
        source: "gptmaker-in",
        payload: body,
        headers: headersObj,
      });
    } catch (_) { /* ignora erros de debug */ }

    const nome = toText(body.nome);
    const contato = toText(body.contato);
    const destino = toText(body.destino);
    const data = toText(body.data);
    
    const data_ida_raw = toText(body.data_ida);
    const data_volta_raw = toText(body.data_volta);
    const data_ida = formatDateBR(data_ida_raw);
    const data_volta = formatDateBR(data_volta_raw);
    
    const numero_viajantes = toText(body.numero_viajantes);
    const tipo_viagem = toText(body.tipo_viagem);
    const orcamento_categoria = toText(body.orcamento_categoria);
    const urgencia = toText(body.urgencia);
    const pipeline = toText(body.pipeline) || "Captação de Leads";

    const organizationId = req.headers.get("X-Organization-ID") || 
                           Deno.env.get("DEFAULT_ORGANIZATION_ID") ||
                           "00000000-0000-0000-0000-000000000000";

    if (!nome || !destino) {
      return json(400, { error: "Campos obrigatórios: nome, destino" }, corsHeaders);
    }

    const auto = classifyLead({
      data_ida: data_ida_raw,
      data_volta: data_volta_raw,
      urgencia,
      orcamento_categoria,
    });

    const classificacao = toText(body.classificacao) || auto.classificacao;
    const stageLabel = auto.stage_label;

    const dealTitle = `${nome} | ${destino}`;

    const custom_fields = {
      nome,
      contato,
      destino,
      data,
      data_ida,
      data_volta,
      numero_viajantes,
      tipo_viagem,
      orcamento_categoria,
      urgencia,
      classificacao,
      pipeline,
      stage_label: stageLabel,
      source: "gptmaker",
      external_event_id: toText(body.external_event_id),
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

    // 2. Buscar board (com filtro de organization_id e deleted_at)
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

    // 3. Buscar stage (tabela: board_stages)
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

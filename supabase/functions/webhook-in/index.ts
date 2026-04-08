/**
 * Webhook de entrada de leads (100% produto).
 *
 * Endpoint público para receber leads de Hotmart/forms/n8n/Make e criar:
 * - Contato (upsert por email/telefone)
 * - Deal (no board + estágio configurados na fonte)
 *
 * Rota (Supabase Edge Functions):
 * - `POST /functions/v1/webhook-in/<source_id>`
 *
 * Autenticação:
 * - Aceita **um** destes formatos:
 *   - Header `X-Webhook-Secret: <secret>`
 *   - Header `Authorization: Bearer <secret>`
 *   O valor deve bater com o `secret` da fonte em `integration_inbound_sources`.
 *
 * Observação:
 * - Este handler usa `SUPABASE_SERVICE_ROLE_KEY` (segredo padrão do Supabase) e ignora RLS.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

type LeadPayload = {
  /**
   * ID do evento no sistema de origem (opcional).
   * Use quando sua origem for orientada a eventos (ex.: Hotmart) e você quiser idempotência contra retry.
   * Para “cadastro/atualização” (formulário), não é necessário.
   */
  external_event_id?: string;
  /** Nome do contato (legado) */
  name?: string;
  /** Email do contato */
  email?: string;
  /** Telefone do contato */
  phone?: string;
  source?: string;
  notes?: string;
  /** Nome da empresa (cliente) */
  company_name?: string;

  // ===== Campos "produto" (espelham o modal Novo Negócio) =====
  /** Nome do negócio */
  deal_title?: string;
  /** Valor estimado do negócio */
  deal_value?: number | string;
  /** Nome do contato principal (alias) */
  contact_name?: string;

  // Aliases comuns (camelCase / curtos)
  companyName?: string;
  dealTitle?: string;
  dealValue?: number | string;
  contactName?: string;
  title?: string;
  value?: number | string;
  company?: string;

  // ===== Campos de viagem (form público da agência) =====
  // Aliases em PT-BR aceitos diretamente do form de captura.
  // Nota: o schema do contato segue estritamente o PDF de spec
  // (enums fechados + data DATE + split adultos/crianças). Valores livres
  // do form são normalizados no handler e o que não couber é concatenado
  // em observacoes_viagem.
  nome?: string;                          // alias de name
  destino?: string;                       // alias de destino_viagem
  destino_viagem?: string;
  data?: string;                          // alias de data_viagem (texto livre)
  data_viagem?: string;
  viajantes?: string;                     // texto livre: "2 adultos, 1 criança (8 anos)"
  quantidade_adultos?: number | string;
  quantidade_criancas?: number | string;
  idade_criancas?: string;
  tipo_viagem?: string;                   // alias de categoria_viagem (texto livre)
  tipo_de_viagem?: string;
  categoria_viagem?: string;
  urgencia?: string;                      // alias de urgencia_viagem (texto livre)
  urgencia_viagem?: string;
  origem_lead?: string;
  indicado_por?: string;
  orcamento?: string | number;            // sem coluna própria → observações
  orcamento_viagem?: string | number;     // alias
  observacoes?: string;                   // alias de observacoes_viagem
  observacoes_viagem?: string;
};

const corsHeaders = {
  // NOTE: Para chamadas a partir do browser (UI "Enviar teste") precisamos de CORS.
  // Edge Functions do Supabase são cross-origin em relação ao app, então o navegador
  // faz um preflight (OPTIONS), especialmente com JSON/headers custom.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Secret, Authorization",
  // Ajuda no debug/observabilidade
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getSourceIdFromPath(req: Request): string | null {
  const url = new URL(req.url);
  // pathname esperado: /functions/v1/webhook-in/<source_id>
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "webhook-in");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

function normalizePhone(phone?: string) {
  if (!phone) return null;
  const cleaned = phone.trim();
  return cleaned || null;
}

function getSecretFromRequest(req: Request) {
  const xSecret = req.headers.get("X-Webhook-Secret") || "";
  if (xSecret.trim()) return xSecret.trim();

  const auth = req.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();

  return "";
}

function toNullableString(v: unknown) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function toNullableNumber(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    // aceita "1.234,56" e "1234.56"
    const normalized = trimmed.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getCompanyName(payload: LeadPayload) {
  return (
    toNullableString(payload.company_name) ||
    toNullableString(payload.companyName) ||
    toNullableString(payload.company) ||
    null
  );
}

function getContactName(payload: LeadPayload) {
  return (
    toNullableString(payload.contact_name) ||
    toNullableString(payload.contactName) ||
    toNullableString(payload.name) ||
    null
  );
}

function getDealTitle(payload: LeadPayload) {
  return (
    toNullableString(payload.deal_title) ||
    toNullableString(payload.dealTitle) ||
    toNullableString(payload.title) ||
    null
  );
}

function getDealValue(payload: LeadPayload) {
  return (
    toNullableNumber(payload.deal_value) ??
    toNullableNumber(payload.dealValue) ??
    toNullableNumber(payload.value) ??
    null
  );
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  const sourceId = getSourceIdFromPath(req);
  if (!sourceId) return json(404, { error: "source_id ausente na URL" });

  const secretHeader = getSecretFromRequest(req);
  if (!secretHeader) return json(401, { error: "Secret ausente" });

  // Prefer custom secrets (installer-managed) to avoid reserved `SUPABASE_` prefix restrictions.
  // Fallback to Supabase-provided envs when available.
  // New key format: CRM_SUPABASE_SECRET_KEY, legacy: CRM_SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = Deno.env.get("CRM_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("CRM_SUPABASE_SECRET_KEY") ??
    Deno.env.get("CRM_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "Supabase não configurado no runtime" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: source, error: sourceErr } = await supabase
    .from("integration_inbound_sources")
    .select("id, organization_id, entry_board_id, entry_stage_id, secret, active")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceErr) return json(500, { error: "Erro ao buscar fonte", details: sourceErr.message });
  if (!source || !source.active) return json(404, { error: "Fonte não encontrada/inativa" });
  if (String(source.secret) !== String(secretHeader)) return json(401, { error: "Secret inválido" });

  let payload: LeadPayload;
  try {
    payload = (await req.json()) as LeadPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const leadName = getContactName(payload);
  const leadEmail = payload.email?.trim()?.toLowerCase() || null;
  const leadPhone = normalizePhone(payload.phone || undefined);
  const externalEventId = payload.external_event_id?.trim() || null;
  const companyName = getCompanyName(payload);
  const dealTitleFromPayload = getDealTitle(payload);
  const dealValue = getDealValue(payload);

  // 1) Auditoria/dedupe (idempotente quando external_event_id existe)
  if (externalEventId) {
    const { error: insertEventErr } = await supabase
      .from("webhook_events_in")
      .insert({
        organization_id: source.organization_id,
        source_id: source.id,
        provider: payload.source || "generic",
        external_event_id: externalEventId,
        payload: payload as unknown as Record<string, unknown>,
        status: "received",
      });

    // Unique violation (dedupe) -> retorna ids já processados (idempotência)
    if (insertEventErr) {
      const msg = String(insertEventErr.message).toLowerCase();
      if (!msg.includes("duplicate")) {
        return json(500, { error: "Falha ao registrar evento", details: insertEventErr.message });
      }

      const { data: existingEvent, error: existingEventErr } = await supabase
        .from("webhook_events_in")
        .select("created_contact_id, created_deal_id, status")
        .eq("source_id", source.id)
        .eq("external_event_id", externalEventId)
        .maybeSingle();

      if (!existingEventErr && existingEvent?.created_deal_id) {
        return json(200, {
          ok: true,
          duplicate: true,
          message: "Recebido! Esse envio já tinha sido processado (não duplicamos nada).",
          organization_id: source.organization_id,
          contact_id: existingEvent.created_contact_id ?? null,
          deal_id: existingEvent.created_deal_id,
          status: existingEvent.status ?? "processed",
        });
      }
      // se ainda não tem IDs gravados, seguimos o fluxo (best-effort)
    }
  }

  // 2) Upsert de contato (por email e/ou telefone)
  let contactId: string | null = null;
  let clientCompanyId: string | null = null;
  let contactAction: "created" | "updated" | "none" = "none";
  let companyAction: "created" | "linked" | "none" = "none";

  // 2.0) Empresa (best-effort): cria/vincula em crm_companies quando companyName existir
  if (companyName) {
    try {
      const { data: existingCompany, error: companyFindErr } = await supabase
        .from("crm_companies")
        .select("id")
        .eq("organization_id", source.organization_id)
        .is("deleted_at", null)
        .eq("name", companyName)
        .limit(1)
        .maybeSingle();

      if (companyFindErr) throw companyFindErr;

      if (existingCompany?.id) {
        clientCompanyId = existingCompany.id as string;
        companyAction = "linked";
      } else {
        const { data: createdCompany, error: companyCreateErr } = await supabase
          .from("crm_companies")
          .insert({
            organization_id: source.organization_id,
            name: companyName,
          })
          .select("id")
          .single();

        if (companyCreateErr) throw companyCreateErr;
        clientCompanyId = (createdCompany as any)?.id ?? null;
        if (clientCompanyId) companyAction = "created";
      }
    } catch {
      // não bloqueia o fluxo do webhook
      clientCompanyId = null;
      companyAction = "none";
    }
  }

  if (leadEmail || leadPhone) {
    const filters: string[] = [];
    if (leadEmail) filters.push(`email.eq.${leadEmail}`);
    if (leadPhone) filters.push(`phone.eq.${leadPhone}`);

    const { data: existingContacts, error: findErr } = await supabase
      .from("contacts")
      .select("id, name, email, phone, organization_id")
      .eq("organization_id", source.organization_id)
      .or(filters.join(","))
      .limit(1);

    if (findErr) return json(500, { error: "Falha ao buscar contato", details: findErr.message });

    if (existingContacts && existingContacts.length > 0) {
      const existing = existingContacts[0];
      contactId = existing.id;

      const updates: Record<string, unknown> = {};
      if (leadName && (!existing.name || existing.name === "Sem nome")) updates.name = leadName;
      if (leadEmail && !existing.email) updates.email = leadEmail;
      if (leadPhone && !existing.phone) updates.phone = leadPhone;
      // Nota: coluna contacts.company_name foi removida na adaptação para agência
      // de viagens. Vínculo a empresas agora é via client_company_id.
      if (clientCompanyId) updates.client_company_id = clientCompanyId;
      if (payload.notes) updates.notes = payload.notes;
      if (payload.source) updates.source = payload.source;

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from("contacts")
          .update(updates)
          .eq("id", contactId);
        if (updErr) return json(500, { error: "Falha ao atualizar contato", details: updErr.message });
        contactAction = "updated";
      } else {
        contactAction = "none";
      }
    } else {
      const { data: created, error: createErr } = await supabase
        .from("contacts")
        .insert({
          organization_id: source.organization_id,
          name: leadName || leadEmail || leadPhone || "Lead",
          email: leadEmail,
          phone: leadPhone,
          source: payload.source || "webhook",
          // contacts.company_name removido — vínculo via client_company_id
          client_company_id: clientCompanyId,
          notes: payload.notes || null,
        })
        .select("id")
        .single();

      if (createErr) return json(500, { error: "Falha ao criar contato", details: createErr.message });
      contactId = created?.id ?? null;
      if (contactId) contactAction = "created";
    }
  }

  // 3) Deal (cadastro/upsert):
  // - Se já existir um deal "em aberto" do mesmo contato no mesmo board, atualiza em vez de criar outro.
  // - Se não existir (ou não tiver contato), cria.
  const dealTitle = dealTitleFromPayload || leadName || leadEmail || leadPhone || "Novo Lead";

  let dealId: string | null = null;
  let dealAction: "created" | "updated" = "created";

  if (contactId) {
    const { data: existingDeal, error: findDealErr } = await supabase
      .from("deals")
      .select("id, stage_id, is_won, is_lost")
      .eq("organization_id", source.organization_id)
      .eq("board_id", source.entry_board_id)
      .eq("contact_id", contactId)
      .eq("is_won", false)
      .eq("is_lost", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findDealErr) {
      return json(500, { error: "Falha ao buscar deal existente", details: findDealErr.message });
    }

    if (existingDeal?.id) {
      dealId = existingDeal.id as string;
      dealAction = "updated";

      const updates: Record<string, unknown> = {
        title: dealTitle,
        updated_at: new Date().toISOString(),
      };
      if (dealValue !== null) updates.value = dealValue;
      if (clientCompanyId) updates.client_company_id = clientCompanyId;

      // mantém stage atual (não “puxa” de volta pro stage de entrada)
      // apenas carimba metadados do inbound
      updates.custom_fields = {
        inbound_source_id: source.id,
        inbound_external_event_id: externalEventId,
        inbound_company_name: companyName,
      };

      const { error: updDealErr } = await supabase
        .from("deals")
        .update(updates)
        .eq("id", dealId);

      if (updDealErr) return json(500, { error: "Falha ao atualizar deal", details: updDealErr.message });
    }
  }

  if (!dealId) {
    const { data: createdDeal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: source.organization_id,
        title: dealTitle,
        value: dealValue ?? 0,
        probability: 10,
        priority: "medium",
        board_id: source.entry_board_id,
        stage_id: source.entry_stage_id,
        contact_id: contactId,
        client_company_id: clientCompanyId,
        last_stage_change_date: new Date().toISOString(),
        tags: ["Novo"],
        custom_fields: {
          inbound_source_id: source.id,
          inbound_external_event_id: externalEventId,
          inbound_company_name: companyName,
        },
      })
      .select("id")
      .single();

    if (dealErr) return json(500, { error: "Falha ao criar deal", details: dealErr.message });
    dealId = createdDeal?.id ?? null;
    dealAction = "created";
  }

  // Atualiza auditoria (best-effort)
  if (externalEventId) {
    await supabase
      .from("webhook_events_in")
      .update({
        status: "processed",
        created_contact_id: contactId,
        created_deal_id: dealId,
      })
      .eq("source_id", source.id)
      .eq("external_event_id", externalEventId);
  }

  return json(200, {
    ok: true,
    message:
      dealAction === "updated"
        ? "Recebido! Atualizamos o negócio existente com os dados mais recentes."
        : "Recebido! Criamos um novo negócio no funil configurado.",
    action: {
      contact: contactAction,
      company: companyAction,
      deal: dealAction,
    },
    organization_id: source.organization_id,
    contact_id: contactId,
    deal_id: dealId,
  });
});


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
    toNullableString(payload.nome) ||
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

// =============================================================================
// Travel field normalization — mapeia texto livre do form para o schema estrito
// =============================================================================

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const CATEGORIA_KEYWORDS: Array<[string, string[]]> = [
  ["economica", ["econom", "custo", "barat", "basic"]],
  ["intermediaria", ["intermed", "conforto", "medio", "standard"]],
  ["premium", ["premium", "luxo", "luxury", "top", "vip"]],
];

function normalizeCategoriaViagem(input: string | null | undefined): string | null {
  if (!input) return null;
  const lower = stripAccents(input.trim());
  if (!lower) return null;
  if (["economica", "intermediaria", "premium"].includes(lower)) return lower;
  for (const [value, keywords] of CATEGORIA_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return value;
  }
  return null;
}

const URGENCIA_KEYWORDS: Array<[string, string[]]> = [
  ["imediato", ["imediat", "urgent", "agora", "hoje", "ja "]],
  ["curto_prazo", ["curto", "1-3", "1 a 3", "2 mes", "3 mes", "mes"]],
  ["medio_prazo", ["medio", "3-6", "3 a 6", "4 mes", "5 mes", "6 mes"]],
  ["planejando", ["planej", "antece", "sem pressa", "futuro", "ano"]],
];

function normalizeUrgenciaViagem(input: string | null | undefined): string | null {
  if (!input) return null;
  const lower = stripAccents(input.trim());
  if (!lower) return null;
  if (["imediato", "curto_prazo", "medio_prazo", "planejando"].includes(lower)) return lower;
  for (const [value, keywords] of URGENCIA_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return value;
  }
  return null;
}

const ORIGEM_KEYWORDS: Array<[string, string[]]> = [
  ["instagram", ["instagram", "insta", "ig"]],
  ["facebook", ["facebook", "fb"]],
  ["google", ["google", "ads", "adwords"]],
  ["site", ["site", "website", "landing"]],
  ["whatsapp", ["whatsapp", "wpp", "whats"]],
  ["indicacao", ["indicacao", "referral", "indicad", "amigo"]],
  ["outro", ["outro", "other"]],
];

function normalizeOrigemLead(input: string | null | undefined): string | null {
  if (!input) return null;
  const lower = stripAccents(input.trim());
  if (!lower) return null;
  if (["instagram", "facebook", "google", "site", "whatsapp", "indicacao", "outro"].includes(lower)) return lower;
  for (const [value, keywords] of ORIGEM_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return value;
  }
  return null;
}

/** Tenta parsear data livre para ISO YYYY-MM-DD. Retorna null se não parseável. */
function parseDataViagem(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ddmm = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmm) {
    const [, d, m, y] = ddmm;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return null;
}

/** Parseia texto livre tipo "2 adultos, 1 criança (8 anos)" em campos estruturados. */
function parseViajantes(input: string | null | undefined): {
  adultos: number | null;
  criancas: number | null;
  idades: string | null;
} {
  if (!input) return { adultos: null, criancas: null, idades: null };
  const raw = stripAccents(input);
  const adultosMatch = raw.match(/(\d+)\s*(?:adulto|adults?)/);
  const criancasMatch = raw.match(/(\d+)\s*(?:crianc|kids?|children)/);
  const idadesMatch = raw.match(/((?:\d+(?:\s*(?:e|,|\s)\s*\d+)*)\s*anos?)/);
  return {
    adultos: adultosMatch ? parseInt(adultosMatch[1], 10) : null,
    criancas: criancasMatch ? parseInt(criancasMatch[1], 10) : null,
    idades: idadesMatch ? idadesMatch[1].trim() : null,
  };
}

type TravelFields = {
  destino_viagem: string | null;
  data_viagem: string | null;
  quantidade_adultos: number | null;
  quantidade_criancas: number | null;
  idade_criancas: string | null;
  categoria_viagem: string | null;
  urgencia_viagem: string | null;
  origem_lead: string | null;
  indicado_por: string | null;
  observacoes_viagem: string | null;
};

/**
 * Extrai os campos de viagem do payload, normalizando texto livre para o schema
 * estrito do PDF. Valores não-parseáveis (orçamento, data não reconhecida, etc.)
 * são concatenados em observacoes_viagem.
 */
function getTravelFields(payload: LeadPayload): TravelFields {
  const destino_viagem =
    toNullableString(payload.destino_viagem) || toNullableString(payload.destino);

  // Data
  const dataRaw = toNullableString(payload.data_viagem) || toNullableString(payload.data);
  const data_viagem = parseDataViagem(dataRaw);
  const dataNaoParseada = dataRaw && !data_viagem ? dataRaw : null;

  // Estruturados: adultos/crianças
  let quantidade_adultos: number | null = null;
  if (typeof payload.quantidade_adultos === "number" && Number.isFinite(payload.quantidade_adultos)) {
    quantidade_adultos = payload.quantidade_adultos;
  } else if (typeof payload.quantidade_adultos === "string") {
    const n = parseInt(payload.quantidade_adultos, 10);
    if (!Number.isNaN(n)) quantidade_adultos = n;
  }
  let quantidade_criancas: number | null = null;
  if (typeof payload.quantidade_criancas === "number" && Number.isFinite(payload.quantidade_criancas)) {
    quantidade_criancas = payload.quantidade_criancas;
  } else if (typeof payload.quantidade_criancas === "string") {
    const n = parseInt(payload.quantidade_criancas, 10);
    if (!Number.isNaN(n)) quantidade_criancas = n;
  }
  let idade_criancas = toNullableString(payload.idade_criancas);

  // Fallback: parsear "viajantes" livre quando não vieram estruturados
  const viajantesRaw = toNullableString(payload.viajantes);
  let viajantesNaoParseados: string | null = null;
  if (viajantesRaw) {
    const parsed = parseViajantes(viajantesRaw);
    if (quantidade_adultos === null) quantidade_adultos = parsed.adultos;
    if (quantidade_criancas === null) quantidade_criancas = parsed.criancas;
    if (!idade_criancas) idade_criancas = parsed.idades;
    if (parsed.adultos === null && parsed.criancas === null && !parsed.idades) {
      viajantesNaoParseados = viajantesRaw;
    }
  }

  // Categoria (enum)
  const tipoRaw =
    toNullableString(payload.categoria_viagem) ||
    toNullableString(payload.tipo_viagem) ||
    toNullableString(payload.tipo_de_viagem);
  const categoria_viagem = normalizeCategoriaViagem(tipoRaw);
  const tipoNaoParseado = tipoRaw && !categoria_viagem ? tipoRaw : null;

  // Urgência (enum)
  const urgenciaRaw =
    toNullableString(payload.urgencia_viagem) || toNullableString(payload.urgencia);
  const urgencia_viagem = normalizeUrgenciaViagem(urgenciaRaw);
  const urgenciaNaoParseada = urgenciaRaw && !urgencia_viagem ? urgenciaRaw : null;

  // Origem
  const origem_lead = normalizeOrigemLead(toNullableString(payload.origem_lead));
  const indicado_por = toNullableString(payload.indicado_por);

  // Orçamento: sem coluna própria — vai para observações (conforme PDF)
  const orcamentoRaw =
    typeof payload.orcamento === "number"
      ? String(payload.orcamento)
      : toNullableString(payload.orcamento as string | undefined);
  const orcamentoViagemRaw =
    typeof payload.orcamento_viagem === "number"
      ? String(payload.orcamento_viagem)
      : toNullableString(payload.orcamento_viagem as string | undefined);
  const orcamento = orcamentoRaw || orcamentoViagemRaw;

  // Observações: base + extras
  const obsBase =
    toNullableString(payload.observacoes_viagem) || toNullableString(payload.observacoes);
  const extras: string[] = [];
  if (obsBase) extras.push(obsBase);
  if (orcamento) extras.push(`Orçamento: ${orcamento}`);
  if (dataNaoParseada) extras.push(`Data (livre): ${dataNaoParseada}`);
  if (viajantesNaoParseados) extras.push(`Viajantes (livre): ${viajantesNaoParseados}`);
  if (tipoNaoParseado) extras.push(`Tipo (livre): ${tipoNaoParseado}`);
  if (urgenciaNaoParseada) extras.push(`Urgência (livre): ${urgenciaNaoParseada}`);
  const observacoes_viagem = extras.length > 0 ? extras.join(" | ") : null;

  return {
    destino_viagem,
    data_viagem,
    quantidade_adultos,
    quantidade_criancas,
    idade_criancas,
    categoria_viagem,
    urgencia_viagem,
    origem_lead,
    indicado_por,
    observacoes_viagem,
  };
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
  const travel = getTravelFields(payload);

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

      // Campos de viagem — só escreve os não-nulos (evita sobrescrever valores
      // existentes no contato com null vindo de payload parcial)
      if (travel.destino_viagem)        updates.destino_viagem = travel.destino_viagem;
      if (travel.data_viagem)           updates.data_viagem = travel.data_viagem;
      if (travel.quantidade_adultos !== null)  updates.quantidade_adultos = travel.quantidade_adultos;
      if (travel.quantidade_criancas !== null) updates.quantidade_criancas = travel.quantidade_criancas;
      if (travel.idade_criancas)        updates.idade_criancas = travel.idade_criancas;
      if (travel.categoria_viagem)      updates.categoria_viagem = travel.categoria_viagem;
      if (travel.urgencia_viagem)       updates.urgencia_viagem = travel.urgencia_viagem;
      if (travel.origem_lead)           updates.origem_lead = travel.origem_lead;
      if (travel.indicado_por)          updates.indicado_por = travel.indicado_por;
      if (travel.observacoes_viagem)    updates.observacoes_viagem = travel.observacoes_viagem;

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
          // Campos de viagem (nulos respeitam DEFAULTs: quantidade_adultos=1, quantidade_criancas=0)
          destino_viagem: travel.destino_viagem,
          data_viagem: travel.data_viagem,
          quantidade_adultos: travel.quantidade_adultos ?? undefined,
          quantidade_criancas: travel.quantidade_criancas ?? undefined,
          idade_criancas: travel.idade_criancas,
          categoria_viagem: travel.categoria_viagem,
          urgencia_viagem: travel.urgencia_viagem,
          origem_lead: travel.origem_lead,
          indicado_por: travel.indicado_por,
          observacoes_viagem: travel.observacoes_viagem,
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


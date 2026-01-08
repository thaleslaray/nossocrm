# API Checklist: WhatsApp Lite (Nativo)

**Purpose**: Checklist de unit tests para requisitos focado em integrações via webhook/API (entrada) e requisitos de segurança multi-tenant.
**Created**: 2026-01-07
**Feature**: specs/Featwhatsapp-lite-nativo/spec.md

**Nota**: Itens avaliam a QUALIDADE do que está ESCRITO (completude, clareza, consistência, mensurabilidade e cobertura). Não testam implementação.

## Requirement Completeness

- [x] CHK001 Fronteiras de escopo explicitamente definidas (inbound webhook + thread + takeover; sem outbound) [Spec: Scope & Boundaries]
- [x] CHK002 Atores/sistemas externos explicitamente listados (Z-API, Supabase, Next.js, CRM) [Spec: External Actors & Systems]
- [x] CHK003 Requisitos cobrindo autenticação/validação do webhook (token na URL, rota, JSON) [Spec: FR-001..FR-003 + Error Handling]
- [x] CHK004 Requisitos cobrindo multi-tenant (`organization_id`) em leituras/escritas [Spec: FR-010 + Observabilidade/Segurança]
- [x] CHK005 Requisitos definindo dados persistidos (conversa/mensagem/raw_payload/timestamps) [Spec: Glossário + FR-003/FR-004]
- [x] CHK006 Requisitos de idempotência/dedupe e chave (provider_message_id) [Spec: NFR-001 + Edge Cases]
- [x] CHK007 Requisitos de erro e retorno esperado (4xx/5xx) [Spec: Error Handling + OpenAPI]
- [x] CHK008 Requisitos de ordenação/fora de ordem (sent_at, leitura ordenada) [Spec: NFR-004 + Edge Cases]
- [x] CHK009 Limites de payload/mídia e comportamento (mídia fora de escopo; infra pode rejeitar oversized) [Spec: Scope & Boundaries]

## Requirement Clarity

- [x] CHK010 Termos definidos (token/webhook/conversa/mensagem/ids) [Spec: Glossário]
- [x] CHK011 Idempotência especificada com critérios objetivos (chave e comportamento) [Spec: NFR-001 + Edge Cases]
- [x] CHK012 Formato de autenticação do webhook definido sem ambiguidades (token na URL; rotação) [Spec: Observabilidade, Segurança e Compliance]
- [x] CHK013 Sucesso definido (persistência ok + response com IDs) [Spec: Success Criteria + Error Handling]
- [x] CHK014 Privacidade/PII explicitada (telefone/texto; RLS; service role runtime) [Spec: Observabilidade, Segurança e Compliance]

## Requirement Consistency

- [x] CHK015 Não conflita com princípio `/api/*` (sem redirect; 401/403) e boundary Supabase [Spec: FR-009 + Error Handling]
- [x] CHK016 Multi-tenant consistente em cenários/FRs/NFRs [Spec: FR-010 + NFRs]
- [x] CHK017 Integrações adicionais (Inbox/Atividades/IA) explicitamente fora de escopo (sem duplicidade) [Spec: Out of scope]

## Acceptance Criteria Quality

- [x] CHK018 Pelo menos 1 cenário Given/When/Then P1 verificável [Spec: Acceptance Scenarios]
- [x] CHK019 Critérios mensuráveis definidos (idempotência; ordenação) [Spec: Success Criteria]
- [x] CHK020 Formato de erro verificável (códigos; schema ErrorResponse no OpenAPI) [OpenAPI + Spec: Error Handling]

## Scenario Coverage

- [x] CHK021 Fluxo primário inbound completo (token -> upsert conversa -> upsert mensagem) [Spec: US1]
- [x] CHK022 Fluxos alternativos (conversa existente vs nova; contato existente vs não) [Spec: Edge Cases]
- [x] CHK023 Fluxos de exceção (token inválido, JSON inválido, sem org, CSRF) [Spec: Edge Cases + Error Handling]
- [x] CHK024 Recovery (reentrega do provedor; dedupe) e responsabilidades [Spec: Replay/Duplicidade]

## Edge Case Coverage

- [x] CHK025 Mensagens fora de ordem e/ou duplicadas (persistir sent_at; dedupe por id) [Spec: Edge Cases + NFR-004]
- [x] CHK026 Payload parcialmente válido (persistir best-effort; raw_payload) [Spec: Edge Cases]
- [x] CHK027 Tipos de evento desconhecidos/novos (best-effort, sem quebrar) [Spec: Edge Cases]

## Non-Functional Requirements

- [x] CHK028 Replay/vazamento de tokens (token como segredo; rotação; desativação) [Spec: Observabilidade, Segurança e Compliance]
- [x] CHK029 Rate limiting/abuso (fora de escopo app-level; mitigação via rotação/desativação) [Spec: Rate limiting]
- [x] CHK030 Observabilidade (IDs na resposta; raw_payload; logs Supabase) [Spec: Observabilidade]
- [x] CHK031 Retenção/expurgo e auditoria (sem job nesta iteração; acesso por RLS) [Spec: Retenção / LGPD]

## Dependencies & Assumptions

- [x] CHK032 Dependências externas (payload variável do provider; parsing best-effort) [Spec: Edge Cases + FRs]
- [x] CHK033 Webhook service-to-service (sem usuário logado; service role runtime) [Spec: Segurança]

## Ambiguities & Conflicts

- [x] CHK034 Ambiguidades reduzidas por definições objetivas no glossário e contrato de erro [Spec: Glossário + Error Handling + OpenAPI]
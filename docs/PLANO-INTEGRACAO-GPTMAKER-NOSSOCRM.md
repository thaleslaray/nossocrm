# Plano de Integração — GPTMaker + NossoCRM

> **Projeto:** NossoCRM - CRM Inteligente para Agência de Viagens  
> **Cliente:** Kleber Yascom  
> **Base:** documentação pública do GPTMaker

---

## 1. Objetivo

Integrar o GPTMaker ao NossoCRM para capturar conversas, identificar leads, registrar interações e criar/atualizar contatos e oportunidades no CRM.

---

## 2. Visão geral do fluxo

**Fluxo alvo:**

`Canal de entrada → GPTMaker → captura de contexto → NossoCRM → contato/oportunidade → histórico comercial`

---

## 3. Etapas do plano

### Etapa 1 — Descoberta e validação técnica

**Objetivo:** confirmar o que será integrado e como.

**Ações:**
- levantar os endpoints necessários na API do GPTMaker;
- validar autenticação por Bearer token;
- identificar quais entidades serão sincronizadas;
- definir o board/funil destino no NossoCRM;
- mapear quais canais realmente serão usados.

**Saída esperada:**
- escopo fechado da integração;
- lista de endpoints;
- mapeamento inicial de campos.

---

### Etapa 2 — Mapeamento de dados

**Objetivo:** definir como os dados do GPTMaker viram dados do CRM.

**Mapeamento base:**

| GPTMaker | NossoCRM |
|---|---|
| Contact | Contato / Lead |
| Chat | Linha do tempo |
| Interaction | Evento de atendimento |
| Channel | Origem |
| Agent | Automação / contexto |
| Workspace | Organização / tenant |

**Ações:**
- definir chaves de correspondência;
- decidir regras de deduplicação;
- definir campos obrigatórios;
- padronizar nomes, telefone, e-mail e origem.

**Saída esperada:**
- dicionário de mapeamento;
- regras de upsert;
- política de deduplicação.

---

### Etapa 3 — Autenticação e acesso

**Objetivo:** garantir comunicação segura entre os sistemas.

**Ações:**
- configurar Bearer token do GPTMaker;
- armazenar credenciais em local seguro;
- validar acesso ao `/me` e ao OpenAPI;
- definir rotação e controle de token.

**Saída esperada:**
- integração autenticada;
- política de segurança mínima definida.

---

### Etapa 4 — Sincronização de contatos

**Objetivo:** criar/atualizar contatos no NossoCRM a partir do GPTMaker.

**Ações:**
- consumir dados de contato;
- aplicar upsert;
- vincular origem/canal;
- salvar identificadores externos.

**Saída esperada:**
- contatos sincronizados;
- prevenção de duplicidade;
- rastreio de origem.

---

### Etapa 5 — Sincronização de conversas e interações

**Objetivo:** manter o histórico operacional disponível no CRM.

**Ações:**
- registrar mensagens relevantes;
- persistir eventos de atendimento;
- gravar início/fim de interação;
- associar chat ao contato correto.

**Saída esperada:**
- timeline do contato preenchida;
- histórico de atendimento centralizado.

---

### Etapa 6 — Criação e atualização de oportunidades

**Objetivo:** transformar interação em pipeline comercial.

**Ações:**
- mapear board e stages no NossoCRM;
- criar oportunidade quando houver critério;
- mover etapa conforme status do atendimento;
- marcar ganho/perda quando aplicável.

**Saída esperada:**
- oportunidades criadas automaticamente;
- funil refletindo a jornada do lead.

---

### Etapa 7 — Handoff para humano

**Objetivo:** permitir transição clara do bot para atendimento humano.

**Ações:**
- identificar gatilhos de transferência;
- registrar o handoff no CRM;
- atualizar status do atendimento;
- manter histórico antes e depois da transição.

**Saída esperada:**
- handoff rastreável;
- operação híbrida IA + humano.

---

### Etapa 8 — Observabilidade e controle

**Objetivo:** acompanhar qualidade, custo e confiabilidade.

**Ações:**
- logar requisições e respostas;
- tratar erros de autenticação e payload;
- monitorar falhas de upsert;
- acompanhar consumo de créditos;
- registrar eventos de sincronização.

**Saída esperada:**
- trilha de auditoria;
- visibilidade operacional;
- métricas de uso.

---

### Etapa 9 — Testes e homologação

**Objetivo:** validar o fluxo completo antes de produção.

**Cenários mínimos:**
- contato novo chegando do GPTMaker;
- contato duplicado;
- conversa com múltiplas interações;
- handoff humano;
- criação de deal;
- mudança de estágio;
- falha de autenticação.

**Saída esperada:**
- integração aprovada em homologação;
- checklist de regressão.

---

### Etapa 10 — Go-live e acompanhamento

**Objetivo:** colocar a integração em produção com segurança.

**Ações:**
- liberar por ambiente;
- ativar monitoramento;
- revisar logs nas primeiras execuções;
- acompanhar impacto no funil;
- ajustar campos/regras conforme uso real.

**Saída esperada:**
- integração em produção;
- processo de revisão contínua.

---

## 4. Prioridade de implementação

### Fase 1 — Essencial
- autenticação;
- mapeamento de contato;
- upsert básico;
- histórico mínimo;
- criação de oportunidade.

### Fase 2 — Operacional
- handoff humano;
- movimentação de pipeline;
- logging e observabilidade;
- deduplicação.

### Fase 3 — Evolução
- eventos avançados;
- automações por intenção;
- métricas de uso e créditos;
- refinamento de regras.

---

## 5. Riscos

- divergência entre os campos do GPTMaker e do NossoCRM;
- duplicidade de contatos;
- falta de evento/webhook para alguns fluxos;
- consumo de créditos acima do esperado;
- limitações por canal;
- falhas de handoff sem rastreabilidade.

---

## 6. Critério de sucesso

A integração é considerada bem-sucedida quando:

- contatos entram no NossoCRM sem duplicação;
- histórico é preservado;
- oportunidades são criadas corretamente;
- handoff humano fica rastreável;
- erros ficam visíveis em log;
- consumo de crédito é monitorável.

---

## 7. Próximo passo recomendado

Detalhar o **mapa de campos** e os **eventos de sincronização** antes de escrever qualquer código.

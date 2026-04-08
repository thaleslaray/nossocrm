# Relatório — Documentação GPTMaker

> **Projeto:** NossoCRM - CRM Inteligente para Agência de Viagens
> **Cliente:** Kleber Yascom
> **Fontes analisadas:**
> - `https://developer.gptmaker.ai/introduction`
> - `https://developer.gptmaker.ai/api-reference/introduction`
> - Testes reais via API com chave de produção (2026-04-08)
>
> **Status:** Verificado com testes reais — dados de conta ativa do cliente.

---

## 1. Resumo Executivo

O GPTMaker é uma plataforma de agentes de IA voltada para **atendimento ao cliente**, **qualificação de leads** e **vendas**. Para o projeto NossoCRM, a conta do cliente (`Kleber Yascom`) já tem um agente ativo chamado **Isa**, configurada como atendente virtual da "Viagens +" com papel de pré-qualificação de leads.

A integração técnica foi testada e validada: todos os endpoints principais da API v2 respondem corretamente com a chave de API do cliente.

---

## 2. Conta e workspace do cliente

Dados confirmados via API (`GET /v2/workspaces`):

| Campo             | Valor                                  |
| :---------------- | :------------------------------------- |
| Workspace ID      | `3F15B76D670D8043E46932DE6B387D16`     |
| Nome do workspace | Meu Workspace                          |
| Status de créditos | TRIAL                                 |
| Créditos restantes | 1.000                                 |

---

## 3. Agente Isa — configuração atual

Dados confirmados via `GET /v2/workspace/{id}/agents` e `GET /v2/agent/{id}`:

| Campo       | Valor                                      |
| :---------- | :----------------------------------------- |
| ID do agente | `3F15B8140244706AFB3132DE6B387D16`        |
| Nome        | Isa                                        |
| Tipo        | SALE (qualificação/vendas)                 |
| Modelo IA   | GPT_5_MINI                                 |
| Fuso horário | America/Sao_Paulo                         |

### 3.1 Comportamento configurado (prompt)

O agente Isa foi programado para operar como atendente virtual da "Viagens +" com o seguinte papel:

> "Você é Isa, atendente virtual da Viagens +. Seu papel é fazer a pré-qualificação de clientes interessados em viagens. Seu objetivo é coletar informações essenciais e registrar o lead para um consultor humano."

Esse comportamento é consistente com o fluxo do NossoCRM: Isa coleta os dados (destino, datas, viajantes, categoria, urgência, origem) e o webhook `gptmaker-in` os ingere no CRM.

### 3.2 Webhooks (estado atual)

Verificado via `GET /v2/agent/{id}/webhooks`: **nenhum webhook configurado**. Todas as URLs de callback estão vazias.

Isso significa que o fluxo de integração atual depende de a Isa chamar o endpoint do NossoCRM via configuração externa — os webhooks GPTMaker → NossoCRM precisam ser configurados na plataforma.

### 3.3 Treinamentos

Verificado via `GET /v2/agent/{id}/trainings`: **nenhum treinamento adicionado**. A Isa opera apenas com o prompt inicial, sem base de conhecimento extra.

---

## 4. Autenticação da API

- **Bearer token** no header `Authorization`
- Token obtido na área de **Chave de API** do painel GPTMaker
- Formato: `Authorization: Bearer eyJ...`
- Validade: não expirou durante os testes

---

## 5. Capacidades da plataforma (documentação oficial)

### 5.1 Posicionamento

O GPTMaker é apresentado para:

- respostas 24/7 para clientes
- escalonamento para atendimento humano (handoff)
- qualificação de leads (SDR)
- agendamento de apresentações
- apoio à venda de serviços e infoprodutos
- integração com Google Agenda
- personalização com dados da empresa

### 5.2 Áreas cobertas pela API

A documentação lista endpoints para:

- **Agentes**: ativar, inativar, atualizar, configurações, webhooks, treinamentos, créditos
- **Canais**: criar, listar, editar, remover, QR code, widget
- **Chats**: listar, enviar/editar/deletar mensagem, handoff humano, encerrar atendimento
- **Contatos**: buscar, listar, atualizar
- **Workspace**: créditos, configurações gerais
- **MCP**: conexão, sincronização, ativação/inativação de ferramentas

### 5.3 Restrições documentadas

- Edição/deleção de mensagens: apenas em canais Z-API, Telegram e Widget
- Treinamentos: apenas textuais podem ser atualizados; demais devem ser removidos e recriados
- Créditos: consumo por modelo — GPT_5_MINI tem menor custo

---

## 6. Conclusão

A conta do cliente está ativa e operacional no GPTMaker. O agente Isa está configurado corretamente para o papel de pré-qualificação de leads de viagem. Os pontos pendentes são:

1. **Configurar webhooks** do GPTMaker → NossoCRM (Edge Function `gptmaker-in`)
2. **Adicionar treinamentos** à Isa (base de conhecimento da agência)
3. **Validar créditos** antes de colocar em produção com volume real (conta TRIAL com 1.000 créditos)

---

## 7. Fontes

- `https://developer.gptmaker.ai/introduction`
- `https://developer.gptmaker.ai/api-reference/introduction`
- Testes reais com API key do cliente — 2026-04-08

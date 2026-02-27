# MCP (Model Context Protocol) – Expondo este CRM como MCP Server

Este projeto expõe um **MCP Server remoto** via **Vercel/Next.js** para permitir que clientes compatíveis com MCP (ex.: Inspector, IDEs, agentes) acessem contexto e executem tools do CRM.

## Endpoint

- `POST /api/mcp` (JSON-RPC 2.0)
- `GET /api/mcp` (health/metadata)

## Autenticação

Este MCP Server reutiliza o mesmo esquema de autenticação da **Public API**:

- Header recomendado (compatível com a maioria dos clients MCP):
  - `Authorization: Bearer <API_KEY>`
- Alternativa:
  - `X-Api-Key: <API_KEY>`

> A API key é validada via RPC `validate_api_key` no Supabase, e o acesso é limitado ao `organization_id` retornado.

## Compatibilidade com ChatGPT

Nesta **Fase 1**, o MCP usa **API key** (Bearer/X-Api-Key) — isso é ótimo para **MCP Inspector** e clientes MCP onde você controla os headers.

Para conectar **direto no ChatGPT** como “custom app/connector” com **MCP autenticado**, o fluxo esperado é **OAuth 2.1/PKCE** (Fase 2). Sem OAuth, o ChatGPT não consegue “guardar e reenviar” sua API key para o MCP.

## Tools disponíveis

As tools expostas em `tools/list` são geradas a partir das tools existentes do CRM (definidas em `createCRMTools`), com nomes padronizados no formato `crm.*` (ex.: `crm.deals.search`, `crm.deals.move`, `crm.activities.list`).

Notas:
- Os nomes antigos do MVP (`crm_get_me`, `crm_search_deals`, `crm_get_deal`) **não** são mais publicados.
- Tools que ainda não foram curadas no catálogo são expostas como `crm.unmapped.<internalKey>`.
- Os schemas de entrada (`inputSchema`) são publicados em **JSON Schema 2020-12**.
- Erros de validação/negócio retornam `isError: true` no ToolResult (em vez de erro JSON-RPC), para permitir auto-correção pelo client/modelo.

## Testar com MCP Inspector

1. Rode o MCP Inspector localmente.
2. Configure:
   - **Transport Type**: HTTP
   - **URL**: `https://<seu-dominio>/api/mcp`
   - **Bearer Token**: sua API key
3. Conecte e execute:
   - `tools/list`
   - `tools/call` com alguma tool `crm.*` (ex.: `crm.deals.search`)

## Exemplo (curl)

```bash
curl -sS -X POST 'https://<seu-dominio>/api/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <API_KEY>' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  --data-raw '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Exemplo (curl) – tools/call

```bash
curl -sS -X POST 'https://<seu-dominio>/api/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <API_KEY>' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  --data-raw '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "crm.deals.search",
      "arguments": { "query": "Nike", "limit": 5 }
    }
  }'
```

---

## Instâncias Configuradas

### Coronel Picanha CRM (Produção)

| Configuração | Valor |
|--------------|-------|
| **Endpoint** | `https://coronelpicanhacrm.vercel.app/api/mcp` |
| **API Key** | `ncrm_Yz1RyzuptiFLVIuL-x5wZQKzxo7cw4Ke` |
| **Organization ID** | `5f8d9c08-fb66-4fc9-be53-180d3ab35d0f` |

**Exemplo de uso (curl):**

```bash
# Listar tools disponíveis
curl -sS -X POST 'https://coronelpicanhacrm.vercel.app/api/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ncrm_Yz1RyzuptiFLVIuL-x5wZQKzxo7cw4Ke' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  --data-raw '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Buscar deals
curl -sS -X POST 'https://coronelpicanhacrm.vercel.app/api/mcp' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ncrm_Yz1RyzuptiFLVIuL-x5wZQKzxo7cw4Ke' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  --data-raw '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "crm.deals.search",
      "arguments": { "limit": 10 }
    }
  }'
```

### Lagosta Criativa CRM (Desenvolvimento)

| Configuração | Valor |
|--------------|-------|
| **Endpoint** | `https://lagostacrm.vercel.app/api/mcp` |
| **API Key** | Ver `.env.local` |
| **Organization ID** | `d156b55f-256f-4f40-a273-5f5da5a9e882` |

---

## Configuração no Claude Code

Para usar o MCP do CRM no Claude Code, adicione ao arquivo `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coronel-crm": {
      "url": "https://coronelpicanhacrm.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer ncrm_Yz1RyzuptiFLVIuL-x5wZQKzxo7cw4Ke"
      }
    }
  }
}
```

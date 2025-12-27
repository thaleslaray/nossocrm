// OpenAPI 3.1.2 "source of truth" for NossoCRM Public API (Integrations).
//
// NOTE:
// - Keep this file updated together with route implementations.
// - Prefer stable, integration-friendly shapes (simple objects, consistent errors).

export type OpenApiDocument = Record<string, any>;

export function getPublicApiOpenApiDocument(): OpenApiDocument {
  return {
    openapi: '3.1.2',
    info: {
      title: 'NossoCRM Public API',
      version: 'v1',
      description:
        'API pública do NossoCRM para integrações (n8n/Make). Produto em primeiro lugar: copiar → colar → testar.',
    },
    servers: [{ url: '/api/public/v1' }],
    tags: [
      { name: 'Meta', description: 'Sobre a API e autenticação' },
      { name: 'Boards', description: 'Pipelines/boards e etapas' },
      { name: 'Companies', description: 'Empresas (clientes do CRM)' },
      { name: 'Contacts', description: 'Contatos (leads/pessoas)' },
      { name: 'Deals', description: 'Negócios (cards)' },
      { name: 'Activities', description: 'Atividades (nota/tarefa/reunião/ligação)' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
          description: 'Chave gerada na interface (Settings → Integrações).',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          additionalProperties: false,
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
          required: ['error'],
        },
        PaginatedResponse: {
          type: 'object',
          additionalProperties: false,
          properties: {
            data: { type: 'array', items: {} },
            nextCursor: { type: 'string', nullable: true },
          },
          required: ['data'],
        },
        Board: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: 'UUID do board' },
            key: { type: ['string', 'null'], description: 'Slug estável (integrações)' },
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            position: { type: 'integer' },
            is_default: { type: 'boolean' },
          },
          required: ['id', 'key', 'name', 'description', 'position', 'is_default'],
        },
        BoardStage: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: 'UUID do estágio' },
            label: { type: 'string' },
            color: { type: ['string', 'null'] },
            order: { type: 'integer' },
          },
          required: ['id', 'label', 'color', 'order'],
        },
        Company: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            website: { type: ['string', 'null'] },
            industry: { type: ['string', 'null'] },
            created_at: { type: 'string' },
            updated_at: { type: ['string', 'null'] },
          },
          required: ['id', 'name', 'website', 'industry', 'created_at', 'updated_at'],
        },
        Contact: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
            role: { type: ['string', 'null'] },
            client_company_id: { type: ['string', 'null'] },
            source: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'] },
            created_at: { type: 'string' },
            updated_at: { type: ['string', 'null'] },
          },
          required: ['id', 'name', 'email', 'phone', 'role', 'client_company_id', 'source', 'notes', 'created_at', 'updated_at'],
        },
        Deal: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            value: { type: 'number' },
            board_id: { type: 'string' },
            stage_id: { type: 'string' },
            contact_id: { type: 'string' },
            client_company_id: { type: ['string', 'null'] },
            is_won: { type: 'boolean' },
            is_lost: { type: 'boolean' },
            loss_reason: { type: ['string', 'null'] },
            closed_at: { type: ['string', 'null'] },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
          required: ['id', 'title', 'value', 'board_id', 'stage_id', 'contact_id', 'client_company_id', 'is_won', 'is_lost', 'loss_reason', 'closed_at', 'created_at', 'updated_at'],
        },
        Activity: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            type: { type: 'string' },
            date: { type: 'string' },
            completed: { type: 'boolean' },
            deal_id: { type: ['string', 'null'] },
            contact_id: { type: ['string', 'null'] },
            client_company_id: { type: ['string', 'null'] },
            created_at: { type: 'string' },
          },
          required: ['id', 'title', 'description', 'type', 'date', 'completed', 'deal_id', 'contact_id', 'client_company_id', 'created_at'],
        },
      },
      responses: {
        Unauthorized: {
          description: 'API key ausente ou inválida',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                missing: { value: { error: 'Missing X-Api-Key', code: 'AUTH_MISSING' } },
                invalid: { value: { error: 'Invalid API key', code: 'AUTH_INVALID' } },
              },
            },
          },
        },
      },
    },
    paths: {
      '/openapi.json': {
        get: {
          tags: ['Meta'],
          summary: 'OpenAPI document (JSON)',
          description: 'Documento OpenAPI 3.1.2 desta API.',
          responses: {
            200: {
              description: 'OpenAPI document',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
      // Endpoints below will be implemented next and MUST be kept in sync:
      '/me': {
        get: {
          tags: ['Meta'],
          summary: 'Identidade da API key',
          security: [{ ApiKeyAuth: [] }],
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          organization_id: { type: 'string' },
                          organization_name: { type: 'string' },
                          api_key_prefix: { type: 'string' },
                        },
                        required: ['organization_id', 'organization_name', 'api_key_prefix'],
                      },
                    },
                    required: ['data'],
                    additionalProperties: false,
                  },
                  examples: {
                    ok: {
                      value: {
                        data: {
                          organization_id: '00000000-0000-0000-0000-000000000000',
                          organization_name: 'Minha Empresa',
                          api_key_prefix: 'ncrm_abc123',
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/boards': {
        get: {
          tags: ['Boards'],
          summary: 'Listar boards (pipelines)',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Busca por name/key' },
            { name: 'key', in: 'query', schema: { type: 'string' }, description: 'Filtro exato por key' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250 }, description: 'Tamanho da página' },
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Cursor opaco' },
          ],
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Board' } },
                      nextCursor: { type: ['string', 'null'] },
                    },
                    required: ['data', 'nextCursor'],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/boards/{boardKeyOrId}': {
        get: {
          tags: ['Boards'],
          summary: 'Obter board por key ou id',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'boardKeyOrId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: { data: { $ref: '#/components/schemas/Board' } },
                    required: ['data'],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/boards/{boardKeyOrId}/stages': {
        get: {
          tags: ['Boards'],
          summary: 'Listar etapas do board',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'boardKeyOrId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/BoardStage' } },
                    },
                    required: ['data'],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/companies': {
        get: {
          tags: ['Companies'],
          summary: 'Listar empresas',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'name', in: 'query', schema: { type: 'string' } },
            { name: 'website', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Company' } },
                      nextCursor: { type: ['string', 'null'] },
                    },
                    required: ['data', 'nextCursor'],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Companies'],
          summary: 'Criar/atualizar empresa (upsert)',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    website: { type: 'string' },
                    industry: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Created',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            200: { description: 'Updated', content: { 'application/json': { schema: { type: 'object' } } } },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/companies/{companyId}': {
        get: {
          tags: ['Companies'],
          summary: 'Obter empresa',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Company' } }, required: ['data'] } } },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        patch: {
          tags: ['Companies'],
          summary: 'Atualizar empresa',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/contacts': {
        get: {
          tags: ['Contacts'],
          summary: 'Listar contatos',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'email', in: 'query', schema: { type: 'string' } },
            { name: 'phone', in: 'query', schema: { type: 'string' } },
            { name: 'client_company_id', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Contact' } },
                      nextCursor: { type: ['string', 'null'] },
                    },
                    required: ['data', 'nextCursor'],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Contacts'],
          summary: 'Criar/atualizar contato (upsert)',
          security: [{ ApiKeyAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: {
            201: { description: 'Created', content: { 'application/json': { schema: { type: 'object' } } } },
            200: { description: 'Updated', content: { 'application/json': { schema: { type: 'object' } } } },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/contacts/{contactId}': {
        get: {
          tags: ['Contacts'],
          summary: 'Obter contato',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'contactId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Contact' } }, required: ['data'] } } } },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        patch: {
          tags: ['Contacts'],
          summary: 'Atualizar contato',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'contactId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/deals': {
        get: {
          tags: ['Deals'],
          summary: 'Listar deals',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'board_id', in: 'query', schema: { type: 'string' } },
            { name: 'board_key', in: 'query', schema: { type: 'string' } },
            { name: 'stage_id', in: 'query', schema: { type: 'string' } },
            { name: 'contact_id', in: 'query', schema: { type: 'string' } },
            { name: 'client_company_id', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'won', 'lost'] } },
            { name: 'updated_after', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Deal' } },
                      nextCursor: { type: ['string', 'null'] },
                    },
                    required: ['data', 'nextCursor'],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Deals'],
          summary: 'Criar deal',
          security: [{ ApiKeyAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: {
            201: { description: 'Created', content: { 'application/json': { schema: { type: 'object' } } } },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/deals/{dealId}': {
        get: {
          tags: ['Deals'],
          summary: 'Obter deal',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'dealId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Deal' } }, required: ['data'] } } } },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        patch: {
          tags: ['Deals'],
          summary: 'Atualizar deal',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'dealId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } }, 401: { $ref: '#/components/responses/Unauthorized' } },
        },
      },
      '/deals/{dealId}/move-stage': {
        post: {
          tags: ['Deals'],
          summary: 'Mover etapa do deal',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'dealId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { to_stage_id: { type: 'string' } }, required: ['to_stage_id'] } } } },
          responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } }, 401: { $ref: '#/components/responses/Unauthorized' } },
        },
      },
      '/deals/{dealId}/mark-won': {
        post: {
          tags: ['Deals'],
          summary: 'Marcar como ganho',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'dealId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } }, 401: { $ref: '#/components/responses/Unauthorized' } },
        },
      },
      '/deals/{dealId}/mark-lost': {
        post: {
          tags: ['Deals'],
          summary: 'Marcar como perdido',
          security: [{ ApiKeyAuth: [] }],
          parameters: [{ name: 'dealId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { loss_reason: { type: 'string' } } } } } },
          responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } }, 401: { $ref: '#/components/responses/Unauthorized' } },
        },
      },
      '/activities': {
        get: {
          tags: ['Activities'],
          summary: 'Listar atividades',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'deal_id', in: 'query', schema: { type: 'string' } },
            { name: 'contact_id', in: 'query', schema: { type: 'string' } },
            { name: 'client_company_id', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Activity' } },
                      nextCursor: { type: ['string', 'null'] },
                    },
                    required: ['data', 'nextCursor'],
                  },
                },
              },
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Activities'],
          summary: 'Criar atividade',
          security: [{ ApiKeyAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 201: { description: 'Created', content: { 'application/json': { schema: { type: 'object' } } } }, 401: { $ref: '#/components/responses/Unauthorized' } },
        },
      },
    },
  };
}


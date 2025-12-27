import { describe, expect, it } from 'vitest';
import { getPublicApiOpenApiDocument } from '@/lib/public-api/openapi';

describe('Public API OpenAPI', () => {
  it('declares OpenAPI 3.1.2 and basic security scheme', () => {
    const doc = getPublicApiOpenApiDocument();
    expect(doc.openapi).toBe('3.1.2');
    expect(doc.components?.securitySchemes?.ApiKeyAuth?.type).toBe('apiKey');
    expect(doc.components?.securitySchemes?.ApiKeyAuth?.name).toBe('X-Api-Key');
  });

  it('contains core paths for v1', () => {
    const doc = getPublicApiOpenApiDocument();
    const paths = Object.keys(doc.paths || {});

    const required = [
      '/openapi.json',
      '/me',
      '/boards',
      '/boards/{boardKeyOrId}',
      '/boards/{boardKeyOrId}/stages',
      '/companies',
      '/companies/{companyId}',
      '/contacts',
      '/contacts/{contactId}',
      '/deals',
      '/deals/{dealId}',
      '/deals/{dealId}/move-stage',
      '/deals/{dealId}/mark-won',
      '/deals/{dealId}/mark-lost',
      '/activities',
    ];

    for (const p of required) {
      expect(paths).toContain(p);
    }
  });
});


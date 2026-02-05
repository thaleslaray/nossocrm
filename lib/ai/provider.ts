import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AI_DEFAULT_MODELS } from './defaults';

/**
 * Creates a Google Generative AI provider with the given API key.
 * This allows for dynamic API key configuration per request,
 * since the key is stored in the database per organization.
 */
export function createProvider(apiKey: string) {
    return createGoogleGenerativeAI({ apiKey });
}

/**
 * Default model to use for the CRM assistant.
 * @deprecated Prefer importing from `@/lib/ai/defaults` directly.
 */
export const DEFAULT_MODEL = AI_DEFAULT_MODELS.google;

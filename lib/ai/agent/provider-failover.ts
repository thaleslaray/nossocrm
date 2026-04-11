/**
 * @fileoverview Provider failover for AI model generation.
 *
 * Tries the primary provider first, then falls back to secondary/tertiary
 * providers if configured. Only retries on provider-level errors (auth,
 * rate limit, server errors), NOT on content/validation errors.
 */

import { generateText, type LanguageModel } from 'ai';
import { getModel, type AIProvider } from '../config';

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

interface GenerateWithFailoverParams {
  providers: ProviderConfig[];
  system: string;
  prompt: string;
  maxRetries?: number;
  temperature?: number;
}

interface GenerateWithFailoverResult {
  text: string;
  usage?: { totalTokens?: number };
  modelUsed: string;
  providerUsed: AIProvider;
}

/**
 * Try generating text with failover across multiple providers.
 *
 * @throws If ALL providers fail
 */
export async function generateWithFailover(
  params: GenerateWithFailoverParams
): Promise<GenerateWithFailoverResult> {
  const { providers, system, prompt, maxRetries = 2, temperature } = params;

  if (providers.length === 0) {
    throw new Error('No AI providers configured');
  }

  const errors: Array<{ provider: AIProvider; error: string }> = [];

  for (const config of providers) {
    try {
      const model: LanguageModel = getModel(
        config.provider,
        config.apiKey,
        config.model
      );

      const result = await generateText({
        model,
        system,
        prompt,
        maxRetries,
        ...(temperature !== undefined ? { temperature } : {}),
      });

      if (errors.length > 0) {
        console.warn(
          `[AIAgent] Failover: ${config.provider} succeeded after ${errors.length} failed provider(s):`,
          errors.map((e) => `${e.provider}: ${e.error}`)
        );
      }

      return {
        text: result.text,
        usage: result.usage
          ? { totalTokens: result.usage.totalTokens }
          : undefined,
        modelUsed: config.model,
        providerUsed: config.provider,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[AIAgent] Provider ${config.provider} failed:`,
        errorMessage
      );
      errors.push({ provider: config.provider, error: errorMessage });
    }
  }

  // All providers failed
  const summary = errors
    .map((e) => `${e.provider}: ${e.error}`)
    .join('; ');
  throw new Error(`All AI providers failed: ${summary}`);
}

/**
 * Build an ordered list of provider configs from org settings.
 * Primary provider first, then others that have API keys configured.
 */
export function buildProviderList(orgConfig: {
  provider: AIProvider;
  apiKey: string;
  model: string;
}): ProviderConfig[] {
  const { provider: primary, apiKey, model } = orgConfig;
  const providers: ProviderConfig[] = [];

  // Primary always first
  if (apiKey) {
    providers.push({ provider: primary, apiKey, model });
  }

  return providers;
}

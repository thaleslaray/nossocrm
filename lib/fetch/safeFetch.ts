/**
 * Safe Fetch Wrapper com Timeout e AbortController
 *
 * Resolve o problema de fetch() poder travar indefinidamente quando um
 * servidor não responde. Fornece timeout configurável e tratamento de erro
 * consistente.
 *
 * @module lib/fetch/safeFetch
 */

/** Opções estendidas para safeFetch */
export interface SafeFetchOptions extends RequestInit {
  /**
   * Timeout em milissegundos. Padrão: 30000 (30 segundos)
   * Use 0 para desabilitar timeout (não recomendado)
   */
  timeout?: number;
}

/** Erro customizado para timeout de fetch */
export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
  }
}

/** Erro customizado para fetch abortado */
export class FetchAbortedError extends Error {
  constructor(url: string) {
    super(`Request to ${url} was aborted`);
    this.name = 'FetchAbortedError';
  }
}

/**
 * Wrapper seguro para fetch com timeout automático.
 *
 * Diferente do fetch nativo que pode travar indefinidamente, safeFetch
 * garante que a requisição será cancelada após o timeout especificado.
 *
 * @param url - URL para fazer a requisição
 * @param options - Opções do fetch + timeout customizado
 * @returns Promise<Response> - Resposta do fetch
 * @throws {FetchTimeoutError} - Se o timeout for atingido
 * @throws {FetchAbortedError} - Se a requisição for abortada externamente
 *
 * @example
 * ```typescript
 * // Uso básico com timeout padrão (30s)
 * const response = await safeFetch('https://api.example.com/data');
 *
 * // Com timeout customizado (5s)
 * const response = await safeFetch('https://api.example.com/data', {
 *   timeout: 5000,
 *   method: 'POST',
 *   body: JSON.stringify({ data: 'value' }),
 * });
 *
 * // Com tratamento de erro
 * try {
 *   const response = await safeFetch(url, { timeout: 10000 });
 *   if (!response.ok) {
 *     throw new Error(`HTTP ${response.status}`);
 *   }
 *   return await response.json();
 * } catch (error) {
 *   if (error instanceof FetchTimeoutError) {
 *     console.error('Servidor demorou muito para responder');
 *   }
 *   throw error;
 * }
 * ```
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const { timeout = 30000, signal: externalSignal, ...fetchOptions } = options;

  // Se timeout é 0, usa fetch sem timeout (não recomendado)
  if (timeout === 0) {
    return fetch(url, { ...fetchOptions, signal: externalSignal });
  }

  // Cria AbortController para gerenciar o timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Combina sinais se um sinal externo foi fornecido
  // Isso permite que o chamador também possa abortar a requisição
  const combinedSignal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: combinedSignal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        // Verifica se foi timeout ou abort externo
        if (controller.signal.aborted) {
          throw new FetchTimeoutError(url, timeout);
        }
        throw new FetchAbortedError(url);
      }
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Wrapper para safeFetch que já faz parse do JSON.
 * Útil para APIs que sempre retornam JSON.
 *
 * @param url - URL para fazer a requisição
 * @param options - Opções do fetch + timeout customizado
 * @returns Promise<T> - Dados parseados do JSON
 * @throws {Error} - Se response.ok for false
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 * }
 *
 * const user = await safeFetchJson<User>('/api/user/123');
 * console.log(user.name);
 * ```
 */
export async function safeFetchJson<T = unknown>(
  url: string,
  options: SafeFetchOptions = {}
): Promise<T> {
  const response = await safeFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

export default safeFetch;

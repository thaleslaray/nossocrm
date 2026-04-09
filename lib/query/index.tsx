/**
 * @fileoverview Configuração do TanStack Query para o NossoCRM.
 * 
 * Este módulo centraliza toda a configuração de gerenciamento de estado do servidor:
 * - Cliente e provider do TanStack Query
 * - Query keys centralizadas para todas as entidades
 * - Tratamento de erros padronizado
 * - Hooks customizados para operações comuns
 * 
 * ## Funcionalidades
 * 
 * - Cache inteligente com stale time de 5 minutos
 * - Garbage collection após 30 minutos
 * - Retry automático com backoff exponencial
 * - Refetch automático em foco/reconexão
 * - Updates otimistas para UX instantânea
 * 
 * @module lib/query
 * 
 * @example
 * ```tsx
 * // Usando o provider na raiz da aplicação
 * <QueryProvider>
 *   <App />
 * </QueryProvider>
 * 
 * // Usando hooks de entidade
 * const { data: deals } = useDeals({ boardId: 'xxx' });
 * const createDeal = useCreateDeal();
 * ```
 */
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
  QueryCache,
  MutationCache,
} from '@tanstack/react-query';
import React from 'react';
import { useNotificationStore } from '@/lib/stores';
import { ERROR_CODES, getErrorMessage } from '@/lib/validations/errorCodes';

// ============ TRATAMENTO DE ERROS ============

/**
 * Estrutura de erro da API.
 * 
 * @interface APIError
 */
interface APIError {
  /** Código do erro. */
  code: string;
  /** Mensagem do erro. */
  message: string;
  /** Status HTTP. */
  status?: number;
}

/**
 * Handler de erros para queries.
 * 
 * Exibe notificação com mensagem apropriada baseada no tipo de erro.
 * 
 * @param error - Erro capturado.
 */
const handleQueryError = (error: unknown) => {
  const addNotification = useNotificationStore.getState().addNotification;

  let errorMessage = getErrorMessage(ERROR_CODES.API_ERROR);

  if (error instanceof Error) {
    // Network error
    if (error.message === 'Failed to fetch') {
      errorMessage = getErrorMessage(ERROR_CODES.API_NETWORK_ERROR);
    }
    // Timeout
    else if (error.name === 'AbortError') {
      errorMessage = getErrorMessage(ERROR_CODES.API_TIMEOUT);
    }
    // API error with code
    else if ('code' in error) {
      const apiError = error as unknown as APIError;
      if (apiError.status === 401) {
        errorMessage = getErrorMessage(ERROR_CODES.API_UNAUTHORIZED);
      } else if (apiError.status === 404) {
        errorMessage = getErrorMessage(ERROR_CODES.API_NOT_FOUND);
      }
    }
  }

  addNotification({
    type: 'error',
    title: 'Erro',
    message: errorMessage,
  });
};

/**
 * Handler de erros para mutations.
 * 
 * @param error - Erro capturado.
 * @param _variables - Variáveis da mutation (não utilizado).
 * @param _context - Contexto da mutation (não utilizado).
 */
const handleMutationError = (error: unknown, _variables: unknown, _context: unknown) => {
  handleQueryError(error);
};

// ============ QUERY CLIENT ============

/**
 * Política de staleTime por tipo de dado:
 *
 * | Tipo                       | staleTime | Justificativa                                     |
 * |----------------------------|-----------|---------------------------------------------------|
 * | Referência (boards, stages)| 5min      | Raramente muda, default global                    |
 * | Deals                      | 2min      | Kanban precisa de dados relativamente frescos     |
 * | Conversations (inbox)      | 30s       | Alta frequência de updates, near-realtime         |
 * | AI metrics                 | 5min      | Dashboard, não requer refresh frequente           |
 * | User profile               | 5min      | Default global                                    |
 *
 * Realtime (Supabase) invalida o cache automaticamente via queryClient.invalidateQueries
 * quando eventos INSERT/UPDATE chegam — portanto staleTime alto é seguro para entidades
 * cobertas pelo Realtime.
 */

/**
 * Cliente TanStack Query configurado para o NossoCRM.
 * 
 * Configurações:
 * - Stale time: 5 minutos
 * - Cache time: 30 minutos
 * - Retry: 3x com backoff exponencial
 * - Refetch automático em foco/reconexão
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cache time: 30 minutes
      gcTime: 30 * 60 * 1000,
      // Retry failed requests 3 times
      retry: 3,
      // Retry delay with exponential backoff
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Realtime covers main entities — window focus refetch is redundant
      refetchOnWindowFocus: false,
      // Don't refetch on mount if data is fresh
      refetchOnMount: true,
      // Refetch on reconnect
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
  queryCache: new QueryCache({
    onError: handleQueryError,
  }),
  mutationCache: new MutationCache({
    onError: handleMutationError,
  }),
});

// ============ PROVIDER ============

/**
 * Props do QueryProvider.
 * 
 * @interface QueryProviderProps
 */
interface QueryProviderProps {
  /** Componentes filhos a serem envolvidos. */
  children: React.ReactNode;
}

/**
 * Provider do TanStack Query para a aplicação.
 * 
 * Envolve a aplicação com o cliente de query configurado.
 * Deve ser colocado próximo à raiz da árvore de componentes.
 * 
 * @param props - Props do componente.
 * @returns Componente provider.
 */
export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

// ============ QUERY KEYS ============
/**
 * Query keys centralizadas para gerenciamento de cache.
 * 
 * Usar estas keys garante consistência na invalidação e prefetch.
 * Pattern: `queryKeys.entity.action(params)`
 * 
 * @example
 * ```typescript
 * // Invalidar todos os deals
 * queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
 * 
 * // Invalidar deals de um board específico
 * queryClient.invalidateQueries({ 
 *   queryKey: queryKeys.deals.list({ boardId: 'xxx' }) 
 * });
 * ```
 */
// Re-export queryKeys
export * from './queryKeys';
import { queryKeys } from './queryKeys';

// ============ PREFETCH HELPERS ============

/**
 * Pré-carrega dados para uma rota antes da navegação.
 * 
 * Melhora a percepção de velocidade ao carregar dados antecipadamente.
 * 
 * @param route - Nome da rota a ser pré-carregada.
 * 
 * @example
 * ```typescript
 * // No hover de um link de navegação
 * <Link onMouseEnter={() => prefetchRouteData('contacts')}>
 *   Contatos
 * </Link>
 * ```
 */
export const prefetchRouteData = async (route: string) => {
  switch (route) {
    case 'dashboard':
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: queryKeys.dashboard.stats,
          queryFn: async () => {
            // Will be replaced with actual API call
            return null;
          },
        }),
      ]);
      break;
    case 'contacts':
      await queryClient.prefetchQuery({
        queryKey: queryKeys.contacts.lists(),
        queryFn: async () => null,
      });
      break;
    // Add more routes as needed
  }
};

// Re-export hooks from TanStack Query
export { useQuery, useMutation, useQueryClient };

// Re-export entity hooks
export * from './hooks';

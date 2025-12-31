# Arquitetura de Cache - Single Source of Truth

## Princípio Fundamental

**Cada entidade tem UMA ÚNICA cache global como fonte da verdade.** Todas as operações (CRUD, Realtime, optimistic updates) devem ler/escrever na mesma cache.

## Query Keys Oficiais

| Entidade | Cache Global (Source of Truth) | Uso |
|----------|-------------------------------|-----|
| Deals | `[...queryKeys.deals.lists(), 'view']` | Todas as operações de deals |
| Boards | `queryKeys.boards.lists()` | Todas as operações de boards |
| Contacts | `queryKeys.contacts.lists()` | Todas as operações de contacts |
| Activities | `queryKeys.activities.lists()` | Todas as operações de activities |
| Companies | `queryKeys.companies.lists()` | Todas as operações de companies |

## Padrão de Implementação

### 1. Hook de Leitura Global

```typescript
// CORRETO: Cache global única
export const useDealsView = () => {
  return useQuery<DealView[]>({
    queryKey: [...queryKeys.deals.lists(), 'view'],
    queryFn: async () => { /* fetch all deals */ },
  });
};
```

### 2. Hook de Filtragem Client-Side

```typescript
// CORRETO: Deriva da cache global
export const useBoardDeals = (boardId: string) => {
  const { data: allDeals = [], ...rest } = useDealsView();
  
  const boardDeals = useMemo(
    () => allDeals.filter(d => d.boardId === boardId),
    [allDeals, boardId]
  );
  
  return { data: boardDeals, ...rest };
};
```

### 3. Mutation com Optimistic Update

```typescript
// CORRETO: Escreve na cache global
export const useCreateDeal = () => {
  return useMutation({
    mutationFn: (deal) => dealsService.create(deal),
    onMutate: async (newDeal) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.deals.all });
      
      const previousDeals = queryClient.getQueryData<DealView[]>(
        [...queryKeys.deals.lists(), 'view']
      );
      
      // Insere na cache GLOBAL
      queryClient.setQueryData<DealView[]>(
        [...queryKeys.deals.lists(), 'view'],
        (old = []) => [tempDeal, ...old]
      );
      
      return { previousDeals };
    },
    onSuccess: (data) => {
      // Substitui temp por real na cache GLOBAL
      queryClient.setQueryData<DealView[]>(
        [...queryKeys.deals.lists(), 'view'],
        (old = []) => {
          const withoutTemp = old.filter(d => !d.id.startsWith('temp-'));
          return [data, ...withoutTemp];
        }
      );
    },
    onError: (err, variables, context) => {
      if (context?.previousDeals) {
        queryClient.setQueryData(
          [...queryKeys.deals.lists(), 'view'],
          context.previousDeals
        );
      }
    },
  });
};
```

### 4. Realtime Sync

```typescript
// CORRETO: Atualiza a cache global
const handleRealtimeUpdate = (payload) => {
  queryClient.setQueryData<DealView[]>(
    [...queryKeys.deals.lists(), 'view'],
    (old = []) => {
      return old.map(deal => 
        deal.id === payload.new.id ? { ...deal, ...payload.new } : deal
      );
    }
  );
};
```

## Anti-Padrões (NAO FAZER)

### Múltiplas Caches por Filtro

```typescript
// ERRADO: Cria cache separada por board
queryClient.setQueryData<DealView[]>(
  queryKeys.deals.list({ boardId: 'xxx' }),  // Cache específica - NAO USAR!
  (old = []) => [newDeal, ...old]
);

// CORRETO: Sempre usar cache global
queryClient.setQueryData<DealView[]>(
  [...queryKeys.deals.lists(), 'view'],
  (old = []) => [newDeal, ...old]
);
```

### Invalidar em vez de Atualizar

```typescript
// EVITAR: Invalida e força refetch (lento, causa flash)
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
}

// PREFERIR: Atualiza diretamente a cache (instantâneo)
onSuccess: (data) => {
  queryClient.setQueryData([...queryKeys.deals.lists(), 'view'], 
    (old = []) => [data, ...old.filter(d => d.id !== data.id)]
  );
}
```

### Context manipulando cache diferente do Hook

```typescript
// ERRADO: Context e Hook usando caches diferentes
// CRMContext.tsx
queryClient.setQueryData(
  queryKeys.deals.list({ boardId }),  // Cache A
  ...
);

// useDealsQuery.ts
queryClient.setQueryData(
  [...queryKeys.deals.lists(), 'view'],  // Cache B - DIFERENTE!
  ...
);

// CORRETO: Ambos usam a mesma cache
// Tanto Context quanto Hook usam: [...queryKeys.deals.lists(), 'view']
```

## Fluxo Correto de Dados

```
                  CACHE GLOBAL (Source of Truth)
              [...queryKeys.deals.lists(), 'view']
                            |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
   useCreateDeal       useMoveDeal       useRealtimeSync
   (optimistic)        (optimistic)       (sync multi-tab)
        |                   |                   |
        +-------------------+-------------------+
                            |
                            v
                      useBoardDeals
                   (filtra client-side)
                            |
                            v
                        UI/Kanban
```

## Quando Usar Queries Filtradas no Servidor

Queries com filtros no servidor (`queryKeys.entity.list({ filter })`) são permitidas APENAS para:

1. **Paginação**: Quando a lista é muito grande para carregar toda (ex: contacts)
2. **Dashboards específicos**: Quando precisa de agregações server-side
3. **Relatórios**: Quando o filtro reduz significativamente o payload

**IMPORTANTE**: Essas queries filtradas são SEPARADAS da cache global e NAO devem ser usadas para optimistic updates.

## Checklist para Novas Features

Antes de fazer merge, verifique:

- [ ] A query principal usa a cache global (`lists()` ou `[...lists(), 'view']`)
- [ ] Optimistic updates escrevem na cache global
- [ ] Realtime sync escreve na cache global  
- [ ] Filtros são feitos client-side (useMemo) derivando da cache global
- [ ] Contexts NAO manipulam caches diferentes dos hooks
- [ ] `invalidateQueries` só é usado em último caso (preferir `setQueryData`)
- [ ] Não existe `queryKeys.entity.list({ filtro })` sendo usado para optimistic updates

## Debugging

Se um item "some" ou "aparece em outra aba mas não na original":

1. Verificar se todas as operações estão usando a MESMA query key
2. Usar React Query DevTools para inspecionar as caches existentes
3. Buscar por `queryKeys.*.list({` no código - provavelmente é uma cache separada

## 2025-12-24 - Kanban menu re-render blast radius
**Learning:** Um estado/prop global (ex.: `openActivityMenuId`) passado para *todos* os cards de uma lista grande amplia o “blast radius” de re-render: um clique no menu pode re-renderizar N cards sem necessidade.
**Action:** Para listas grandes, preferir props derivadas por-item (`isMenuOpen`) + `React.memo` e callbacks estáveis (useCallback) para limitar re-renders a O(1) componentes quando o estado muda.

## 2025-12-24 - O(S*N) em render no Kanban (filters/reduces por coluna)
**Learning:** Fazer `filteredDeals.filter(...)` e `reduce(...)` *dentro* do loop de colunas do Kanban cria custo O(S*N) por render e escala mal com muitos deals/estágios.
**Action:** Agrupar por `stageId` uma vez (useMemo) e ler por coluna; pré-calcular totais no mesmo passo para evitar trabalho repetido.

## 2025-12-24 - Analyzers com filter+sort por deal (O(D*A log A) escondido)
**Learning:** Nos analyzers de decisões, fazer `activities.filter(...).sort(...)` dentro do loop de deals gera um custo explosivo (O(D*A log A)) em bases maiores — e é fácil passar despercebido porque “funciona” com poucos dados.
**Action:** Sempre pré-indexar `activities` por `dealId` (e guardar o “latest” por timestamp) em uma passada O(A); depois o loop de deals vira O(D) com lookup O(1).

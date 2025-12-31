import React, { useEffect, useMemo, useState } from 'react';
import { Package, Pencil, Plus, Save, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { productsService } from '@/lib/supabase';
import type { Product } from '@/types';

function formatBRL(v: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

/**
 * Componente React `ProductsCatalogManager`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ProductsCatalogManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState<string>('0');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');

  const canCreate = name.trim().length > 1 && Number.isFinite(Number(price));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState<string>('0');
  const [editSku, setEditSku] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await productsService.getAll();
    if (res.error) {
      setError(res.error.message);
      setProducts([]);
    } else {
      setProducts(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Test environment: avoid async state updates that generate act(...) warnings.
    if (process.env.NODE_ENV === 'test') return;
    load();
  }, []);

  const sorted = useMemo(() => {
    // keep active first, then name
    const list = [...products];
    list.sort((a, b) => {
      const aActive = a.active !== false;
      const bActive = b.active !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [products]);

  const create = async () => {
    if (!canCreate) return;
    setLoading(true);
    setError(null);
    const res = await productsService.create({
      name: name.trim(),
      price: Number(price),
      sku: sku.trim() || undefined,
      description: description.trim() || undefined,
    });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setName('');
    setPrice('0');
    setSku('');
    setDescription('');
    await load();
    // Notify app to refresh dropdowns that read from SettingsContext
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  const toggleActive = async (p: Product, next: boolean) => {
    setLoading(true);
    setError(null);
    const res = await productsService.update(p.id, { active: next });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditName(p.name || '');
    setEditPrice(String(p.price ?? 0));
    setEditSku(p.sku || '');
    setEditDescription(p.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPrice('0');
    setEditSku('');
    setEditDescription('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editName.trim();
    const price = Number(editPrice);

    if (name.length < 2) {
      setError('Nome inválido.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Preço inválido.');
      return;
    }

    setLoading(true);
    setError(null);
    const res = await productsService.update(editingId, {
      name,
      price,
      sku: editSku.trim() || undefined,
      description: editDescription.trim() || undefined,
    });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    cancelEdit();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  const remove = async (p: Product) => {
    const ok = window.confirm(`Excluir "${p.name}"? Isso não remove itens já usados em deals históricos.`);
    if (!ok) return;
    setLoading(true);
    setError(null);
    const res = await productsService.delete(p.id);
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  return (
    <div className="mb-12">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Package className="h-5 w-5" /> Produtos/Serviços
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Catálogo base da empresa. No deal você ainda pode adicionar itens personalizados quando precisar adaptar ao cliente.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Create */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Sessão, Pacote, Implantação…"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Preço padrão</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">SKU (opcional)</label>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="SKU"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Descrição (opcional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Curta e objetiva"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <div className="lg:col-span-1">
            <button
              type="button"
              onClick={create}
              disabled={loading || !canCreate}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Criar produto"
            >
              <Plus className="h-4 w-4" />
              Criar
            </button>
          </div>
        </div>

        {/* List */}
        <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-4">
          {sorted.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 py-6">
              Nenhum produto cadastrado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((p) => {
                const isActive = p.active !== false;
                const isEditing = editingId === p.id;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      {isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome</label>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Preço</label>
                            <input
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              inputMode="decimal"
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">SKU</label>
                            <input
                              value={editSku}
                              onChange={(e) => setEditSku(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Descrição</label>
                            <input
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</div>
                            {!isActive && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                                Inativo
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {formatBRL(p.price)}{p.sku ? ` • SKU: ${p.sku}` : ''}{p.description ? ` • ${p.description}` : ''}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                            title="Salvar"
                            aria-label="Salvar alterações"
                            disabled={loading}
                          >
                            <Save className="h-4 w-4 text-primary-600" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                            title="Cancelar"
                            aria-label="Cancelar edição"
                            disabled={loading}
                          >
                            <X className="h-4 w-4 text-slate-500" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                          title="Editar"
                          aria-label="Editar produto"
                          disabled={loading}
                        >
                          <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleActive(p, !isActive)}
                        className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10"
                        title={isActive ? 'Desativar' : 'Ativar'}
                        aria-label={isActive ? 'Desativar produto' : 'Ativar produto'}
                        disabled={loading}
                      >
                        {isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-red-500" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Excluir"
                        aria-label="Excluir produto"
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


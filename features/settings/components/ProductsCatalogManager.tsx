import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Package,
  Pencil,
  Plus,
  Save,
  Star,
  Tag,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Eye,
  EyeOff,
  GripVertical,
  Upload,
  Loader2,
  Camera,
} from 'lucide-react';
import { productsService } from '@/lib/supabase';
import { productImagesService } from '@/lib/supabase/productImages';
import type { Product } from '@/types';

function formatBRL(v: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1';
const labelSmClass = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';
const btnIcon =
  'px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10';

/** Inline image upload component for product editing */
function ProductImageUpload({
  productId,
  currentUrl,
  onUploaded,
  onRemoved,
  disabled,
}: {
  productId: string;
  currentUrl: string;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Imagem muito grande. Máximo 5MB.');
      return;
    }
    setUploading(true);
    const { url, error } = await productImagesService.upload(productId, file);
    setUploading(false);
    if (error) {
      alert(`Erro no upload: ${error.message}`);
      return;
    }
    if (url) onUploaded(url);
  };

  return (
    <div className="flex items-center gap-2">
      {currentUrl ? (
        <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-white/10">
          <img src={currentUrl} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={onRemoved}
            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className={`${inputClass} flex items-center gap-2 cursor-pointer text-slate-500 dark:text-slate-400 hover:border-primary-400 transition-colors ${uploading ? 'opacity-50' : ''}`}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {uploading ? 'Enviando…' : currentUrl ? 'Trocar foto' : 'Enviar foto'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Clickable thumbnail that allows quick image upload from the product list */
function ThumbnailUpload({ product, onUploaded }: { product: Product; onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Imagem muito grande. Máximo 5MB.');
      return;
    }
    setUploading(true);
    const { url, error } = await productImagesService.upload(product.id, file);
    setUploading(false);
    if (error) {
      alert(`Erro no upload: ${error.message}`);
      return;
    }
    if (url) onUploaded(url);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-slate-200 dark:bg-white/10 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all group relative"
        title="Clique para enviar foto"
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 text-primary-500 animate-spin" />
        ) : product.imageUrl ? (
          <>
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-4 w-4 text-white" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <Camera className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-primary-500 transition-colors" />
            <span className="text-[8px] text-slate-400 group-hover:text-primary-500">Foto</span>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </>
  );
}

/**
 * Componente React `ProductsCatalogManager`.
 * Gerencia o catálogo de produtos/serviços com suporte a campos de cardápio digital.
 */
export const ProductsCatalogManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [price, setPrice] = useState<string>('0');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tags, setTags] = useState('');
  const [featured, setFeatured] = useState(false);

  const canCreate = name.trim().length > 1 && Number.isFinite(Number(price));

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState<string>('0');
  const [editSku, setEditSku] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editFeatured, setEditFeatured] = useState(false);

  // Filter
  const [filterCategory, setFilterCategory] = useState<string>('');

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
    if (process.env.NODE_ENV === 'test') return;
    load();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const sorted = useMemo(() => {
    let list = [...products];
    if (filterCategory) {
      list = list.filter((p) => p.category === filterCategory);
    }
    list.sort((a, b) => {
      const aActive = a.active !== false;
      const bActive = b.active !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aCat = a.category || '';
      const bCat = b.category || '';
      if (aCat !== bCat) return aCat.localeCompare(bCat);
      const aOrder = a.sortOrder ?? 0;
      const bOrder = b.sortOrder ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [products, filterCategory]);

  function parseTags(raw: string): string[] {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const notify = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:products-updated'));
  };

  const create = async () => {
    if (!canCreate) return;
    setLoading(true);
    setError(null);
    const res = await productsService.create({
      name: name.trim(),
      price: Number(price),
      sku: sku.trim() || undefined,
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      tags: parseTags(tags),
      featured,
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
    setCategory('');
    setImageUrl('');
    setTags('');
    setFeatured(false);
    await load();
    notify();
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
    notify();
  };

  const toggleAvailable = async (p: Product, next: boolean) => {
    setLoading(true);
    setError(null);
    const res = await productsService.update(p.id, { available: next });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    notify();
  };

  const toggleFeatured = async (p: Product, next: boolean) => {
    setLoading(true);
    setError(null);
    const res = await productsService.update(p.id, { featured: next });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    notify();
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditName(p.name || '');
    setEditPrice(String(p.price ?? 0));
    setEditSku(p.sku || '');
    setEditDescription(p.description || '');
    setEditCategory(p.category || '');
    setEditImageUrl(p.imageUrl || '');
    setEditTags((p.tags ?? []).join(', '));
    setEditFeatured(p.featured ?? false);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimName = editName.trim();
    const numPrice = Number(editPrice);

    if (trimName.length < 2) {
      setError('Nome inválido.');
      return;
    }
    if (!Number.isFinite(numPrice) || numPrice < 0) {
      setError('Preço inválido.');
      return;
    }

    setLoading(true);
    setError(null);
    const res = await productsService.update(editingId, {
      name: trimName,
      price: numPrice,
      sku: editSku.trim() || undefined,
      description: editDescription.trim() || undefined,
      category: editCategory.trim() || undefined,
      imageUrl: editImageUrl.trim() || undefined,
      tags: parseTags(editTags),
      featured: editFeatured,
    });
    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    await load();
    cancelEdit();
    notify();
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
    notify();
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

        {/* ── Create form ── */}
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-3">
              <label className={labelClass}>Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Sessão, Pacote, Implantação…"
                className={inputClass}
              />
            </div>
            <div className="lg:col-span-2">
              <label className={labelClass}>Preço padrão</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                className={inputClass}
              />
            </div>
            <div className="lg:col-span-2">
              <label className={labelClass}>Categoria</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex.: Entradas, Bebidas…"
                className={inputClass}
              />
            </div>
            <div className="lg:col-span-2">
              <label className={labelClass}>SKU (opcional)</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU"
                className={inputClass}
              />
            </div>
            <div className="lg:col-span-3">
              <label className={labelClass}>Descrição (opcional)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Curta e objetiva"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-4">
              <label className={labelClass}>Imagem (opcional)</label>
              <div className="flex items-center gap-2">
                {imageUrl ? (
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-white/10">
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ) : null}
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="URL ou use o upload ao editar"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="lg:col-span-4">
              <label className={labelClass}>Tags (separadas por vírgula)</label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="vegano, sem glúten, novidade…"
                className={inputClass}
              />
            </div>
            <div className="lg:col-span-2 flex items-end gap-3 pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <Star className="h-4 w-4" />
                Destaque
              </label>
            </div>
            <div className="lg:col-span-2 flex items-end">
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
        </div>

        {/* ── Filter by category ── */}
        {categories.length > 0 && (
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Filtrar:</span>
            <button
              type="button"
              onClick={() => setFilterCategory('')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !filterCategory
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20'
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat === filterCategory ? '' : cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterCategory === cat
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* ── List ── */}
        <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-4">
          {sorted.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 py-6">
              {filterCategory ? `Nenhum produto na categoria "${filterCategory}".` : 'Nenhum produto cadastrado ainda.'}
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((p) => {
                const isActive = p.active !== false;
                const isAvailable = p.available !== false;
                const isFeatured = p.featured === true;
                const isEditing = editingId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                      !isActive
                        ? 'border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-white/2 opacity-60'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/3'
                    }`}
                  >
                    {/* Thumbnail with quick upload */}
                    {!isEditing && (
                      <ThumbnailUpload
                        product={p}
                        onUploaded={async (url) => {
                          await productsService.update(p.id, { imageUrl: url });
                          await load();
                          notify();
                        }}
                      />
                    )}

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                            <div className="sm:col-span-4">
                              <label className={labelSmClass}>Nome</label>
                              <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelSmClass}>Preço</label>
                              <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} inputMode="decimal" className={inputClass} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelSmClass}>Categoria</label>
                              <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Categoria" className={inputClass} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelSmClass}>SKU</label>
                              <input value={editSku} onChange={(e) => setEditSku(e.target.value)} className={inputClass} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelSmClass}>Descrição</label>
                              <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className={inputClass} />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                            <div className="sm:col-span-4">
                              <label className={labelSmClass}>Imagem</label>
                              <ProductImageUpload
                                productId={editingId!}
                                currentUrl={editImageUrl}
                                onUploaded={(url) => setEditImageUrl(url)}
                                onRemoved={() => setEditImageUrl('')}
                                disabled={loading}
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <label className={labelSmClass}>Tags (separadas por vírgula)</label>
                              <input value={editTags} onChange={(e) => setEditTags(e.target.value)} className={inputClass} />
                            </div>
                            <div className="sm:col-span-2 flex items-end pb-1">
                              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={editFeatured}
                                  onChange={(e) => setEditFeatured(e.target.checked)}
                                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <Star className="h-4 w-4" />
                                Destaque
                              </label>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</span>
                            {isFeatured && (
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            )}
                            {!isActive && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                                Inativo
                              </span>
                            )}
                            {isActive && !isAvailable && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                                Esgotado
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {formatBRL(p.price)}
                            {p.category ? ` • ${p.category}` : ''}
                            {p.sku ? ` • SKU: ${p.sku}` : ''}
                            {p.description ? ` • ${p.description}` : ''}
                          </div>
                          {(p.tags ?? []).length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {(p.tags ?? []).map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                                >
                                  <Tag className="h-3 w-3" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 pt-1">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={saveEdit} className={btnIcon} title="Salvar" aria-label="Salvar alterações" disabled={loading}>
                            <Save className="h-4 w-4 text-primary-600" />
                          </button>
                          <button type="button" onClick={cancelEdit} className={btnIcon} title="Cancelar" aria-label="Cancelar edição" disabled={loading}>
                            <X className="h-4 w-4 text-slate-500" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(p)} className={btnIcon} title="Editar" aria-label="Editar produto" disabled={loading}>
                            <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFeatured(p, !isFeatured)}
                            className={btnIcon}
                            title={isFeatured ? 'Remover destaque' : 'Destacar'}
                            aria-label={isFeatured ? 'Remover destaque' : 'Destacar produto'}
                            disabled={loading}
                          >
                            <Star className={`h-4 w-4 ${isFeatured ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleAvailable(p, !isAvailable)}
                            className={btnIcon}
                            title={isAvailable ? 'Marcar esgotado' : 'Marcar disponível'}
                            aria-label={isAvailable ? 'Marcar esgotado' : 'Marcar disponível'}
                            disabled={loading}
                          >
                            {isAvailable ? <Eye className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4 text-orange-500" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(p, !isActive)}
                            className={btnIcon}
                            title={isActive ? 'Desativar' : 'Ativar'}
                            aria-label={isActive ? 'Desativar produto' : 'Ativar produto'}
                            disabled={loading}
                          >
                            {isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-red-500" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p)}
                            className={`${btnIcon} hover:!bg-red-50 dark:hover:!bg-red-900/20`}
                            title="Excluir"
                            aria-label="Excluir produto"
                            disabled={loading}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </>
                      )}
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

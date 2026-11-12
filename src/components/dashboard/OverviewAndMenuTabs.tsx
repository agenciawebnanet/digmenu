import React, { useState } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Plus,
  Edit2,
  EyeOff,
  Eye,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  Category,
  OrderRecord,
  Product,
  StoreSummary,
  SubscriptionRecord,
  SUBSCRIPTION_STATUS_LABELS,
  formatBRL,
  formatCentsForInput,
  parseBRLInputToCents,
  formatDateTimeBR,
} from '../../types';
import { apiRequest } from '../../lib/api';

interface OverviewTabProps {
  store: StoreSummary;
  products: Product[];
  orders: OrderRecord[];
  subscription: SubscriptionRecord | null;
  onNavigate: (path: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  store,
  products,
  orders,
  subscription,
  onNavigate,
}) => {
  const [copied, setCopied] = useState(false);

  const publicUrl = `${window.location.origin}/m/${store.slug}`;
  const activeProducts = products.filter((p) => p.is_available !== false);
  const hiddenProducts = products.filter((p) => p.is_available === false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard fallback
    }
  };

  const subMeta = subscription
    ? SUBSCRIPTION_STATUS_LABELS[subscription.status]
    : SUBSCRIPTION_STATUS_LABELS.pendente;

  const hasProducts = activeProducts.length > 0;
  const hasWhatsapp = Boolean(store.whatsappE164);

  return (
    <div className="space-y-6">
      {/* Caminho inicial obrigatório: Cadastrar produto -> Configurar WhatsApp -> Abrir cardápio */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
            Primeiros passos da loja
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Siga a sequência para deixar seu cardápio pronto para receber pedidos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/painel/cardapio')}
            className="p-4 rounded-xl border border-slate-200 hover:border-orange-300 bg-slate-50 text-left space-y-1.5 min-h-[44px] cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-orange-700">1. Cadastrar produto</span>
              {hasProducts && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            </div>
            <p className="text-xs text-slate-600">
              {hasProducts
                ? `${activeProducts.length} produto(s) ativo(s) no catálogo.`
                : 'Adicione seu primeiro item no cardápio.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/painel/configuracoes')}
            className="p-4 rounded-xl border border-slate-200 hover:border-orange-300 bg-slate-50 text-left space-y-1.5 min-h-[44px] cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-orange-700">2. Configurar WhatsApp</span>
              {hasWhatsapp && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            </div>
            <p className="text-xs text-slate-600">
              {hasWhatsapp
                ? `Número ativo: +${store.whatsappE164}`
                : 'Informe um WhatsApp com DDD válido.'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate(`/m/${store.slug}`)}
            className="p-4 rounded-xl border border-slate-200 hover:border-orange-300 bg-slate-50 text-left space-y-1.5 min-h-[44px] cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-orange-700">3. Abrir cardápio</span>
              <ExternalLink className="w-4 h-4 text-slate-500 shrink-0" />
            </div>
            <p className="text-xs text-slate-600 truncate font-mono">/m/{store.slug}</p>
          </button>
        </div>
      </section>

      {/* Link Público Copiável */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">Link público do cardápio</h2>
            <p className="text-xs text-slate-600">Compartilhe este endereço com seus clientes.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-800 inline-flex items-center gap-2 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Link copiado' : 'Copiar link'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate(`/m/${store.slug}`)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Abrir cardápio</span>
            </button>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 break-all">
          {publicUrl}
        </div>
      </section>

      {/* Status Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500">Status da loja</p>
          <p className="text-lg font-bold text-slate-900">{store.operationalStatus.badgeLabel}</p>
          <p className="text-xs text-slate-600 leading-snug">{store.operationalStatus.reason}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500">Produtos ativos</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {activeProducts.length}
          </p>
          <p className="text-xs text-slate-600">
            {hiddenProducts.length} oculto(s) no catálogo
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500">Pedidos registrados</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {orders.length}
          </p>
          <p className="text-xs text-slate-600">Preparados para o WhatsApp</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500">Assinatura anual</p>
          <div className="pt-0.5">
            <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg border ${subMeta.tone}`}>
              {subMeta.label}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/painel/assinatura')}
            className="text-xs text-orange-700 font-semibold hover:underline pt-1 cursor-pointer"
          >
            Gerenciar assinatura anual →
          </button>
        </div>
      </section>

      {/* Pedidos Recentes */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-slate-900">Pedidos recentes</h2>
          <button
            type="button"
            onClick={() => onNavigate('/painel/pedidos')}
            className="text-xs font-semibold text-orange-700 hover:underline min-h-[36px] cursor-pointer"
          >
            Ver histórico completo →
          </button>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">
            Nenhum pedido registrado ainda nesta loja. Faça um pedido pelo link público para testar.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.slice(0, 5).map((ord) => (
              <div key={ord.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    Pedido #{ord.order_number} · {ord.customer_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ord.fulfillment_type === 'delivery'
                      ? `Entrega (${ord.neighborhood_name || ''})`
                      : 'Retirada no local'}{' '}
                    · {formatDateTimeBR(ord.created_at)}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                    {formatBRL(ord.total_cents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

// ============================================================================
// MENU MANAGEMENT TAB (/painel/cardapio)
// ============================================================================
interface MenuTabProps {
  storeId: string;
  slug: string;
  categories: Category[];
  products: Product[];
  onRefresh: () => Promise<void>;
}

const DEMO_PHOTO_PRESETS = [
  { label: 'Pizza Margherita', url: '/images/dish_pizza_margherita.jpg' },
  { label: 'Pizza Calabresa', url: '/images/dish_pizza_calabresa.jpg' },
  { label: 'Smash Burger', url: '/images/dish_smash_burger.jpg' },
];

export const MenuTab: React.FC<MenuTabProps> = ({ storeId, slug, categories, products, onRefresh }) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [description, setDescription] = useState('');
  const [priceText, setPriceText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);

  const [savingProduct, setSavingProduct] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const openNewProduct = (defaultCategoryId?: string) => {
    setEditingProduct(null);
    setName('');
    setCategoryId(defaultCategoryId || categories[0]?.id || '');
    setDescription('');
    setPriceText('');
    setImageUrl('');
    setIsAvailable(true);
    setErrorMsg('');
    setModalOpen(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setCategoryId(product.category_id);
    setDescription(product.description);
    setPriceText(formatCentsForInput(product.price_cents));
    setImageUrl(product.image_url);
    setIsAvailable(product.is_available !== false);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setErrorMsg('');
    setCatSaving(true);
    try {
      await apiRequest(`/api/stores/${storeId}/categories`, {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      setNewCategoryName('');
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar categoria.');
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/stores/${storeId}/categories/${catId}`, { method: 'DELETE' });
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível excluir a categoria.');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const priceCents = parseBRLInputToCents(priceText);
    if (!categoryId) {
      setErrorMsg('Crie ou selecione uma categoria antes de salvar o produto.');
      return;
    }

    setSavingProduct(true);
    try {
      if (editingProduct) {
        await apiRequest(`/api/stores/${storeId}/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            categoryId,
            name: name.trim(),
            description: description.trim(),
            priceCents,
            imageUrl: imageUrl.trim(),
            isAvailable,
          }),
        });
      } else {
        await apiRequest(`/api/stores/${storeId}/products`, {
          method: 'POST',
          body: JSON.stringify({
            categoryId,
            name: name.trim(),
            description: description.trim(),
            priceCents,
            imageUrl: imageUrl.trim(),
            isAvailable,
          }),
        });
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar produto.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleVisibility = async (product: Product) => {
    setErrorMsg('');
    try {
      const nextState = product.is_available === false;
      await apiRequest(`/api/stores/${storeId}/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: nextState }),
      });
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao alterar visibilidade.');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/stores/${storeId}/products/${productId}`, { method: 'DELETE' });
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao excluir produto.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">Cardápio e produtos</h2>
          <p className="text-xs sm:text-sm text-slate-600">
            {products.length ? 'Organize os produtos e escolha quais aparecem no cardápio.' : 'Adicione um prato com nome, preço e foto para começar seu cardápio.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNewProduct()}
          className="min-h-[44px] px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{products.length ? "Novo produto" : "Adicionar primeiro produto"}</span>
        </button>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {products.some((product) => product.is_available) && (
        <a
          href={`/m/${slug}`}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-800"
        >
          Abrir meu cardápio público ↗
        </a>
      )}

      {/* Nova categoria */}
      <form
        onSubmit={handleAddCategory}
        className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
      >
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="Nova categoria (ex: Bebidas, Sobremesas...)"
          className="flex-1 min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
        />
        <button
          type="submit"
          disabled={catSaving || !newCategoryName.trim()}
          className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl whitespace-nowrap cursor-pointer"
        >
          {catSaving ? 'Salvando...' : 'Adicionar categoria'}
        </button>
      </form>

      {/* Categorias e produtos */}
      <div className="space-y-4">
        {categories.map((cat) => {
          const catProducts = products.filter((p) => p.category_id === cat.id);
          return (
            <section key={cat.id} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900">{cat.name}</h3>
                  <p className="text-xs text-slate-500">{catProducts.length} produto(s)</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openNewProduct(cat.id)}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
                  >
                    + Produto aqui
                  </button>
                  {catProducts.length === 0 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-xl text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      Excluir categoria
                    </button>
                  )}
                </div>
              </div>

              {catProducts.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Nenhum produto nesta categoria.</p>
              ) : (
                <div className="space-y-3">
                  {catProducts.map((product) => {
                    const visible = product.is_available !== false;
                    return (
                      <div
                        key={product.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          visible
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-slate-100/70 border-slate-200 opacity-75'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-200"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-slate-900">{product.name}</p>
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                                  visible
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-slate-200 text-slate-700 border-slate-300'
                                }`}
                              >
                                {visible ? 'Disponível' : 'Oculto'}
                              </span>
                            </div>
                            {product.description && (
                              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{product.description}</p>
                            )}
                            <p className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-1">
                              {formatBRL(product.price_cents)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditProduct(product)}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(product)}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            <span>{visible ? 'Ocultar' : 'Reativar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(product.id)}
                            aria-label={`Excluir ${product.name}`}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-xs font-semibold text-rose-700 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Excluir</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Product Form Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingProduct ? 'Editar produto' : 'Novo produto'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do produto *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Pizza Margherita Clássica"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria *</label>
                  <select
                    required
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-600"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Preço (R$) *</label>
                  <input
                    type="text"
                    required
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    placeholder="32,90"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ingredientes, tamanho ou observações..."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Foto opcional (URL ou imagem de exemplo)
                </label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="/images/dish_pizza_margherita.jpg"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {DEMO_PHOTO_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setImageUrl(preset.url)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="px-2.5 py-1 text-xs rounded-lg bg-rose-50 text-rose-700 cursor-pointer"
                    >
                      Sem foto
                    </button>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 min-h-[40px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-600"
                />
                <span>Visível e disponível no cardápio público</span>
              </label>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="flex-1 min-h-[44px] bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
                >
                  {savingProduct ? 'Salvando...' : 'Salvar produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

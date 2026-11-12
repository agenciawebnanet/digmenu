import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  ShoppingBag,
  Plus,
  Minus,
  X,
  MapPin,
  Clock,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Store as StoreIcon,
  ArrowLeft,
  UtensilsCrossed,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import {
  Category,
  DeliveryNeighborhood,
  OrderRecord,
  Product,
  StoreHour,
  StoreOperationalStatus,
  DAY_NAMES_PT,
  formatBRL,
} from '../types';

interface PublicStoreInfo {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
  pickupAddress: string;
  city: string;
  timezone: string;
  allowDelivery: boolean;
  allowPickup: boolean;
  hasValidWhatsapp: boolean;
  operationalStatus: StoreOperationalStatus;
}

interface PublicMenuResponse {
  store: PublicStoreInfo;
  categories: Category[];
  products: Product[];
  neighborhoods: DeliveryNeighborhood[];
  hours: StoreHour[];
}

interface CartItem {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  imageUrl: string;
}

interface PublicMenuPageProps {
  slug: string;
  onNavigate: (path: string) => void;
}

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const PublicMenuPage: React.FC<PublicMenuPageProps> = ({ slug, onNavigate }) => {
  const storageKey = `digmenu_cart_${slug}`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [menuData, setMenuData] = useState<PublicMenuResponse | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHoursModal, setShowHoursModal] = useState(false);

  // Zoomed product image modal
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string; title: string } | null>(null);

  // Cart persisted per store in localStorage
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  // Checkout drawer & form states
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('delivery');
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => makeUuid());
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [catalogChanges, setCatalogChanges] = useState<string[]>([]);
  const [completedOrder, setCompletedOrder] = useState<OrderRecord | null>(null);

  const loadMenu = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiRequest<PublicMenuResponse>(`/api/public/stores/${encodeURIComponent(slug)}`);
      setMenuData(data);

      // Set default fulfillment based on what store enables
      if (!data.store.allowDelivery && data.store.allowPickup) {
        setFulfillmentType('pickup');
      } else if (data.store.allowDelivery) {
        setFulfillmentType('delivery');
      }

      if (data.neighborhoods.length > 0 && !neighborhoodId) {
        setNeighborhoodId(data.neighborhoods[0].id);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Não foi possível carregar este cardápio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reload cart when slug changes
    try {
      const saved = localStorage.getItem(storageKey);
      setCart(saved ? (JSON.parse(saved) as CartItem[]) : []);
    } catch {
      setCart([]);
    }
    setCompletedOrder(null);
    setCheckoutError('');
    setCatalogChanges([]);
    setIdempotencyKey(makeUuid());
    loadMenu();
  }, [slug]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // ignore storage quota issues
    }
  }, [cart, storageKey]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedPhoto(null);
        setShowHoursModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, unitPriceCents: product.price_cents, name: product.name }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPriceCents: product.price_cents,
          quantity: 1,
          imageUrl: product.image_url,
        },
      ];
    });
    setIdempotencyKey(makeUuid());
    setCatalogChanges([]);
    setCheckoutError('');
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
    setIdempotencyKey(makeUuid());
    setCatalogChanges([]);
    setCheckoutError('');
  };

  const cartItemCount = useMemo(() => cart.reduce((acc, i) => acc + i.quantity, 0), [cart]);
  const subtotalCents = useMemo(
    () => cart.reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0),
    [cart]
  );

  const selectedNeighborhood = useMemo(() => {
    if (!menuData) return undefined;
    return menuData.neighborhoods.find((n) => n.id === neighborhoodId);
  }, [menuData, neighborhoodId]);

  const deliveryFeeCents =
    fulfillmentType === 'delivery' && selectedNeighborhood ? selectedNeighborhood.fee_cents : 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  const filteredProducts = useMemo(() => {
    if (!menuData) return [];
    return menuData.products.filter((p) => {
      const catOk = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
      const q = searchQuery.trim().toLowerCase();
      const searchOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      return catOk && searchOk;
    });
  }, [menuData, selectedCategoryId, searchQuery]);

  const handleReviewAfterCatalogChange = async () => {
    const fresh = await apiRequest<PublicMenuResponse>(`/api/public/stores/${encodeURIComponent(slug)}`);
    setMenuData(fresh);

    const productMap = new Map<string, Product>(fresh.products.map((p) => [p.id, p]));
    setCart((prev) =>
      prev
        .filter((item) => productMap.has(item.productId))
        .map((item) => {
          const p = productMap.get(item.productId)!;
          return {
            ...item,
            name: p.name,
            unitPriceCents: p.price_cents,
            imageUrl: p.image_url,
          };
        })
    );
    if (fresh.neighborhoods.length > 0 && !fresh.neighborhoods.some((n) => n.id === neighborhoodId)) {
      setNeighborhoodId(fresh.neighborhoods[0].id);
    }
    setIdempotencyKey(makeUuid());
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuData || submittingOrder) return;
    setCheckoutError('');
    setCatalogChanges([]);
    setSubmittingOrder(true);

    try {
      const payload = {
        idempotencyKey,
        customerName: customerName.trim(),
        fulfillmentType,
        neighborhoodId: fulfillmentType === 'delivery' ? neighborhoodId : undefined,
        deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress.trim() : undefined,
        notes: notes.trim(),
        expectedDeliveryFeeCents: fulfillmentType === 'delivery' ? deliveryFeeCents : 0,
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          expectedUnitPriceCents: c.unitPriceCents,
        })),
      };

      const res = await apiRequest<{ deduplicated: boolean; order: OrderRecord }>(
        `/api/public/stores/${encodeURIComponent(slug)}/orders`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      setCompletedOrder(res.order);
      setCart([]);
      localStorage.removeItem(storageKey);
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'CATALOG_CHANGED') {
        setCheckoutError(err.message);
        setCatalogChanges(err.changes || []);
        await handleReviewAfterCatalogChange();
      } else {
        setCheckoutError(err?.message || 'Não foi possível finalizar o pedido.');
        // Refresh store operational status in case it paused/closed
        loadMenu();
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  if (loading && !menuData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center mx-auto">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-slate-600">Carregando cardápio...</p>
        </div>
      </div>
    );
  }

  if (loadError || !menuData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
          <h1 className="font-display text-xl font-bold text-slate-900">Cardápio não encontrado</h1>
          <p className="text-sm text-slate-600">
            {loadError || `Não existe uma loja cadastrada no endereço /m/${slug}.`}
          </p>
          <button
            onClick={() => onNavigate('/')}
            className="w-full min-h-[44px] bg-slate-900 text-white text-sm font-semibold rounded-xl cursor-pointer"
          >
            Voltar ao início do DigMenu
          </button>
        </div>
      </div>
    );
  }

  const { store, categories, hours } = menuData;
  const op = store.operationalStatus;

  return (
    <div className="min-h-screen bg-[#f9f5ee] text-slate-900 pb-24 overflow-x-hidden">
      {/* Compact Store Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 hover:text-slate-900 rounded-xl shrink-0 cursor-pointer"
            aria-label="Voltar ao DigMenu"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-display text-sm sm:text-base font-bold text-slate-900 truncate min-w-0">
            {store.name}
          </span>
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border shrink-0 whitespace-nowrap ${
              op.canAcceptOrders
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {op.badgeLabel}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-5 pt-4 space-y-5">
        {/* Store Identity Card */}
        <section className="bg-white border border-orange-100 rounded-3xl overflow-hidden shadow-sm">
          {store.coverUrl ? (
            <div className="h-44 sm:h-64 bg-slate-200">
              <img
                src={store.coverUrl}
                alt={store.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div aria-hidden="true" className="h-24 sm:h-32 bg-gradient-to-br from-orange-800 via-orange-600 to-amber-400" />
          )}
          <div className="p-5 sm:p-6 space-y-3">
            <div className="flex items-start gap-3">
              {store.logoUrl ? (
                <img
                  src={store.logoUrl}
                  alt={`Logo ${store.name}`}
                  className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-orange-50 text-orange-700 border border-orange-200 flex items-center justify-center shrink-0">
                  <StoreIcon className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug break-words">
                  {store.name}
                </h1>
                {store.description && (
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5 leading-relaxed">
                    {store.description}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">
                  {[store.pickupAddress, store.city].filter(Boolean).join(' · ')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowHoursModal(true)}
                className="inline-flex items-center gap-1.5 text-orange-700 font-semibold hover:underline min-h-[36px] shrink-0 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Ver horários ({op.currentLocalTime})</span>
              </button>
            </div>
          </div>
        </section>

        {/* Store Closed / Paused / Expired Notice */}
        {!op.canAcceptOrders && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-bold">{op.badgeLabel}</p>
              <p className="text-xs sm:text-sm text-rose-800 leading-relaxed">{op.reason}</p>
            </div>
          </div>
        )}

        {/* Search & Category Filters */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar prato ou bebida..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-600"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  selectedCategoryId === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </section>

        {/* Product Catalog */}
        <section className="space-y-3">
          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
              {menuData?.products.length ? "Nenhum produto encontrado para sua busca." : "Este cardápio ainda está sendo preparado."}
            </div>
          ) : (
            filteredProducts.map((product) => {
              const inCart = cart.find((c) => c.productId === product.id);
              return (
                <article
                  key={product.id}
                  className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex items-stretch gap-3 min-w-0"
                >
                  {product.image_url ? (
                    <button
                      type="button"
                      onClick={() => setZoomedPhoto({ url: product.image_url, title: product.name })}
                      aria-label={`Ampliar foto de ${product.name}`}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-100 shrink-0 cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-orange-600"
                    >
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : null}

                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-snug break-words">
                        {product.name}
                      </h2>
                      {product.description && (
                        <p className="text-xs sm:text-sm text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-sm sm:text-base font-bold text-slate-900 font-mono tabular-nums">
                        {formatBRL(product.price_cents)}
                      </span>

                      {inCart ? (
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(product.id, -1)}
                            aria-label={`Remover uma unidade de ${product.name}`}
                            className="min-w-[36px] min-h-[36px] bg-white rounded-lg flex items-center justify-center text-slate-800 border border-slate-200 cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold font-mono tabular-nums">
                            {inCart.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(product.id, 1)}
                            aria-label={`Adicionar uma unidade de ${product.name}`}
                            className="min-w-[36px] min-h-[36px] bg-orange-600 text-white rounded-lg flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="min-h-[44px] px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Adicionar</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </main>

      {/* Sticky Bottom Cart Bar (fits under 15% mobile height) */}
      {(cartItemCount > 0 || completedOrder) && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 sm:px-5 py-2.5">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            {completedOrder ? (
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(true)}
                className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Ver pedido #{completedOrder.order_number} para WhatsApp</span>
              </button>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">
                    {cartItemCount} {cartItemCount === 1 ? 'item' : 'itens'} na sacola
                  </p>
                  <p className="text-sm sm:text-base font-bold text-slate-900 font-mono tabular-nums">
                    {formatBRL(subtotalCents)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCompletedOrder(null);
                    setIsCheckoutOpen(true);
                  }}
                  className="min-h-[44px] px-4 sm:px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Ver sacola</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Zoomed Photo Lightbox */}
      {zoomedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomedPhoto.title}
          onClick={() => setZoomedPhoto(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-900 truncate">{zoomedPhoto.title}</p>
              <button
                type="button"
                onClick={() => setZoomedPhoto(null)}
                aria-label="Fechar foto ampliada"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={zoomedPhoto.url}
              alt={zoomedPhoto.title}
              className="w-full max-h-[70vh] object-contain bg-slate-900"
            />
          </div>
        </div>
      )}

      {/* Opening Hours Modal */}
      {showHoursModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowHoursModal(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Horários de atendimento</h3>
              <button
                type="button"
                onClick={() => setShowHoursModal(false)}
                aria-label="Fechar horários"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2 text-xs sm:text-sm">
              {hours.map((h) => (
                <div
                  key={h.dayOfWeek}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0"
                >
                  <span className="font-medium text-slate-700">{DAY_NAMES_PT[h.dayOfWeek]}</span>
                  <span className="font-mono text-slate-900">
                    {h.isClosed ? 'Fechado' : `${h.openTime} – ${h.closeTime}`}
                  </span>
                </div>
              ))}
              <p className="text-xs text-slate-500 pt-2">Fuso horário: {store.timezone}</p>
            </div>
          </div>
        </div>
      )}

      {/* Cart & Checkout Drawer */}
      {isCheckoutOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center"
        >
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                {completedOrder ? `Pedido #${completedOrder.order_number} pronto` : 'Finalizar pedido'}
              </h2>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                aria-label="Fechar sacola"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {completedOrder ? (
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                  <p className="text-sm font-bold">Pedido preparado para WhatsApp</p>
                  <p className="text-xs leading-relaxed">
                    Seu pedido foi conferido no servidor e registrado na loja. Clique abaixo para confirmar o envio no WhatsApp.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-600">Mensagem gerada para o WhatsApp:</p>
                  <pre className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                    {completedOrder.whatsapp_message}
                  </pre>
                </div>

                <a
                  href={completedOrder.whatsapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Confirmar envio no WhatsApp</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setCompletedOrder(null);
                    setIsCheckoutOpen(false);
                  }}
                  className="w-full min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Voltar ao cardápio
                </button>
              </div>
            ) : (
              <form onSubmit={handleCheckoutSubmit} className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                  {!op.canAcceptOrders && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm">
                      <strong>{op.badgeLabel}:</strong> {op.reason}
                    </div>
                  )}

                  {checkoutError && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm space-y-1.5"
                    >
                      <p className="font-semibold">{checkoutError}</p>
                      {catalogChanges.length > 0 && (
                        <ul className="list-disc pl-4 space-y-1">
                          {catalogChanges.map((ch, idx) => (
                            <li key={idx}>{ch}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Cart Items */}
                  {cart.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">
                      Sua sacola está vazia.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {cart.map((item) => (
                        <div
                          key={item.productId}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                            <p className="text-xs text-slate-600 font-mono tabular-nums">
                              {formatBRL(item.unitPriceCents)} cada
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.productId, -1)}
                              className="min-w-[36px] min-h-[36px] bg-white border border-slate-200 rounded-lg flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold font-mono tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.productId, 1)}
                              className="min-w-[36px] min-h-[36px] bg-white border border-slate-200 rounded-lg flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {cart.length > 0 && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Seu nome *
                        </label>
                        <input
                          type="text"
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Como gostaria de ser chamado"
                          className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Modalidade *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {store.allowDelivery && (
                            <button
                              type="button"
                              onClick={() => setFulfillmentType('delivery')}
                              className={`min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors cursor-pointer ${
                                fulfillmentType === 'delivery'
                                  ? 'bg-orange-600 text-white border-orange-600'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              Entrega
                            </button>
                          )}
                          {store.allowPickup && (
                            <button
                              type="button"
                              onClick={() => setFulfillmentType('pickup')}
                              className={`min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors cursor-pointer ${
                                fulfillmentType === 'pickup'
                                  ? 'bg-orange-600 text-white border-orange-600'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              Retirada no local
                            </button>
                          )}
                        </div>
                      </div>

                      {fulfillmentType === 'delivery' ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              Bairro de entrega *
                            </label>
                            {menuData.neighborhoods.length === 0 ? (
                              <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200">
                                Esta loja ainda não cadastrou bairros para entrega.
                              </p>
                            ) : (
                              <select
                                required
                                value={neighborhoodId}
                                onChange={(e) => setNeighborhoodId(e.target.value)}
                                className="w-full min-h-[44px] px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-600"
                              >
                                {menuData.neighborhoods.map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.name} — {formatBRL(n.fee_cents)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              Endereço para entrega *
                            </label>
                            <input
                              type="text"
                              required
                              value={deliveryAddress}
                              onChange={(e) => setDeliveryAddress(e.target.value)}
                              placeholder="Rua, número, apto / ponto de referência"
                              className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm space-y-1">
                          <p className="font-semibold text-slate-800">Endereço para retirada:</p>
                          <p className="text-slate-600">
                            {store.pickupAddress} {store.city ? `— ${store.city}` : ''}
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Observações (opcional)
                        </label>
                        <textarea
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Ex: Sem cebola, troco para R$ 100..."
                          className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                        />
                      </div>
                    </>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 space-y-3">
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span className="font-mono tabular-nums">{formatBRL(subtotalCents)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>
                          {fulfillmentType === 'delivery'
                            ? `Entrega (${selectedNeighborhood?.name || 'selecione'})`
                            : 'Retirada no local'}
                        </span>
                        <span className="font-mono tabular-nums">{formatBRL(deliveryFeeCents)}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                        <span>Total</span>
                        <span className="font-mono tabular-nums text-orange-700">{formatBRL(totalCents)}</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        submittingOrder ||
                        !op.canAcceptOrders ||
                        (fulfillmentType === 'delivery' && menuData.neighborhoods.length === 0)
                      }
                      className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      {submittingOrder ? 'Conferindo pedido...' : 'Enviar pedido pelo WhatsApp'}
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

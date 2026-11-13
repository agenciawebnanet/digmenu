import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  User,
  QrCode,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import { useStoreSocket } from '../lib/useStoreSocket';
import {
  Category,
  CustomerAccount,
  DeliveryNeighborhood,
  FulfillmentType,
  OrderRecord,
  PlatformConfig,
  Product,
  ProductAddon,
  ProductSize,
  StoreHour,
  StoreOperationalStatus,
  StoreTable,
  DAY_NAMES_PT,
  FULFILLMENT_LABELS,
  formatBRL,
} from '../types';
import { CustomerAccountModal } from './CustomerAccountModal';

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
  allowTable: boolean;
  allowCounter: boolean;
  hasValidWhatsapp: boolean;
  operationalStatus: StoreOperationalStatus;
}

interface PublicMenuResponse {
  store: PublicStoreInfo;
  categories: Category[];
  products: Product[];
  neighborhoods: DeliveryNeighborhood[];
  tables: StoreTable[];
  hours: StoreHour[];
}

interface CartItem {
  variantKey: string;
  productId: string;
  name: string;
  selectedSize?: ProductSize | null;
  selectedAddons: ProductAddon[];
  unitPriceCents: number;
  quantity: number;
  imageUrl: string;
}

interface PublicMenuPageProps {
  slug: string;
  config: PlatformConfig | null;
  onNavigate: (path: string) => void;
}

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildVariantKey(productId: string, sizeId?: string, addonIds: string[] = []): string {
  return `${productId}::${sizeId || ''}::${[...addonIds].sort().join(',')}`;
}

export const PublicMenuPage: React.FC<PublicMenuPageProps> = ({ slug, config, onNavigate }) => {
  const storageKey = `digmenu_cart_v3_${slug}`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [menuData, setMenuData] = useState<PublicMenuResponse | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHoursModal, setShowHoursModal] = useState(false);

  // Product customization modal (sizes + addons)
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [modalSizeId, setModalSizeId] = useState<string>('');
  const [modalAddonIds, setModalAddonIds] = useState<string[]>([]);
  const [modalQty, setModalQty] = useState<number>(1);

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
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [detectedTableCode, setDetectedTableCode] = useState<string>('');
  const [neighborhoodId, setNeighborhoodId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => makeUuid());
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [catalogChanges, setCatalogChanges] = useState<string[]>([]);
  const [completedOrder, setCompletedOrder] = useState<OrderRecord | null>(null);

  // Individual customer account state
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const loadMenu = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError('');
      try {
        const data = await apiRequest<PublicMenuResponse>(`/api/public/stores/${encodeURIComponent(slug)}`);
        setMenuData(data);

        // Read ?mesa=CODE from URL on first load
        const urlParams = new URLSearchParams(window.location.search);
        const mesaParam = (urlParams.get('mesa') || '').trim().toLowerCase();
        const matchedTable = mesaParam
          ? data.tables.find((t) => t.table_code.toLowerCase() === mesaParam)
          : undefined;

        if (matchedTable && data.store.allowTable) {
          setDetectedTableCode(matchedTable.table_code);
          setSelectedTableId(matchedTable.id);
          setFulfillmentType('table');
        } else if (!silent) {
          if (data.store.allowDelivery) setFulfillmentType('delivery');
          else if (data.store.allowPickup) setFulfillmentType('pickup');
          else if (data.store.allowTable) setFulfillmentType('table');
          else if (data.store.allowCounter) setFulfillmentType('counter');
        }

        if (data.tables.length > 0 && !selectedTableId && !matchedTable) {
          setSelectedTableId(data.tables[0].id);
        }
        if (data.neighborhoods.length > 0 && !neighborhoodId) {
          setNeighborhoodId(data.neighborhoods[0].id);
        }
      } catch (err: any) {
        if (!silent) {
          setLoadError(err?.message || 'Não foi possível carregar este cardápio.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug, neighborhoodId, selectedTableId]
  );

  useEffect(() => {
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
    loadMenu(false);
  }, [slug]);

  useStoreSocket({
    slug,
    onEvent: (evt) => {
      if (evt.type === 'menu:updated' || evt.type === 'store:updated') {
        loadMenu(true);
      }
    },
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // ignore storage quota issues
    }
  }, [cart, storageKey]);

  useEffect(() => {
    apiRequest<{ customer: CustomerAccount }>('/api/customer/me')
      .then((res) => {
        setCustomer(res.customer);
        setCustomerName((prev) => prev || res.customer.name);
        setDeliveryAddress((prev) => prev || res.customer.defaultAddress || '');
      })
      .catch(() => {
        setCustomer(null);
      });
  }, []);

  const handleCustomerChange = (nextCustomer: CustomerAccount | null) => {
    setCustomer(nextCustomer);
    if (nextCustomer) {
      setCustomerName((prev) => prev || nextCustomer.name);
      setDeliveryAddress((prev) => prev || nextCustomer.defaultAddress || '');
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedPhoto(null);
        setShowHoursModal(false);
        setShowCustomerModal(false);
        setCustomizingProduct(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openProductOrAdd = (product: Product) => {
    const hasVariants = (product.sizes && product.sizes.length > 0) || (product.addons && product.addons.length > 0);
    if (hasVariants) {
      setCustomizingProduct(product);
      setModalSizeId(product.sizes?.[0]?.id || '');
      setModalAddonIds([]);
      setModalQty(1);
      return;
    }

    const variantKey = buildVariantKey(product.id);
    setCart((prev) => {
      const existing = prev.find((item) => item.variantKey === variantKey);
      if (existing) {
        return prev.map((item) =>
          item.variantKey === variantKey
            ? { ...item, quantity: item.quantity + 1, unitPriceCents: product.price_cents, name: product.name }
            : item
        );
      }
      return [
        ...prev,
        {
          variantKey,
          productId: product.id,
          name: product.name,
          selectedSize: null,
          selectedAddons: [],
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

  const confirmCustomProductAdd = () => {
    if (!customizingProduct) return;
    const chosenSize =
      customizingProduct.sizes?.find((s) => s.id === modalSizeId) || customizingProduct.sizes?.[0] || null;
    const chosenAddons = (customizingProduct.addons || []).filter((a) => modalAddonIds.includes(a.id));
    const baseCents = chosenSize ? chosenSize.priceCents : customizingProduct.price_cents;
    const addonsCents = chosenAddons.reduce((acc, a) => acc + a.priceCents, 0);
    const unitPriceCents = baseCents + addonsCents;
    const variantKey = buildVariantKey(
      customizingProduct.id,
      chosenSize?.id,
      chosenAddons.map((a) => a.id)
    );

    setCart((prev) => {
      const existing = prev.find((item) => item.variantKey === variantKey);
      if (existing) {
        return prev.map((item) =>
          item.variantKey === variantKey
            ? { ...item, quantity: item.quantity + modalQty, unitPriceCents }
            : item
        );
      }
      return [
        ...prev,
        {
          variantKey,
          productId: customizingProduct.id,
          name: customizingProduct.name,
          selectedSize: chosenSize,
          selectedAddons: chosenAddons,
          unitPriceCents,
          quantity: modalQty,
          imageUrl: customizingProduct.image_url,
        },
      ];
    });

    setCustomizingProduct(null);
    setIdempotencyKey(makeUuid());
    setCatalogChanges([]);
    setCheckoutError('');
  };

  const updateCartQuantity = (variantKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.variantKey === variantKey ? { ...item, quantity: item.quantity + delta } : item))
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

  const selectedTable = useMemo(() => {
    if (!menuData) return undefined;
    return menuData.tables.find((t) => t.id === selectedTableId);
  }, [menuData, selectedTableId]);

  const deliveryFeeCents =
    fulfillmentType === 'delivery' && selectedNeighborhood ? selectedNeighborhood.fee_cents : 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  const filteredProducts = useMemo(() => {
    if (!menuData) return [];
    return menuData.products.filter((p) => {
      const catOk = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
      const q = searchQuery.trim().toLowerCase();
      const searchOk =
        !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
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
          const nextSize = item.selectedSize
            ? p.sizes.find((s) => s.id === item.selectedSize?.id) || p.sizes[0] || null
            : p.sizes[0] || null;
          const nextAddons = item.selectedAddons
            .map((a) => p.addons.find((pa) => pa.id === a.id))
            .filter(Boolean) as ProductAddon[];
          const base = nextSize ? nextSize.priceCents : p.price_cents;
          const addTotal = nextAddons.reduce((acc, a) => acc + a.priceCents, 0);
          return {
            ...item,
            name: p.name,
            selectedSize: nextSize,
            selectedAddons: nextAddons,
            unitPriceCents: base + addTotal,
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
        tableId: fulfillmentType === 'table' ? selectedTableId : undefined,
        neighborhoodId: fulfillmentType === 'delivery' ? neighborhoodId : undefined,
        deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress.trim() : undefined,
        notes: notes.trim(),
        expectedDeliveryFeeCents: fulfillmentType === 'delivery' ? deliveryFeeCents : 0,
        items: cart.map((c) => ({
          productId: c.productId,
          selectedSizeId: c.selectedSize?.id,
          selectedAddonIds: c.selectedAddons.map((a) => a.id),
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
        loadMenu(true);
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

  const { store, categories, hours, tables } = menuData;
  const op = store.operationalStatus;

  const modalSize = customizingProduct?.sizes?.find((s) => s.id === modalSizeId) || customizingProduct?.sizes?.[0];
  const modalBaseCents = modalSize ? modalSize.priceCents : customizingProduct?.price_cents || 0;
  const modalAddonsCents = (customizingProduct?.addons || [])
    .filter((a) => modalAddonIds.includes(a.id))
    .reduce((acc, a) => acc + a.priceCents, 0);
  const modalTotalCents = (modalBaseCents + modalAddonsCents) * modalQty;

  const availableModes: Array<{ key: FulfillmentType; label: string }> = [];
  if (store.allowDelivery) availableModes.push({ key: 'delivery', label: 'Entrega' });
  if (store.allowPickup) availableModes.push({ key: 'pickup', label: 'Retirada' });
  if (store.allowTable && tables.length > 0) availableModes.push({ key: 'table', label: 'Na mesa' });
  if (store.allowCounter) availableModes.push({ key: 'counter', label: 'Balcão' });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 overflow-x-hidden">
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
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`px-2 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                op.canAcceptOrders
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {op.badgeLabel}
            </span>
            <button
              type="button"
              onClick={() => setShowCustomerModal(true)}
              aria-label={customer ? `Conta de ${customer.name}` : 'Entrar como cliente'}
              className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <User className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span className="max-w-[72px] sm:max-w-[120px] truncate">
                {customer ? customer.name.split(' ')[0] : 'Entrar'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-5 pt-4 space-y-5">
        {detectedTableCode && selectedTable && (
          <div className="p-3.5 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <QrCode className="w-5 h-5 text-orange-700 shrink-0" />
              <p className="text-xs sm:text-sm font-semibold text-orange-950 truncate">
                Atendimento via QR Code: <strong>{selectedTable.label}</strong>
              </p>
            </div>
            <span className="text-xs font-semibold text-orange-800 shrink-0">Pedido na mesa</span>
          </div>
        )}

        {/* Store Identity Card */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {store.coverUrl && (
            <div className="h-36 sm:h-48 bg-slate-200">
              <img src={store.coverUrl} alt={store.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4 sm:p-5 space-y-3">
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
                <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 leading-snug">
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
                  {store.pickupAddress} {store.city ? `· ${store.city}` : ''}
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
              Nenhum produto disponível encontrado para sua busca.
            </div>
          ) : (
            filteredProducts.map((product) => {
              const hasVariants =
                (product.sizes && product.sizes.length > 0) ||
                (product.addons && product.addons.length > 0);
              const simpleVariantKey = buildVariantKey(product.id);
              const simpleCartItem = !hasVariants
                ? cart.find((c) => c.variantKey === simpleVariantKey)
                : undefined;
              const productCartQty = cart
                .filter((c) => c.productId === product.id)
                .reduce((acc, c) => acc + c.quantity, 0);

              const minPriceCents =
                product.sizes && product.sizes.length > 0
                  ? Math.min(...product.sizes.map((s) => s.priceCents))
                  : product.price_cents;

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
                      {hasVariants && (
                        <p className="text-[11px] font-medium text-orange-700 mt-1">
                          {product.sizes.length > 0 ? `${product.sizes.length} tamanhos` : ''}
                          {product.sizes.length > 0 && product.addons.length > 0 ? ' · ' : ''}
                          {product.addons.length > 0 ? `${product.addons.length} adicionais` : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-sm sm:text-base font-bold text-slate-900 font-mono tabular-nums">
                        {product.sizes && product.sizes.length > 0 ? `A partir de ${formatBRL(minPriceCents)}` : formatBRL(minPriceCents)}
                      </span>

                      {simpleCartItem ? (
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(simpleVariantKey, -1)}
                            aria-label={`Remover uma unidade de ${product.name}`}
                            className="min-w-[36px] min-h-[36px] bg-white rounded-lg flex items-center justify-center text-slate-800 border border-slate-200 cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold font-mono tabular-nums">
                            {simpleCartItem.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(simpleVariantKey, 1)}
                            aria-label={`Adicionar uma unidade de ${product.name}`}
                            className="min-w-[36px] min-h-[36px] bg-orange-600 text-white rounded-lg flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openProductOrAdd(product)}
                          className="min-h-[44px] px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>
                            {hasVariants
                              ? productCartQty > 0
                                ? `Escolher (${productCartQty})`
                                : 'Escolher'
                              : 'Adicionar'}
                          </span>
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

      {/* Sticky Bottom Cart Bar */}
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

      {/* Product Sizes & Addons Modal */}
      {customizingProduct && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setCustomizingProduct(null)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-bold text-slate-900 truncate">
                {customizingProduct.name}
              </h2>
              <button
                type="button"
                onClick={() => setCustomizingProduct(null)}
                aria-label="Fechar opções do produto"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
              {customizingProduct.description && (
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {customizingProduct.description}
                </p>
              )}

              {customizingProduct.sizes && customizingProduct.sizes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Escolha o tamanho *
                  </p>
                  <div className="space-y-2">
                    {customizingProduct.sizes.map((size) => {
                      const active = (modalSize?.id || '') === size.id;
                      return (
                        <label
                          key={size.id}
                          className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            active
                              ? 'border-orange-600 bg-orange-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              name="product-size"
                              checked={active}
                              onChange={() => setModalSizeId(size.id)}
                              className="w-4 h-4 accent-orange-600"
                            />
                            <span className="text-sm font-semibold text-slate-900">{size.name}</span>
                          </div>
                          <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                            {formatBRL(size.priceCents)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {customizingProduct.addons && customizingProduct.addons.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Adicionais opcionais
                  </p>
                  <div className="space-y-2">
                    {customizingProduct.addons.map((addon) => {
                      const checked = modalAddonIds.includes(addon.id);
                      return (
                        <label
                          key={addon.id}
                          className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            checked
                              ? 'border-orange-600 bg-orange-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setModalAddonIds((prev) => [...prev, addon.id]);
                                } else {
                                  setModalAddonIds((prev) => prev.filter((id) => id !== addon.id));
                                }
                              }}
                              className="w-4 h-4 accent-orange-600 rounded"
                            />
                            <span className="text-sm font-medium text-slate-900">{addon.name}</span>
                          </div>
                          <span className="text-sm font-semibold font-mono tabular-nums text-emerald-700">
                            + {formatBRL(addon.priceCents)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                  className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-7 text-center text-sm font-bold font-mono tabular-nums">{modalQty}</span>
                <button
                  type="button"
                  onClick={() => setModalQty((q) => Math.min(99, q + 1))}
                  className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={confirmCustomProductAdd}
                className="flex-1 min-h-[44px] bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl flex items-center justify-between px-4 cursor-pointer"
              >
                <span>Adicionar à sacola</span>
                <span className="font-mono tabular-nums">{formatBRL(modalTotalCents)}</span>
              </button>
            </div>
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
                  <p className="text-sm font-bold">Pedido registrado no sistema e pronto para WhatsApp</p>
                  <p className="text-xs leading-relaxed">
                    Seu pedido foi conferido no servidor e enviado ao painel do restaurante. Clique abaixo para enviar a confirmação pelo WhatsApp.
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

                  {cart.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">Sua sacola está vazia.</p>
                  ) : (
                    <div className="space-y-2">
                      {cart.map((item) => (
                        <div
                          key={item.variantKey}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {item.name}
                              {item.selectedSize ? ` (${item.selectedSize.name})` : ''}
                            </p>
                            {item.selectedAddons.length > 0 && (
                              <p className="text-xs text-slate-500 truncate">
                                + {item.selectedAddons.map((a) => a.name).join(', ')}
                              </p>
                            )}
                            <p className="text-xs text-slate-600 font-mono tabular-nums mt-0.5">
                              {formatBRL(item.unitPriceCents)} cada
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.variantKey, -1)}
                              className="min-w-[36px] min-h-[36px] bg-white border border-slate-200 rounded-lg flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold font-mono tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.variantKey, 1)}
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
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                        {customer ? (
                          <span className="text-slate-700 truncate">
                            Conectado como <strong>{customer.name}</strong> (pedido salvo em sua conta)
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            Pedido rápido ou entre na sua conta individual
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowCustomerModal(true)}
                          className="text-orange-700 font-semibold hover:underline shrink-0 cursor-pointer"
                        >
                          {customer ? 'Ver conta' : 'Entrar'}
                        </button>
                      </div>

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
                          {availableModes.map((mode) => (
                            <button
                              key={mode.key}
                              type="button"
                              onClick={() => setFulfillmentType(mode.key)}
                              className={`min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors cursor-pointer ${
                                fulfillmentType === mode.key
                                  ? 'bg-orange-600 text-white border-orange-600'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {fulfillmentType === 'delivery' && (
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
                      )}

                      {fulfillmentType === 'table' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Selecione a mesa *
                          </label>
                          <select
                            required
                            value={selectedTableId}
                            onChange={(e) => setSelectedTableId(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-600"
                          >
                            {tables.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label} ({t.seats} lugares)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {(fulfillmentType === 'pickup' || fulfillmentType === 'counter') && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm space-y-1">
                          <p className="font-semibold text-slate-800">
                            {fulfillmentType === 'counter'
                              ? 'Retirada no balcão (consumo presencial):'
                              : 'Endereço para retirada:'}
                          </p>
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
                            : fulfillmentType === 'table'
                            ? `Consumo (${selectedTable?.label || 'Mesa'})`
                            : FULFILLMENT_LABELS[fulfillmentType]}
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

      {/* Individual Customer Account Modal (Separated from Merchant Stores) */}
      <CustomerAccountModal
        isOpen={showCustomerModal}
        storeName={store.name}
        storeSlug={slug}
        config={config}
        customer={customer}
        onClose={() => setShowCustomerModal(false)}
        onCustomerChange={handleCustomerChange}
      />
    </div>
  );
};

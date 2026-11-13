import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  ChefHat,
  Clock,
  Printer,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Utensils,
  ShoppingBag,
  AlertCircle,
} from 'lucide-react';
import {
  Category,
  FULFILLMENT_LABELS,
  ORDER_STATUS_META,
  OrderRecord,
  OrderStatus,
  Product,
  ProductAddon,
  ProductSize,
  StoreSummary,
  StoreTable,
  formatBRL,
} from '../../types';
import { apiRequest } from '../../lib/api';
import { printOrderTicket } from '../../lib/print';
import { playNewOrderChime, unlockAudioContext } from '../../lib/sound';

// ============================================================================
// KITCHEN DISPLAY SYSTEM (/painel/cozinha)
// ============================================================================
interface KitchenTabProps {
  store: StoreSummary;
  orders: OrderRecord[];
  soundOn: boolean;
  onToggleSound: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

const KDS_LANES: Array<{
  status: 'novo' | 'aceito' | 'em_preparo' | 'pronto';
  title: string;
  nextStatus: OrderStatus;
  nextLabel: string;
  accent: string;
}> = [
  {
    status: 'novo',
    title: 'Novos pedidos',
    nextStatus: 'aceito',
    nextLabel: 'Aceitar pedido',
    accent: 'border-amber-300 bg-amber-50/50',
  },
  {
    status: 'aceito',
    title: 'Aceitos',
    nextStatus: 'em_preparo',
    nextLabel: 'Iniciar preparo',
    accent: 'border-blue-300 bg-blue-50/40',
  },
  {
    status: 'em_preparo',
    title: 'Em preparo',
    nextStatus: 'pronto',
    nextLabel: 'Marcar pronto',
    accent: 'border-indigo-300 bg-indigo-50/40',
  },
  {
    status: 'pronto',
    title: 'Prontos para entrega',
    nextStatus: 'concluido',
    nextLabel: 'Concluir',
    accent: 'border-emerald-300 bg-emerald-50/40',
  },
];

function formatElapsed(createdIso: string, nowMs: number): string {
  const diffMin = Math.max(0, Math.floor((nowMs - new Date(createdIso).getTime()) / 60000));
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}h ${m}m`;
}

export const KitchenTab: React.FC<KitchenTabProps> = ({
  store,
  orders,
  soundOn,
  onToggleSound,
  onRefresh,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const handleAdvance = async (orderId: string, nextStatus: OrderStatus) => {
    setBusyOrderId(orderId);
    setErrorMsg('');
    try {
      await apiRequest(`/api/stores/${store.id}/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao atualizar status na cozinha.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleTestBell = async () => {
    await unlockAudioContext();
    await playNewOrderChime();
  };

  const activeKitchenOrders = orders.filter((o) =>
    ['novo', 'aceito', 'em_preparo', 'pronto'].includes(o.status)
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-orange-600" />
            <span>Cozinha ao vivo (KDS)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            {activeKitchenOrders.length} pedido(s) ativo(s) na fila. Atualização em tempo real e impressão térmica 80mm pelo navegador.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleSound}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border cursor-pointer ${
              soundOn
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
            }`}
          >
            {soundOn ? <Bell className="w-4 h-4 text-emerald-600" /> : <BellOff className="w-4 h-4" />}
            <span>{soundOn ? 'Som ativo' : 'Ativar som'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestBell}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
          >
            Testar campainha
          </button>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {KDS_LANES.map((lane) => {
          const laneOrders = orders
            .filter((o) => o.status === lane.status)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          return (
            <section
              key={lane.status}
              className={`rounded-2xl border p-3.5 space-y-3 min-h-[260px] ${lane.accent}`}
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                <h3 className="text-sm font-bold text-slate-900">{lane.title}</h3>
                <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-mono font-bold text-slate-800">
                  {laneOrders.length}
                </span>
              </div>

              {laneOrders.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">Nenhum pedido nesta etapa.</p>
              ) : (
                <div className="space-y-3">
                  {laneOrders.map((ord) => (
                    <article
                      key={ord.id}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-extrabold text-slate-900">
                            #{ord.order_number} · {ord.customer_name}
                          </p>
                          <p className="text-[11px] font-semibold text-slate-600">
                            {FULFILLMENT_LABELS[ord.fulfillment_type]}
                            {ord.table_label ? ` — ${ord.table_label}` : ''}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                          <Clock className="w-3 h-3" />
                          {formatElapsed(ord.created_at, nowMs)}
                        </span>
                      </div>

                      <div className="space-y-1.5 border-t border-slate-100 pt-2">
                        {ord.items.map((item) => (
                          <div key={item.id} className="text-xs">
                            <p className="font-semibold text-slate-900">
                              {item.quantity}× {item.product_name_snapshot}
                              {item.selectedSize ? ` (${item.selectedSize.name})` : ''}
                            </p>
                            {item.selectedAddons && item.selectedAddons.length > 0 && (
                              <p className="text-[11px] text-slate-600 pl-3">
                                + {item.selectedAddons.map((a) => a.name).join(', ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      {ord.notes && (
                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950 font-medium">
                          OBS: {ord.notes}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyOrderId === ord.id}
                          onClick={() => handleAdvance(ord.id, lane.nextStatus)}
                          className="flex-1 min-h-[38px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                        >
                          {busyOrderId === ord.id ? 'Atualizando...' : lane.nextLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => printOrderTicket(ord, store, 'kitchen')}
                          aria-label={`Imprimir comanda #${ord.order_number}`}
                          title="Imprimir comanda na cozinha"
                          className="min-h-[38px] min-w-[38px] px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-pointer"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// WAITER / TABLE INTERFACE (/painel/garcom)
// ============================================================================
interface WaiterTabProps {
  store: StoreSummary;
  tables: StoreTable[];
  categories: Category[];
  products: Product[];
  orders: OrderRecord[];
  onRefresh: () => Promise<void>;
  onNavigate: (path: string) => void;
}

interface WaiterCartItem {
  variantKey: string;
  product: Product;
  selectedSize: ProductSize | null;
  selectedAddons: ProductAddon[];
  unitPriceCents: number;
  quantity: number;
}

export const WaiterTab: React.FC<WaiterTabProps> = ({
  store,
  tables,
  categories,
  products,
  orders,
  onRefresh,
  onNavigate,
}) => {
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.id || 'counter');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<WaiterCartItem[]>([]);

  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [chosenSizeId, setChosenSizeId] = useState('');
  const [chosenAddonIds, setChosenAddonIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (tables.length > 0 && selectedTableId !== 'counter' && !tables.some((t) => t.id === selectedTableId)) {
      setSelectedTableId(tables[0].id);
    }
  }, [tables, selectedTableId]);

  const activeProducts = products.filter((p) => p.is_available !== false);

  const openTableOrders = (tableId: string) =>
    orders.filter(
      (o) =>
        o.table_id === tableId &&
        o.status !== 'cancelado' &&
        (o.status !== 'concluido' || o.payment_status !== 'paid')
    );

  const selectedTable = tables.find((t) => t.id === selectedTableId) || null;
  const activeOrdersForSelection = selectedTable
    ? openTableOrders(selectedTable.id)
    : orders.filter(
        (o) => o.fulfillment_type === 'counter' && o.status !== 'cancelado' && o.payment_status !== 'paid'
      );

  const addItemToWaiterCart = (
    product: Product,
    size: ProductSize | null,
    addons: ProductAddon[]
  ) => {
    const baseCents = size ? size.priceCents : product.price_cents;
    const addonsCents = addons.reduce((acc, a) => acc + a.priceCents, 0);
    const unitPriceCents = baseCents + addonsCents;
    const variantKey = `${product.id}::${size?.id || ''}::${addons
      .map((a) => a.id)
      .sort()
      .join(',')}`;

    setCart((prev) => {
      const existing = prev.find((it) => it.variantKey === variantKey);
      if (existing) {
        return prev.map((it) =>
          it.variantKey === variantKey ? { ...it, quantity: it.quantity + 1 } : it
        );
      }
      return [
        ...prev,
        {
          variantKey,
          product,
          selectedSize: size,
          selectedAddons: addons,
          unitPriceCents,
          quantity: 1,
        },
      ];
    });
  };

  const handleProductPick = (product: Product) => {
    if ((product.sizes && product.sizes.length > 0) || (product.addons && product.addons.length > 0)) {
      setCustomizingProduct(product);
      setChosenSizeId(product.sizes?.[0]?.id || '');
      setChosenAddonIds([]);
      return;
    }
    addItemToWaiterCart(product, null, []);
  };

  const handleConfirmCustom = () => {
    if (!customizingProduct) return;
    const size =
      customizingProduct.sizes?.find((s) => s.id === chosenSizeId) ||
      customizingProduct.sizes?.[0] ||
      null;
    const addons = (customizingProduct.addons || []).filter((a) => chosenAddonIds.includes(a.id));
    addItemToWaiterCart(customizingProduct, size, addons);
    setCustomizingProduct(null);
  };

  const updateCartQty = (variantKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((it) =>
          it.variantKey === variantKey ? { ...it, quantity: it.quantity + delta } : it
        )
        .filter((it) => it.quantity > 0)
    );
  };

  const cartTotalCents = cart.reduce((acc, it) => acc + it.unitPriceCents * it.quantity, 0);

  const handleSendToKitchen = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const isCounter = selectedTableId === 'counter' || !selectedTable;
      const res = await apiRequest<{ order: OrderRecord }>(`/api/stores/${store.id}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: `waiter-${crypto.randomUUID()}`,
          source: 'waiter',
          fulfillmentType: isCounter ? 'counter' : 'table',
          tableId: isCounter ? undefined : selectedTable!.id,
          customerName:
            customerName.trim() || (isCounter ? 'Cliente Balcão' : selectedTable!.label),
          notes: notes.trim(),
          initialStatus: 'novo',
          items: cart.map((it) => ({
            productId: it.product.id,
            quantity: it.quantity,
            selectedSizeId: it.selectedSize?.id,
            selectedAddonIds: it.selectedAddons.map((a) => a.id),
          })),
        }),
      });
      setCart([]);
      setCustomerName('');
      setNotes('');
      await onRefresh();
      setFeedback(`Pedido #${res.order.order_number} enviado para a cozinha!`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao lançar pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDelivered = async (orderId: string) => {
    try {
      await apiRequest(`/api/stores/${store.id}/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'concluido' }),
      });
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao concluir pedido.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <Utensils className="w-5 h-5 text-orange-600" />
          <span>Atendimento de Garçom e Mesas</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-600">
          Selecione uma mesa, lance itens direto para a cozinha (KDS) ou acompanhe comandas abertas.
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid de Mesas + Balcão */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {tables.map((t) => {
          const tableOpen = openTableOrders(t.id);
          const openTotal = tableOpen.reduce((acc, o) => acc + o.total_cents, 0);
          const selected = selectedTableId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTableId(t.id)}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                selected
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : tableOpen.length > 0
                  ? 'bg-amber-50 border-amber-300 text-slate-900 hover:bg-amber-100'
                  : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50'
              }`}
            >
              <p className="text-sm font-bold truncate">{t.label}</p>
              <p className={`text-[11px] mt-0.5 ${selected ? 'text-orange-100' : 'text-slate-600'}`}>
                {tableOpen.length > 0
                  ? `${tableOpen.length} aberta(s) · ${formatBRL(openTotal)}`
                  : `Livre (${t.seats} lug.)`}
              </p>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setSelectedTableId('counter')}
          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
            selectedTableId === 'counter'
              ? 'bg-slate-900 border-slate-900 text-white'
              : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50'
          }`}
        >
          <p className="text-sm font-bold">Balcão</p>
          <p className={`text-[11px] mt-0.5 ${selectedTableId === 'counter' ? 'text-slate-300' : 'text-slate-500'}`}>
            Atendimento rápido
          </p>
        </button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Catálogo */}
        <div className="lg:col-span-7 space-y-4">
          {categories.map((cat) => {
            const catProducts = activeProducts.filter((p) => p.category_id === cat.id);
            if (catProducts.length === 0) return null;
            return (
              <section key={cat.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">{cat.name}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {catProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductPick(product)}
                      className="p-3 rounded-xl border border-slate-200 hover:border-orange-400 bg-slate-50 text-left flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{product.name}</p>
                        <p className="text-xs font-mono font-semibold text-orange-700 mt-0.5">
                          {product.sizes?.length > 0
                            ? `A partir de ${formatBRL(Math.min(...product.sizes.map((s) => s.priceCents)))}`
                            : formatBRL(product.price_cents)}
                        </p>
                      </div>
                      <span className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center shrink-0">
                        <Plus className="w-4 h-4" />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Comanda atual + pedidos abertos da mesa */}
        <div className="lg:col-span-5 space-y-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-orange-600" />
                <span>
                  Lançar para {selectedTable ? selectedTable.label : 'Balcão'}
                </span>
              </h3>
              {cart.length > 0 && (
                <span className="text-sm font-mono font-bold text-slate-900">
                  {formatBRL(cartTotalCents)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente (opcional)"
                className="min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-slate-300"
              />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observação para a cozinha"
                className="min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-slate-300"
              />
            </div>

            {cart.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Toque nos produtos ao lado para montar o lançamento.
              </p>
            ) : (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                {cart.map((it) => (
                  <div key={it.variantKey} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {it.product.name}
                        {it.selectedSize ? ` (${it.selectedSize.name})` : ''}
                      </p>
                      {it.selectedAddons.length > 0 && (
                        <p className="text-[11px] text-slate-500 truncate">
                          + {it.selectedAddons.map((a) => a.name).join(', ')}
                        </p>
                      )}
                      <p className="font-mono text-slate-600">
                        {formatBRL(it.unitPriceCents * it.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateCartQty(it.variantKey, -1)}
                        className="w-7 h-7 rounded-lg border border-slate-300 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-mono font-bold">{it.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(it.variantKey, 1)}
                        className="w-7 h-7 rounded-lg border border-slate-300 flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCartQty(it.variantKey, -it.quantity)}
                        className="w-7 h-7 rounded-lg text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSendToKitchen}
                  className="w-full min-h-[44px] mt-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Enviando para cozinha...' : `Enviar para cozinha · ${formatBRL(cartTotalCents)}`}
                </button>
              </div>
            )}
          </section>

          {/* Pedidos em aberto da mesa */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Comandas abertas ({selectedTable ? selectedTable.label : 'Balcão'})
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('/painel/pdv')}
                className="text-xs font-semibold text-orange-700 hover:underline cursor-pointer"
              >
                Receber no PDV →
              </button>
            </div>

            {activeOrdersForSelection.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma comanda pendente nesta seleção.</p>
            ) : (
              <div className="space-y-2.5">
                {activeOrdersForSelection.map((ord) => {
                  const stMeta = ORDER_STATUS_META[ord.status] || ORDER_STATUS_META.novo;
                  return (
                    <div key={ord.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          #{ord.order_number} · {ord.customer_name}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-900">
                          {formatBRL(ord.total_cents)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${stMeta.tone}`}>
                          {stMeta.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {ord.status !== 'concluido' && (
                            <button
                              type="button"
                              onClick={() => handleMarkDelivered(ord.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Entregue
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onNavigate('/painel/pdv')}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Fechar conta
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modal Tamanhos/Adicionais para Garçom */}
      {customizingProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {customizingProduct.name}
              </h3>
              <button
                type="button"
                onClick={() => setCustomizingProduct(null)}
                className="min-w-[36px] min-h-[36px] rounded-xl hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              {customizingProduct.sizes?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-slate-600">Escolha o tamanho</p>
                  {customizingProduct.sizes.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 cursor-pointer"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="radio"
                          name="waiterSize"
                          checked={chosenSizeId === s.id}
                          onChange={() => setChosenSizeId(s.id)}
                          className="accent-orange-600"
                        />
                        {s.name}
                      </span>
                      <span className="font-mono text-sm font-bold">{formatBRL(s.priceCents)}</span>
                    </label>
                  ))}
                </div>
              )}

              {customizingProduct.addons?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-slate-600">Adicionais</p>
                  {customizingProduct.addons.map((a) => {
                    const checked = chosenAddonIds.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 cursor-pointer"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setChosenAddonIds((prev) =>
                                checked ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                              )
                            }
                            className="accent-orange-600"
                          />
                          {a.name}
                        </span>
                        <span className="font-mono text-xs font-bold">+ {formatBRL(a.priceCents)}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmCustom}
                className="w-full min-h-[44px] bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
              >
                Adicionar ao lançamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

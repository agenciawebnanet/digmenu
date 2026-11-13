import React, { useEffect, useState, useCallback } from 'react';
import {
  Calculator,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Printer,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Download,
  Plus,
  Minus,
} from 'lucide-react';
import {
  CashRegisterState,
  FULFILLMENT_LABELS,
  ORDER_STATUS_META,
  OrderRecord,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  Product,
  ProductAddon,
  ProductSize,
  StoreReportData,
  StoreSummary,
  StoreTable,
  formatBRL,
  formatDateTimeBR,
  parseBRLInputToCents,
} from '../../types';
import { apiRequest } from '../../lib/api';
import { printOrderTicket } from '../../lib/print';

// ============================================================================
// POS & CASH REGISTER TAB (/painel/pdv)
// ============================================================================
interface PosCashTabProps {
  store: StoreSummary;
  cashRegister: CashRegisterState | null;
  orders: OrderRecord[];
  products: Product[];
  tables: StoreTable[];
  onRefresh: () => Promise<void>;
}

const PAY_OPTIONS: Array<{ value: Exclude<PaymentMethod, 'whatsapp'>; label: string }> = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
];

export const PosCashTab: React.FC<PosCashTabProps> = ({
  store,
  cashRegister,
  orders,
  products,
  tables,
  onRefresh,
}) => {
  const [openingInput, setOpeningInput] = useState('100,00');
  const [openingNotes, setOpeningNotes] = useState('');
  const [closingInput, setClosingInput] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  const [movType, setMovType] = useState<'suprimento' | 'sangria'>('suprimento');
  const [movAmountInput, setMovAmountInput] = useState('20,00');
  const [movDescription, setMovDescription] = useState('');

  // Recebimento de pedido pendente
  const pendingOrders = orders.filter(
    (o) => o.payment_status !== 'paid' && o.status !== 'cancelado'
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string>(pendingOrders[0]?.id || '');
  const [settleMethod, setSettleMethod] = useState<Exclude<PaymentMethod, 'whatsapp'>>('dinheiro');
  const [receivedCashInput, setReceivedCashInput] = useState('');

  // Venda direta rápida (balcão/mesa no PDV)
  const [posMode, setPosMode] = useState<'receive' | 'quick_sale'>('receive');
  const [quickCart, setQuickCart] = useState<
    Array<{
      variantKey: string;
      product: Product;
      selectedSize: ProductSize | null;
      selectedAddons: ProductAddon[];
      unitPriceCents: number;
      quantity: number;
    }>
  >([]);
  const [quickCustomer, setQuickCustomer] = useState('');
  const [quickFulfillment, setQuickFulfillment] = useState<'counter' | 'table'>('counter');
  const [quickTableId, setQuickTableId] = useState(tables[0]?.id || '');
  const [quickPayMethod, setQuickPayMethod] = useState<Exclude<PaymentMethod, 'whatsapp'>>('pix');

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (pendingOrders.length > 0 && !pendingOrders.some((o) => o.id === selectedOrderId)) {
      setSelectedOrderId(pendingOrders[0].id);
    }
  }, [pendingOrders, selectedOrderId]);

  const selectedOrder = pendingOrders.find((o) => o.id === selectedOrderId) || null;
  const openReg = cashRegister?.openRegister || null;

  const receivedCents = receivedCashInput
    ? parseBRLInputToCents(receivedCashInput)
    : selectedOrder?.total_cents || 0;
  const trocoCents =
    settleMethod === 'dinheiro' && selectedOrder
      ? Math.max(0, receivedCents - selectedOrder.total_cents)
      : 0;

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      await apiRequest(`/api/stores/${store.id}/cash-register/open`, {
        method: 'POST',
        body: JSON.stringify({
          openingBalanceCents: parseBRLInputToCents(openingInput),
          notes: openingNotes.trim(),
        }),
      });
      setOpeningNotes('');
      await onRefresh();
      setFeedback('Caixa aberto com sucesso.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao abrir caixa.');
    } finally {
      setBusy(false);
    }
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      await apiRequest(`/api/stores/${store.id}/cash-register/movement`, {
        method: 'POST',
        body: JSON.stringify({
          type: movType,
          amountCents: parseBRLInputToCents(movAmountInput),
          description: movDescription.trim(),
        }),
      });
      setMovDescription('');
      await onRefresh();
      setFeedback(movType === 'suprimento' ? 'Suprimento registrado.' : 'Sangria registrada.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao registrar movimentação.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const actualCents = closingInput
        ? parseBRLInputToCents(closingInput)
        : cashRegister?.expectedCashCents || 0;
      await apiRequest(`/api/stores/${store.id}/cash-register/close`, {
        method: 'POST',
        body: JSON.stringify({
          actualClosingCents: actualCents,
          notes: closingNotes.trim(),
        }),
      });
      setClosingInput('');
      setClosingNotes('');
      await onRefresh();
      setFeedback('Caixa fechado e conferência gravada.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao fechar caixa.');
    } finally {
      setBusy(false);
    }
  };

  const handleSettleOrder = async (printAfter: boolean) => {
    if (!selectedOrder) return;
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const paidCents =
        settleMethod === 'dinheiro' && receivedCashInput
          ? Math.max(selectedOrder.total_cents, parseBRLInputToCents(receivedCashInput))
          : selectedOrder.total_cents;
      const res = await apiRequest<{ order: OrderRecord }>(
        `/api/stores/${store.id}/orders/${selectedOrder.id}/pay`,
        {
          method: 'POST',
          body: JSON.stringify({
            paymentMethod: settleMethod,
            paidCents,
            changeForCents: settleMethod === 'dinheiro' ? paidCents : 0,
            completeOrder: true,
          }),
        }
      );
      setReceivedCashInput('');
      await onRefresh();
      setFeedback(`Pedido #${res.order.order_number} recebido (${PAYMENT_METHOD_LABELS[settleMethod]}).`);
      if (printAfter) {
        printOrderTicket(res.order, store, 'receipt');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao receber pagamento.');
    } finally {
      setBusy(false);
    }
  };

  const addQuickProduct = (product: Product) => {
    const firstSize = product.sizes?.[0] || null;
    const unitPriceCents = firstSize ? firstSize.priceCents : product.price_cents;
    const variantKey = `${product.id}::${firstSize?.id || ''}::`;
    setQuickCart((prev) => {
      const found = prev.find((i) => i.variantKey === variantKey);
      if (found) {
        return prev.map((i) => (i.variantKey === variantKey ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          variantKey,
          product,
          selectedSize: firstSize,
          selectedAddons: [],
          unitPriceCents,
          quantity: 1,
        },
      ];
    });
  };

  const quickTotalCents = quickCart.reduce((acc, it) => acc + it.unitPriceCents * it.quantity, 0);

  const handleQuickSale = async (printAfter: boolean) => {
    if (quickCart.length === 0) return;
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await apiRequest<{ order: OrderRecord }>(`/api/stores/${store.id}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: `pos-${crypto.randomUUID()}`,
          source: 'pos',
          fulfillmentType: quickFulfillment,
          tableId: quickFulfillment === 'table' ? quickTableId : undefined,
          customerName: quickCustomer.trim() || 'Venda Rápida PDV',
          paymentMethod: quickPayMethod,
          markPaid: true,
          paidCents: quickTotalCents,
          initialStatus: 'concluido',
          items: quickCart.map((it) => ({
            productId: it.product.id,
            quantity: it.quantity,
            selectedSizeId: it.selectedSize?.id,
          })),
        }),
      });
      setQuickCart([]);
      setQuickCustomer('');
      await onRefresh();
      setFeedback(`Venda #${res.order.order_number} finalizada no PDV!`);
      if (printAfter) printOrderTicket(res.order, store, 'receipt');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao registrar venda no PDV.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-orange-600" />
          <span>PDV e Controle de Caixa</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-600">
          Abra/feche o caixa diário, registre suprimentos ou sangrias, receba pedidos e emita cupons 80mm pelo navegador.
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

      {/* Sessão de Caixa */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-orange-600" />
            <h3 className="font-display text-base font-bold text-slate-900">
              {openReg ? 'Caixa aberto' : 'Caixa fechado'}
            </h3>
          </div>
          {openReg && (
            <span className="text-xs text-slate-500">
              Aberto por {openReg.opened_by_name} em {formatDateTimeBR(openReg.opened_at)}
            </span>
          )}
        </div>

        {!openReg ? (
          <form onSubmit={handleOpenRegister} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Fundo de troco inicial (R$)
              </label>
              <input
                type="text"
                required
                value={openingInput}
                onChange={(e) => setOpeningInput(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-300"
              />
            </div>
            <div className="sm:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Observação</label>
              <input
                type="text"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                placeholder="Ex: Turno noite"
                className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="sm:col-span-3 min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
            >
              Abrir caixa
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Saldo inicial</p>
                <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                  {formatBRL(cashRegister!.summary.openingBalanceCents)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Dinheiro</p>
                <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                  {formatBRL(cashRegister!.summary.cashSalesCents)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Pix</p>
                <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                  {formatBRL(cashRegister!.summary.pixSalesCents)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Cartão</p>
                <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                  {formatBRL(cashRegister!.summary.cardSalesCents)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Supr. / Sangria</p>
                <p className="font-mono font-bold text-sm text-slate-900 mt-1">
                  +{formatBRL(cashRegister!.summary.suprimentoCents)} / -{formatBRL(cashRegister!.summary.sangriaCents)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-emerald-800 font-semibold">Esperado em gaveta</p>
                <p className="font-mono font-extrabold text-sm text-emerald-950 mt-1">
                  {formatBRL(cashRegister!.expectedCashCents)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Suprimento / Sangria */}
              <form onSubmit={handleMovement} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-800 uppercase">Movimentação manual</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMovType('suprimento')}
                    className={`flex-1 min-h-[38px] rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 border cursor-pointer ${
                      movType === 'suprimento'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    <span>Suprimento</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovType('sangria')}
                    className={`flex-1 min-h-[38px] rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 border cursor-pointer ${
                      movType === 'sangria'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    <ArrowDownCircle className="w-4 h-4" />
                    <span>Sangria</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={movAmountInput}
                    onChange={(e) => setMovAmountInput(e.target.value)}
                    placeholder="Valor (R$)"
                    className="w-28 min-h-[40px] px-3 py-1.5 text-sm font-mono rounded-xl border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    value={movDescription}
                    onChange={(e) => setMovDescription(e.target.value)}
                    placeholder="Motivo (ex: Troco ou pagamento fornecedor)"
                    className="flex-1 min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                  >
                    Lançar
                  </button>
                </div>
              </form>

              {/* Fechar caixa */}
              <form onSubmit={handleCloseRegister} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-800 uppercase">Fechamento de caixa</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={closingInput}
                    onChange={(e) => setClosingInput(e.target.value)}
                    placeholder={`Valor contado (${formatBRL(cashRegister!.expectedCashCents)})`}
                    className="sm:w-48 min-h-[40px] px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="Observações de fechamento"
                    className="flex-1 min-h-[40px] px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Fechar caixa
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* Operação PDV: Receber pendentes OU Venda Rápida */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setPosMode('receive')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
              posMode === 'receive'
                ? 'bg-orange-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Receber pedido em aberto ({pendingOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setPosMode('quick_sale')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
              posMode === 'quick_sale'
                ? 'bg-orange-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Nova venda rápida (Balcão / Mesa)
          </button>
        </div>

        {posMode === 'receive' ? (
          pendingOrders.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">Nenhum pedido aguardando pagamento.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-5 space-y-2 max-h-96 overflow-y-auto">
                {pendingOrders.map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => setSelectedOrderId(ord.id)}
                    className={`w-full text-left p-3.5 rounded-xl border cursor-pointer ${
                      selectedOrder?.id === ord.id
                        ? 'bg-orange-50 border-orange-400'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">
                        #{ord.order_number} · {ord.customer_name}
                      </span>
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {formatBRL(ord.total_cents)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {FULFILLMENT_LABELS[ord.fulfillment_type]}
                      {ord.table_label ? ` — ${ord.table_label}` : ''} · {ORDER_STATUS_META[ord.status]?.label}
                    </p>
                  </button>
                ))}
              </div>

              {selectedOrder && (
                <div className="lg:col-span-7 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-base font-bold text-slate-900">
                        Pedido #{selectedOrder.order_number} · {selectedOrder.customer_name}
                      </p>
                      <p className="text-xs text-slate-600">
                        {selectedOrder.items.length} item(ns) · {FULFILLMENT_LABELS[selectedOrder.fulfillment_type]}
                      </p>
                    </div>
                    <p className="text-xl font-mono font-extrabold text-slate-900">
                      {formatBRL(selectedOrder.total_cents)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PAY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSettleMethod(opt.value)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                          settleMethod === opt.value
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-white border-slate-300 text-slate-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {settleMethod === 'dinheiro' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Valor entregue em dinheiro (R$)
                        </label>
                        <input
                          type="text"
                          value={receivedCashInput}
                          onChange={(e) => setReceivedCashInput(e.target.value)}
                          placeholder={formatBRL(selectedOrder.total_cents)}
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono rounded-lg border border-slate-300"
                        />
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-xs text-slate-500">Troco a devolver</span>
                        <span className="text-lg font-mono font-bold text-emerald-700">
                          {formatBRL(trocoCents)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSettleOrder(false)}
                      className="flex-1 min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
                    >
                      Confirmar pagamento
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSettleOrder(true)}
                      className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Receber e imprimir</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto">
              {products
                .filter((p) => p.is_available !== false)
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addQuickProduct(product)}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:border-orange-400 text-left flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{product.name}</p>
                      <p className="text-xs font-mono font-semibold text-orange-700">
                        {formatBRL(product.sizes?.[0]?.priceCents ?? product.price_cents)}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-orange-600 shrink-0" />
                  </button>
                ))}
            </div>

            <div className="lg:col-span-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={quickFulfillment}
                  onChange={(e) => setQuickFulfillment(e.target.value as 'counter' | 'table')}
                  className="min-h-[40px] px-2.5 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="counter">Balcão</option>
                  <option value="table">Mesa</option>
                </select>
                {quickFulfillment === 'table' ? (
                  <select
                    value={quickTableId}
                    onChange={(e) => setQuickTableId(e.target.value)}
                    className="min-h-[40px] px-2.5 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={quickCustomer}
                    onChange={(e) => setQuickCustomer(e.target.value)}
                    placeholder="Nome (opcional)"
                    className="min-h-[40px] px-3 text-xs rounded-xl border border-slate-300 bg-white"
                  />
                )}
              </div>

              {quickCart.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Selecione itens ao lado.</p>
              ) : (
                <div className="space-y-2">
                  {quickCart.map((it) => (
                    <div key={it.variantKey} className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium">
                        {it.quantity}× {it.product.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setQuickCart((prev) =>
                              prev
                                .map((x) =>
                                  x.variantKey === it.variantKey ? { ...x, quantity: x.quantity - 1 } : x
                                )
                                .filter((x) => x.quantity > 0)
                            )
                          }
                          className="w-6 h-6 rounded border bg-white flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-bold">{formatBRL(it.unitPriceCents * it.quantity)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <select
                value={quickPayMethod}
                onChange={(e) => setQuickPayMethod(e.target.value as Exclude<PaymentMethod, 'whatsapp'>)}
                className="w-full min-h-[40px] px-3 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
              >
                {PAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || quickCart.length === 0}
                  onClick={() => handleQuickSale(false)}
                  className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Finalizar {formatBRL(quickTotalCents)}
                </button>
                <button
                  type="button"
                  disabled={busy || quickCart.length === 0}
                  onClick={() => handleQuickSale(true)}
                  className="min-h-[44px] px-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cupom</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Histórico recente de caixas fechados */}
      {cashRegister && cashRegister.recentClosed.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-display text-base font-bold text-slate-900">Últimos caixas fechados</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-3">Fechamento</th>
                  <th className="py-2 pr-3">Responsável</th>
                  <th className="py-2 pr-3">Esperado</th>
                  <th className="py-2 pr-3">Contado</th>
                  <th className="py-2">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashRegister.recentClosed.map((reg) => (
                  <tr key={reg.id}>
                    <td className="py-2 pr-3 font-mono">{formatDateTimeBR(reg.closed_at)}</td>
                    <td className="py-2 pr-3">{reg.closed_by_name || reg.opened_by_name}</td>
                    <td className="py-2 pr-3 font-mono">{formatBRL(reg.expected_closing_cents)}</td>
                    <td className="py-2 pr-3 font-mono">{formatBRL(reg.actual_closing_cents || 0)}</td>
                    <td
                      className={`py-2 font-mono font-bold ${
                        (reg.difference_cents || 0) < 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatBRL(reg.difference_cents || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

// ============================================================================
// REAL REPORTS TAB (/painel/relatorios)
// ============================================================================
interface ReportsTabProps {
  store: StoreSummary;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ store }) => {
  const [days, setDays] = useState<7 | 30 | 90 | 365>(30);
  const [report, setReport] = useState<StoreReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await apiRequest<StoreReportData>(`/api/stores/${store.id}/reports?days=${days}`);
      setReport(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível carregar os relatórios.');
    } finally {
      setLoading(false);
    }
  }, [store.id, days]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleExportCsv = () => {
    if (!report) return;
    const rows: string[] = [
      'Data;Pedidos;Receita (R$)',
      ...report.dailySeries.map(
        (d) => `${d.date};${d.orderCount};${(d.revenueCents / 100).toFixed(2).replace('.', ',')}`
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${store.slug}-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxDailyRevenue = Math.max(
    1,
    ...(report?.dailySeries.map((d) => d.revenueCents) || [1])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-600" />
            <span>Relatórios financeiros e operacionais</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Indicadores calculados em tempo real a partir dos pedidos e movimentações de caixa desta loja.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {([7, 30, 90, 365] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                days === d
                  ? 'bg-orange-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {d === 365 ? '12 meses' : `${d} dias`}
            </button>
          ))}
          {report && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">
          {errorMsg}
        </div>
      )}

      {loading && !report ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          Calculando indicadores reais da loja...
        </div>
      ) : report ? (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
              <p className="text-xs font-semibold text-slate-500">Faturamento bruto</p>
              <p className="text-2xl font-bold font-mono text-slate-900">
                {formatBRL(report.grossRevenueCents)}
              </p>
              <p className="text-xs text-slate-500">{report.validOrders} pedido(s) válido(s)</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
              <p className="text-xs font-semibold text-slate-500">Recebido no caixa</p>
              <p className="text-2xl font-bold font-mono text-emerald-700">
                {formatBRL(report.paidRevenueCents)}
              </p>
              <p className="text-xs text-slate-500">
                A receber: {formatBRL(report.pendingPaymentCents)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
              <p className="text-xs font-semibold text-slate-500">Ticket médio</p>
              <p className="text-2xl font-bold font-mono text-slate-900">
                {formatBRL(report.averageTicketCents)}
              </p>
              <p className="text-xs text-slate-500">{report.cancelledOrders} cancelado(s)</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
              <p className="text-xs font-semibold text-slate-500">Movimentos de caixa</p>
              <p className="text-sm font-mono font-bold text-slate-900 pt-1">
                +{formatBRL(report.cashSummary.suprimentoCents)} / -{formatBRL(report.cashSummary.sangriaCents)}
              </p>
              <p className="text-xs text-slate-500">
                {report.cashSummary.registersClosedCount} caixa(s) fechado(s)
              </p>
            </div>
          </section>

          {/* Série diária */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">Evolução diária</h3>
            {report.dailySeries.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum pedido registrado no período selecionado.</p>
            ) : (
              <div className="space-y-2">
                {report.dailySeries.map((day) => (
                  <div key={day.date} className="flex items-center gap-3 text-xs">
                    <span className="w-24 font-mono text-slate-600 shrink-0">{day.date}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-md"
                        style={{
                          width: `${Math.max(4, Math.round((day.revenueCents / maxDailyRevenue) * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="w-16 text-right text-slate-600 shrink-0">{day.orderCount} ped.</span>
                    <span className="w-24 text-right font-mono font-bold text-slate-900 shrink-0">
                      {formatBRL(day.revenueCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Produtos mais vendidos */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-slate-900">Produtos mais vendidos</h3>
              {report.topProducts.length === 0 ? (
                <p className="text-xs text-slate-500">Sem vendas registradas no período.</p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {report.topProducts.map((item) => (
                    <div key={item.name} className="py-2 flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 truncate">{item.name}</span>
                      <div className="flex items-center gap-3 shrink-0 font-mono">
                        <span className="text-slate-600">{item.quantitySold} un.</span>
                        <span className="font-bold text-slate-900">{formatBRL(item.revenueCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Modalidade & Formas de pagamento */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 mb-2">Por modalidade</h3>
                {report.byFulfillment.length === 0 ? (
                  <p className="text-xs text-slate-500">Sem dados no período.</p>
                ) : (
                  <div className="space-y-1.5 text-xs sm:text-sm">
                    {report.byFulfillment.map((f) => (
                      <div key={f.fulfillmentType} className="flex items-center justify-between">
                        <span className="text-slate-700">
                          {FULFILLMENT_LABELS[f.fulfillmentType] || f.fulfillmentType} ({f.count})
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatBRL(f.revenueCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <h3 className="font-display text-base font-bold text-slate-900 mb-2">Por pagamento</h3>
                {report.byPaymentMethod.length === 0 ? (
                  <p className="text-xs text-slate-500">Sem dados no período.</p>
                ) : (
                  <div className="space-y-1.5 text-xs sm:text-sm">
                    {report.byPaymentMethod.map((p) => (
                      <div key={p.paymentMethod} className="flex items-center justify-between">
                        <span className="text-slate-700">
                          {PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod} ({p.count})
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatBRL(p.revenueCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
};

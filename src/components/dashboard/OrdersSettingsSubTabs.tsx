import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  ExternalLink,
  Copy,
  Check,
  Download,
  Plus,
  Trash2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  DAY_NAMES_PT,
  DeliveryNeighborhood,
  OrderRecord,
  PaymentEventRecord,
  PlatformConfig,
  StoreHour,
  StoreSummary,
  SubscriptionRecord,
  SUBSCRIPTION_STATUS_LABELS,
  formatBRL,
  formatCentsForInput,
  formatDateBR,
  formatDateTimeBR,
  parseBRLInputToCents,
} from '../../types';
import { apiRequest } from '../../lib/api';

// ============================================================================
// ORDERS TAB (/painel/pedidos)
// ============================================================================
interface OrdersTabProps {
  storeId: string;
  orders: OrderRecord[];
  onRefresh: () => Promise<void>;
}

const ORDER_STATUS_LABELS: Record<OrderRecord['status'], string> = {
  prepared_whatsapp: 'Pedido preparado para WhatsApp',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

export const OrdersTab: React.FC<OrdersTabProps> = ({ storeId, orders, onRefresh }) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(orders[0]?.id || null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrderId]);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || orders[0] || null;

  const handleStatusChange = async (orderId: string, status: OrderRecord['status']) => {
    setUpdatingId(orderId);
    try {
      await apiRequest(`/api/stores/${storeId}/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
          Histórico de pedidos
        </h2>
        <p className="text-xs sm:text-sm text-slate-600">
          Os itens registram os nomes e preços vigentes no momento da finalização pelo cliente.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          Nenhum pedido registrado até o momento.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 space-y-2.5">
            {orders.map((ord) => {
              const active = selectedOrder?.id === ord.id;
              return (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => setSelectedOrderId(ord.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-colors cursor-pointer ${
                    active
                      ? 'bg-orange-50/60 border-orange-400'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      Pedido #{ord.order_number}
                    </span>
                    <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                      {formatBRL(ord.total_cents)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1 font-medium">{ord.customer_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {ORDER_STATUS_LABELS[ord.status]} · {formatDateTimeBR(ord.created_at)}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedOrder && (
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Pedido #{selectedOrder.order_number}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedOrder.customer_name} · {formatDateTimeBR(selectedOrder.created_at)}
                  </p>
                </div>

                <select
                  value={selectedOrder.status}
                  disabled={updatingId === selectedOrder.id}
                  onChange={(e) =>
                    handleStatusChange(selectedOrder.id, e.target.value as OrderRecord['status'])
                  }
                  className="min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-600"
                >
                  <option value="prepared_whatsapp">Pedido preparado para WhatsApp</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Itens registrados
                </p>
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-slate-800">
                      {item.quantity}× {item.product_name_snapshot}{' '}
                      <span className="text-xs text-slate-500 font-mono">
                        ({formatBRL(item.unit_price_cents)} un.)
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatBRL(item.line_total_cents)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs sm:text-sm">
                <p>
                  <strong>Modalidade:</strong>{' '}
                  {selectedOrder.fulfillment_type === 'delivery'
                    ? `Entrega — ${selectedOrder.neighborhood_name || ''} (${selectedOrder.delivery_address || ''})`
                    : 'Retirada no local'}
                </p>
                {selectedOrder.notes && (
                  <p>
                    <strong>Observações:</strong> {selectedOrder.notes}
                  </p>
                )}
                <p className="pt-1 font-mono tabular-nums">
                  Subtotal: {formatBRL(selectedOrder.subtotal_cents)} · Taxa:{' '}
                  {formatBRL(selectedOrder.delivery_fee_cents)} ·{' '}
                  <strong>Total: {formatBRL(selectedOrder.total_cents)}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Mensagem preparada para WhatsApp
                </p>
                <pre className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                  {selectedOrder.whatsapp_message}
                </pre>
                <a
                  href={selectedOrder.whatsapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir conversa no WhatsApp</span>
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SETTINGS TAB (/painel/configuracoes)
// ============================================================================
interface SettingsTabProps {
  store: StoreSummary;
  hours: StoreHour[];
  neighborhoods: DeliveryNeighborhood[];
  onRefresh: () => Promise<void>;
}

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Cuiaba',
  'America/Fortaleza',
  'America/Belem',
  'America/Rio_Branco',
];

export const SettingsTab: React.FC<SettingsTabProps> = ({
  store,
  hours,
  neighborhoods,
  onRefresh,
}) => {
  const [name, setName] = useState(store.name);
  const [slug, setSlug] = useState(store.slug);
  const [description, setDescription] = useState(store.description);
  const [logoUrl, setLogoUrl] = useState(store.logoUrl);
  const [whatsapp, setWhatsapp] = useState(store.whatsappE164 ? `+${store.whatsappE164}` : '');
  const [pickupAddress, setPickupAddress] = useState(store.pickupAddress);
  const [city, setCity] = useState(store.city);
  const [timezone, setTimezone] = useState(store.timezone || 'America/Sao_Paulo');
  const [allowDelivery, setAllowDelivery] = useState(store.allowDelivery);
  const [allowPickup, setAllowPickup] = useState(store.allowPickup);
  const [isPaused, setIsPaused] = useState(store.isPaused);
  const [pauseReason, setPauseReason] = useState(store.pauseReason);

  const [localHours, setLocalHours] = useState<StoreHour[]>(() =>
    DAY_NAMES_PT.map((_, idx) => {
      const found = hours.find((h) => h.dayOfWeek === idx);
      return found || { dayOfWeek: idx, openTime: '11:00', closeTime: '23:00', isClosed: false };
    })
  );

  const [newNeighborhoodName, setNewNeighborhoodName] = useState('');
  const [newNeighborhoodFee, setNewNeighborhoodFee] = useState('5,00');

  const [savingSettings, setSavingSettings] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [savingNb, setSavingNb] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const publicUrl = `${window.location.origin}/m/${store.slug}`;

  useEffect(() => {
    setName(store.name);
    setSlug(store.slug);
    setDescription(store.description);
    setLogoUrl(store.logoUrl);
    setWhatsapp(store.whatsappE164 ? `+${store.whatsappE164}` : '');
    setPickupAddress(store.pickupAddress);
    setCity(store.city);
    setTimezone(store.timezone || 'America/Sao_Paulo');
    setAllowDelivery(store.allowDelivery);
    setAllowPickup(store.allowPickup);
    setIsPaused(store.isPaused);
    setPauseReason(store.pauseReason);
  }, [store]);

  useEffect(() => {
    setLocalHours(
      DAY_NAMES_PT.map((_, idx) => {
        const found = hours.find((h) => h.dayOfWeek === idx);
        return found || { dayOfWeek: idx, openTime: '11:00', closeTime: '23:00', isClosed: false };
      })
    );
  }, [hours]);

  useEffect(() => {
    QRCode.toDataURL(publicUrl, { width: 320, margin: 2 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [publicUrl]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFeedback('');
    setSavingSettings(true);
    try {
      await apiRequest(`/api/stores/${store.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          slug,
          description,
          logoUrl,
          whatsapp,
          pickupAddress,
          city,
          timezone,
          allowDelivery,
          allowPickup,
          isPaused,
          pauseReason,
        }),
      });
      await onRefresh();
      setFeedback('Configurações da loja salvas com sucesso.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar configurações.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveHours = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFeedback('');
    setSavingHours(true);
    try {
      await apiRequest(`/api/stores/${store.id}/hours`, {
        method: 'PUT',
        body: JSON.stringify({ hours: localHours }),
      });
      await onRefresh();
      setFeedback('Horários de funcionamento atualizados.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao salvar horários.');
    } finally {
      setSavingHours(false);
    }
  };

  const handleAddNeighborhood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNeighborhoodName.trim()) return;
    setErrorMsg('');
    setSavingNb(true);
    try {
      await apiRequest(`/api/stores/${store.id}/neighborhoods`, {
        method: 'POST',
        body: JSON.stringify({
          name: newNeighborhoodName.trim(),
          feeCents: parseBRLInputToCents(newNeighborhoodFee),
        }),
      });
      setNewNeighborhoodName('');
      setNewNeighborhoodFee('5,00');
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao adicionar bairro.');
    } finally {
      setSavingNb(false);
    }
  };

  const handleDeleteNeighborhood = async (nbId: string) => {
    setErrorMsg('');
    try {
      await apiRequest(`/api/stores/${store.id}/neighborhoods/${nbId}`, { method: 'DELETE' });
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao remover bairro.');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
          Configurações da loja
        </h2>
        <p className="text-xs sm:text-sm text-slate-600">
          WhatsApp, pausa manual, endereço de retirada, bairros de entrega, horários e QR Code geral.
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Link & QR Code Geral */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="space-y-2.5 min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-slate-900">
            Link e QR Code geral da loja
          </h3>
          <p className="text-xs sm:text-sm text-slate-600">
            O QR Code aponta diretamente para o endereço público do cardápio:
          </p>
          <p className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 break-all">
            {publicUrl}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-800 inline-flex items-center gap-2 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado' : 'Copiar link'}</span>
            </button>
            {qrDataUrl && (
              <a
                href={qrDataUrl}
                download={`qrcode-${store.slug}.png`}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Baixar QR Code PNG</span>
              </a>
            )}
          </div>
        </div>

        {qrDataUrl && (
          <div className="p-3 bg-white border border-slate-200 rounded-2xl shrink-0 mx-auto sm:mx-0">
            <img src={qrDataUrl} alt={`QR Code ${store.name}`} className="w-36 h-36" />
          </div>
        )}
      </section>

      {/* Dados gerais, WhatsApp, Modalidades e Pausa Manual */}
      <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-slate-900">
          Identidade, WhatsApp e pausa manual
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da loja *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Slug do link (/m/slug) *</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              WhatsApp com DDD *
            </label>
            <input
              type="tel"
              required
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(11) 99988-7766"
              className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Fuso horário</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição curta</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Endereço de retirada</label>
            <input
              type="text"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Cidade / UF</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">URL da logo (opcional)</label>
          <input
            type="text"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="/images/dish_pizza_margherita.jpg"
            className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
          />
        </div>

        <div className="pt-2 flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-slate-800 min-h-[40px] cursor-pointer">
            <input
              type="checkbox"
              checked={allowDelivery}
              onChange={(e) => setAllowDelivery(e.target.checked)}
              className="w-4 h-4 accent-orange-600"
            />
            <span>Aceitar entrega por bairros</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800 min-h-[40px] cursor-pointer">
            <input
              type="checkbox"
              checked={allowPickup}
              onChange={(e) => setAllowPickup(e.target.checked)}
              className="w-4 h-4 accent-orange-600"
            />
            <span>Aceitar retirada no local</span>
          </label>
        </div>

        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
          <label className="flex items-center gap-2.5 text-sm font-bold text-amber-950 cursor-pointer">
            <input
              type="checkbox"
              checked={isPaused}
              onChange={(e) => setIsPaused(e.target.checked)}
              className="w-4 h-4 accent-amber-700"
            />
            <span>Pausar recebimento de pedidos manualmente</span>
          </label>
          {isPaused && (
            <input
              type="text"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="Motivo exibido aos clientes (ex: Alta demanda na cozinha, voltamos em 30 min)"
              className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-amber-300 bg-white"
            />
          )}
        </div>

        <button
          type="submit"
          disabled={savingSettings}
          className="min-h-[44px] px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
        >
          {savingSettings ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </form>

      {/* Bairros e Taxas */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">Bairros e taxas de entrega</h3>
          <p className="text-xs text-slate-600">Adicione os bairros atendidos e os respectivos valores.</p>
        </div>

        <form onSubmit={handleAddNeighborhood} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            required
            value={newNeighborhoodName}
            onChange={(e) => setNewNeighborhoodName(e.target.value)}
            placeholder="Nome do bairro"
            className="flex-1 min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
          />
          <input
            type="text"
            required
            value={newNeighborhoodFee}
            onChange={(e) => setNewNeighborhoodFee(e.target.value)}
            placeholder="Taxa (ex: 5,00)"
            className="w-full sm:w-32 min-h-[44px] px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-300"
          />
          <button
            type="submit"
            disabled={savingNb}
            className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar</span>
          </button>
        </form>

        <div className="divide-y divide-slate-100">
          {neighborhoods.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">Nenhum bairro cadastrado.</p>
          ) : (
            neighborhoods.map((nb) => (
              <div key={nb.id} className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800">{nb.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                    {formatBRL(nb.fee_cents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteNeighborhood(nb.id)}
                    aria-label={`Remover ${nb.name}`}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Horários de funcionamento */}
      <form onSubmit={handleSaveHours} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">Horários de funcionamento</h3>
          <p className="text-xs text-slate-600">
            Suporta turnos que passam da meia-noite (ex: abre às 18:00 e fecha às 02:00).
          </p>
        </div>

        <div className="space-y-2.5">
          {localHours.map((h, idx) => (
            <div
              key={h.dayOfWeek}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="flex items-center justify-between sm:w-44">
                <span className="text-sm font-semibold text-slate-800">
                  {DAY_NAMES_PT[h.dayOfWeek]}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer sm:hidden">
                  <input
                    type="checkbox"
                    checked={h.isClosed}
                    onChange={(e) => {
                      const copy = [...localHours];
                      copy[idx] = { ...h, isClosed: e.target.checked };
                      setLocalHours(copy);
                    }}
                  />
                  <span>Fechado</span>
                </label>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="time"
                  disabled={h.isClosed}
                  value={h.openTime}
                  onChange={(e) => {
                    const copy = [...localHours];
                    copy[idx] = { ...h, openTime: e.target.value };
                    setLocalHours(copy);
                  }}
                  className="min-h-[40px] px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 bg-white disabled:opacity-50"
                />
                <span className="text-xs text-slate-500">até</span>
                <input
                  type="time"
                  disabled={h.isClosed}
                  value={h.closeTime}
                  onChange={(e) => {
                    const copy = [...localHours];
                    copy[idx] = { ...h, closeTime: e.target.value };
                    setLocalHours(copy);
                  }}
                  className="min-h-[40px] px-2.5 py-1.5 text-sm font-mono rounded-lg border border-slate-300 bg-white disabled:opacity-50"
                />
                <label className="hidden sm:flex items-center gap-1.5 text-xs text-slate-700 ml-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={h.isClosed}
                    onChange={(e) => {
                      const copy = [...localHours];
                      copy[idx] = { ...h, isClosed: e.target.checked };
                      setLocalHours(copy);
                    }}
                  />
                  <span>Fechado</span>
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={savingHours}
          className="min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl cursor-pointer"
        >
          {savingHours ? 'Salvando horários...' : 'Salvar horários'}
        </button>
      </form>
    </div>
  );
};

// ============================================================================
// SUBSCRIPTION TAB (/painel/assinatura — EXCLUSIVAMENTE ANUAL)
// ============================================================================
interface SubscriptionTabProps {
  storeId: string;
  config: PlatformConfig | null;
  subscription: SubscriptionRecord | null;
  paymentEvents: PaymentEventRecord[];
  onRefresh: () => Promise<void>;
}

export const SubscriptionTab: React.FC<SubscriptionTabProps> = ({
  storeId,
  config,
  subscription,
  paymentEvents,
  onRefresh,
}) => {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const status = subscription?.status || 'pendente';
  const statusMeta = SUBSCRIPTION_STATUS_LABELS[status];
  const priceCents = config?.annualPriceCents || subscription?.annual_price_cents || 0;
  const priceText = priceCents > 0 ? `${formatBRL(priceCents)}/ano` : 'Valor anual em definição';

  const runSimulation = async (
    action: 'pending' | 'activate' | 'renew_12m' | 'past_due' | 'cancel_renewal' | 'expire',
    label: string
  ) => {
    setBusyAction(action);
    setFeedback('');
    setErrorMsg('');
    try {
      await apiRequest(`/api/stores/${storeId}/subscription/simulate`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await onRefresh();
      setFeedback(`Simulação concluída: ${label}`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha ao executar simulação.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelRenewal = async () => {
    setBusyAction('cancel_real');
    setFeedback('');
    setErrorMsg('');
    try {
      await apiRequest(`/api/stores/${storeId}/subscription/cancel-renewal`, {
        method: 'POST',
      });
      await onRefresh();
      setFeedback('Renovação automática cancelada. O acesso permanece ativo até o final do período vigente.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao cancelar renovação.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleMercadoPagoCheckout = async () => {
    setBusyAction('checkout');
    setFeedback('');
    setErrorMsg('');
    try {
      const res = await apiRequest<{ mode: string; checkoutUrl?: string; message?: string }>(
        `/api/stores/${storeId}/subscription/checkout`,
        { method: 'POST' }
      );
      if (res.mode === 'mercadopago_test' && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setFeedback(res.message || 'Use o simulador da prévia abaixo.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao iniciar checkout anual.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
          Assinatura anual
        </h2>
        <p className="text-xs sm:text-sm text-slate-600">
          Ciclo único de 12 meses · Cobrança anual com renovação automática.
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Status Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-orange-600" />
              <span className="font-display text-base font-bold text-slate-900">
                Plano Anual DigMenu
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Cobrança anual com renovação automática ·{' '}
              <span className="font-mono font-semibold text-slate-900">{priceText}</span>
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border self-start ${statusMeta.tone}`}>
            {statusMeta.label}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs text-slate-500">Início do período vigente</p>
            <p className="font-mono font-bold text-slate-900 mt-1">
              {formatDateBR(subscription?.current_period_start)}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs text-slate-500">Fim do período vigente</p>
            <p className="font-mono font-bold text-slate-900 mt-1">
              {formatDateBR(subscription?.current_period_end)}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs text-slate-500">Próxima renovação</p>
            <p className="font-mono font-bold text-slate-900 mt-1">
              {subscription?.next_renewal_at ? formatDateBR(subscription.next_renewal_at) : 'Desativada'}
            </p>
          </div>
        </div>

        {status === 'expirada' && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm">
            <strong>Assinatura expirada:</strong> Seu catálogo e histórico de pedidos permanecem preservados no painel, mas novos pedidos no cardápio público estão pausados até a regularização.
          </div>
        )}

        {status === 'renovacao_cancelada' && (
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 text-xs sm:text-sm">
            <strong>Renovação cancelada:</strong> Não haverá cobrança no próximo ciclo, e a loja continua operando normalmente até {formatDateBR(subscription?.current_period_end)}.
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {config?.mercadoPago.configured ? (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleMercadoPagoCheckout}
              className="min-h-[44px] px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
            >
              Assinar via Mercado Pago (Teste)
            </button>
          ) : null}

          {(status === 'ativa' || status === 'pagamento_em_atraso') && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleCancelRenewal}
              className="min-h-[44px] px-5 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-xl cursor-pointer"
            >
              Cancelar renovação automática
            </button>
          )}
        </div>
      </section>

      {/* Simulador identificado da Prévia */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
            Simulador da prévia (sem cobrança real)
          </p>
          <h3 className="font-display text-base font-bold text-slate-900">
            Testar ciclo completo da assinatura anual
          </h3>
          <p className="text-xs sm:text-sm text-slate-600">
            {config?.mercadoPago.configured
              ? 'Credenciais de teste do Mercado Pago detectadas; você também pode simular eventos localmente abaixo.'
              : 'Credenciais do Mercado Pago não configuradas neste ambiente. As ações abaixo simulam diretamente no banco isolado da prévia.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => runSimulation('activate', 'Assinatura anual ativada (12 meses)')}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Testar assinatura anual (Ativar)
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => runSimulation('renew_12m', 'Renovação anual (+12 meses) aplicada')}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Simular renovação (+12 meses)
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => runSimulation('past_due', 'Pagamento em atraso registrado')}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Simular pagamento em atraso
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => runSimulation('cancel_renewal', 'Renovação cancelada (acesso mantido)')}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Simular cancelamento da renovação
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => runSimulation('expire', 'Assinatura expirada (pedidos pausados)')}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-900 text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Simular expiração
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => runSimulation('pending', 'Estado pendente aplicado')}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Simular pendente
          </button>
        </div>
      </section>

      {/* Histórico de eventos de pagamento */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
        <h3 className="font-display text-base font-bold text-slate-900">
          Eventos de pagamento registrados
        </h3>
        {paymentEvents.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhum evento registrado.</p>
        ) : (
          <div className="divide-y divide-slate-100 text-xs sm:text-sm">
            {paymentEvents.map((ev) => (
              <div key={ev.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <span className="font-semibold text-slate-900">{ev.event_type}</span>
                  <span className="text-slate-500"> · {ev.provider} · {ev.status}</span>
                </div>
                <span className="font-mono text-slate-600 text-xs">
                  {formatDateTimeBR(ev.processed_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

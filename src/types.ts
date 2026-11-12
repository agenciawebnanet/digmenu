export type SubscriptionStatus =
  | 'pendente'
  | 'ativa'
  | 'pagamento_em_atraso'
  | 'renovacao_cancelada'
  | 'expirada';

export interface StoreOperationalStatus {
  canAcceptOrders: boolean;
  isOpenBySchedule: boolean;
  isPaused: boolean;
  isSubscriptionBlocked: boolean;
  badgeLabel:
    | 'Aberto'
    | 'Fechado'
    | 'Pausado'
    | 'Assinatura expirada'
    | 'Assinatura pendente'
    | 'WhatsApp pendente';
  reason: string;
  currentLocalTime: string;
  currentDayOfWeek: number;
}

export interface StoreSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
  whatsappE164: string;
  pickupAddress: string;
  city: string;
  timezone: string;
  allowDelivery: boolean;
  allowPickup: boolean;
  isPaused: boolean;
  pauseReason: string;
  operationalStatus: StoreOperationalStatus;
  subscriptionStatus: SubscriptionStatus;
}

export interface Category {
  id: string;
  store_id?: string;
  name: string;
  description: string;
  sort_order: number;
}

export interface Product {
  id: string;
  store_id?: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string;
  is_available?: boolean;
  sort_order: number;
}

export interface StoreHour {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface DeliveryNeighborhood {
  id: string;
  store_id?: string;
  name: string;
  fee_cents: number;
  isActive?: boolean;
}

export interface OrderItemRecord {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

export interface OrderRecord {
  id: string;
  order_number: number;
  store_id: string;
  idempotency_key: string;
  customer_name: string;
  fulfillment_type: 'delivery' | 'pickup';
  neighborhood_id: string | null;
  neighborhood_name: string | null;
  delivery_address: string | null;
  notes: string;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  status: 'prepared_whatsapp' | 'confirmed' | 'completed' | 'cancelled';
  whatsapp_message: string;
  whatsapp_url: string;
  created_at: string;
  items: OrderItemRecord[];
}

export interface SubscriptionRecord {
  id: string;
  store_id: string;
  provider: 'simulator' | 'mercadopago';
  provider_subscription_id: string | null;
  status: SubscriptionStatus;
  annual_price_cents: number;
  auto_renew: number;
  current_period_start: string | null;
  current_period_end: string | null;
  next_renewal_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

export interface PaymentEventRecord {
  id: string;
  subscription_id: string;
  store_id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  status: string;
  amount_cents: number;
  processed_at: string;
}

export interface PlatformConfig {
  annualPriceCents: number;
  annualPriceFormatted: string | null;
  mercadoPago: {
    configured: boolean;
    isTestCredential: boolean;
    mode: 'mercadopago_test' | 'simulator';
    warning?: string;
  };
  previewIsolated: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export function formatBRL(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  const value = (safe / 100).toFixed(2).replace('.', ',');
  const [intPart, decPart] = value.split(',');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${withThousands},${decPart}`;
}

export function parseBRLInputToCents(raw: string): number {
  const cleaned = raw.replace(/[^\d,\.]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (Number.isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function formatCentsForInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export const DAY_NAMES_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, { label: string; tone: string }> = {
  pendente: { label: 'Pendente', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  ativa: { label: 'Ativa', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  pagamento_em_atraso: { label: 'Pagamento em atraso', tone: 'bg-rose-50 text-rose-800 border-rose-200' },
  renovacao_cancelada: { label: 'Renovação cancelada', tone: 'bg-slate-100 text-slate-800 border-slate-300' },
  expirada: { label: 'Expirada', tone: 'bg-red-100 text-red-900 border-red-300' },
};

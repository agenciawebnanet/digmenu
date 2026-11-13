import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingBag,
  Settings,
  CreditCard,
  LogOut,
  ExternalLink,
  AlertCircle,
  ChefHat,
  Utensils,
  Calculator,
  BarChart3,
  Bell,
  BellOff,
  Shield,
  X,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useStoreSocket, type StoreSocketEvent } from '../../lib/useStoreSocket';
import {
  isSoundEnabled,
  playNewOrderChime,
  setSoundEnabled,
  unlockAudioContext,
} from '../../lib/sound';
import {
  AuthUser,
  CashRegisterState,
  Category,
  DeliveryNeighborhood,
  OrderRecord,
  PaymentEventRecord,
  PlatformConfig,
  Product,
  StoreHour,
  StoreMemberRole,
  StoreSummary,
  StoreTable,
  SubscriptionRecord,
  formatBRL,
} from '../../types';
import { OverviewTab, MenuTab } from './OverviewAndMenuTabs';
import { OrdersTab, SettingsTab, SubscriptionTab } from './OrdersSettingsSubTabs';
import { KitchenTab, WaiterTab } from './OperationsTabs';
import { PosCashTab, ReportsTab } from './PosCashReportsTabs';
import { SubscriptionBadge } from '../SubscriptionBadge';

export type DashboardRoute =
  | '/painel'
  | '/painel/cozinha'
  | '/painel/garcom'
  | '/painel/pdv'
  | '/painel/pedidos'
  | '/painel/cardapio'
  | '/painel/relatorios'
  | '/painel/configuracoes'
  | '/painel/assinatura';

interface OverviewResponse {
  store: StoreSummary;
  categories: Category[];
  products: Product[];
  hours: StoreHour[];
  neighborhoods: DeliveryNeighborhood[];
  tables: StoreTable[];
  cashRegister: CashRegisterState | null;
  subscription: SubscriptionRecord | null;
  paymentEvents: PaymentEventRecord[];
  orders: OrderRecord[];
}

interface DashboardShellProps {
  currentPath: DashboardRoute;
  user: AuthUser;
  stores: StoreSummary[];
  config: PlatformConfig | null;
  onNavigate: (path: string) => void;
  onLogout: () => Promise<void>;
}

const NAV_ITEMS: Array<{
  path: DashboardRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: StoreMemberRole[];
}> = [
  { path: '/painel', label: 'Visão geral', icon: LayoutDashboard },
  {
    path: '/painel/cozinha',
    label: 'Cozinha (KDS)',
    icon: ChefHat,
    roles: ['owner', 'manager', 'kitchen'],
  },
  {
    path: '/painel/garcom',
    label: 'Garçom / Mesas',
    icon: Utensils,
    roles: ['owner', 'manager', 'waiter'],
  },
  {
    path: '/painel/pdv',
    label: 'PDV e Caixa',
    icon: Calculator,
    roles: ['owner', 'manager', 'cashier'],
  },
  { path: '/painel/pedidos', label: 'Pedidos', icon: ShoppingBag },
  {
    path: '/painel/cardapio',
    label: 'Cardápio',
    icon: UtensilsCrossed,
    roles: ['owner', 'manager'],
  },
  {
    path: '/painel/relatorios',
    label: 'Relatórios',
    icon: BarChart3,
    roles: ['owner', 'manager', 'cashier'],
  },
  {
    path: '/painel/configuracoes',
    label: 'Configurações',
    icon: Settings,
    roles: ['owner', 'manager'],
  },
  {
    path: '/painel/assinatura',
    label: 'Assinatura',
    icon: CreditCard,
    roles: ['owner', 'manager'],
  },
];

export const DashboardShell: React.FC<DashboardShellProps> = ({
  currentPath,
  user,
  stores,
  config,
  onNavigate,
  onLogout,
}) => {
  const [activeStoreId, setActiveStoreId] = useState<string>(stores[0]?.id || '');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());
  const [liveAlert, setLiveAlert] = useState<{ orderNumber: number; customerName: string; totalCents: number } | null>(null);

  useEffect(() => {
    if (stores.length > 0 && !stores.some((s) => s.id === activeStoreId)) {
      setActiveStoreId(stores[0].id);
    }
  }, [stores, activeStoreId]);

  const loadOverview = useCallback(async () => {
    if (!activeStoreId) return;
    setErrorMsg('');
    try {
      const data = await apiRequest<OverviewResponse>(`/api/stores/${activeStoreId}/overview`);
      setOverview(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível carregar os dados da loja.');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => {
    setLoading(true);
    loadOverview();
  }, [loadOverview]);

  const handleToggleSound = async () => {
    const next = !soundOn;
    if (next) {
      await unlockAudioContext();
      await playNewOrderChime();
    }
    setSoundEnabled(next);
    setSoundOn(next);
  };

  const handleSocketEvent = useCallback(
    (evt: StoreSocketEvent) => {
      if (
        evt.type === 'order:created' ||
        evt.type === 'order:updated' ||
        evt.type === 'menu:updated' ||
        evt.type === 'cash:updated' ||
        evt.type === 'store:updated'
      ) {
        loadOverview();
      }
      if (evt.type === 'order:created' && evt.payload?.order) {
        const ord = evt.payload.order as OrderRecord;
        setLiveAlert({
          orderNumber: ord.order_number,
          customerName: ord.customer_name,
          totalCents: ord.total_cents,
        });
        if (soundOn) {
          playNewOrderChime();
        }
      }
    },
    [loadOverview, soundOn]
  );

  useStoreSocket({
    storeId: activeStoreId,
    onEvent: handleSocketEvent,
  });

  if (!activeStoreId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full text-center space-y-4">
          <p className="text-sm text-slate-700">Nenhuma loja vinculada à sua conta.</p>
          <button
            onClick={() => onNavigate('/cadastro')}
            className="min-h-[44px] px-5 bg-orange-600 text-white text-sm font-semibold rounded-xl cursor-pointer"
          >
            Criar minha loja
          </button>
        </div>
      </div>
    );
  }

  const store = overview?.store || stores.find((s) => s.id === activeStoreId)!;
  const myRole: StoreMemberRole = store.myRole || 'owner';
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(myRole)
  );
  const activeQueueCount = (overview?.orders || []).filter((o) =>
    ['novo', 'aceito', 'em_preparo'].includes(o.status)
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row overflow-x-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-slate-200 flex-col justify-between shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="flex items-center gap-2.5 min-w-0"
            >
              <span className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0">
                <UtensilsCrossed className="w-5 h-5" />
              </span>
              <span className="font-display text-lg font-extrabold text-slate-900 truncate">
                DigMenu
              </span>
            </a>

            <button
              type="button"
              onClick={handleToggleSound}
              title={soundOn ? 'Som de novos pedidos ativado' : 'Ativar alerta sonoro'}
              className={`min-w-[36px] min-h-[36px] rounded-lg border flex items-center justify-center cursor-pointer ${
                soundOn
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              {soundOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Loja ativa
              </p>
              <SubscriptionBadge
                status={overview?.subscription?.status || store.subscriptionStatus}
                size="sm"
                compact
              />
            </div>
            {stores.length > 1 ? (
              <select
                value={activeStoreId}
                onChange={(e) => setActiveStoreId(e.target.value)}
                className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-bold text-slate-900 truncate">{store.name}</p>
            )}
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>

          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = currentPath === item.path;
              const badge =
                item.path === '/painel/cozinha' && activeQueueCount > 0 ? activeQueueCount : null;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                  className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    active
                      ? 'bg-orange-600 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {badge !== null && (
                    <span
                      className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                        active ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-2">
          {user.isPlatformAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('/admin')}
              className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              <span>Admin da plataforma</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate(`/m/${store.slug}`)}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Ver cardápio público</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] px-3.5 py-2 rounded-xl text-rose-700 hover:bg-rose-50 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da conta</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header + Horizontal Tabs */}
      <div className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="px-3 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-4 h-4" />
            </span>
            <span className="font-display text-sm font-bold text-slate-900 truncate">
              {store.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleSound}
              aria-label={soundOn ? 'Desativar som' : 'Ativar som'}
              className={`min-h-[36px] min-w-[36px] rounded-lg border flex items-center justify-center cursor-pointer ${
                soundOn
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {soundOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => onNavigate(`/m/${store.slug}`)}
              aria-label="Abrir cardápio público"
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Cardápio</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sair da conta"
              className="min-h-[36px] min-w-[36px] rounded-lg text-rose-700 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <nav className="px-3 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {visibleNavItems.map((item) => {
            const active = currentPath === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => onNavigate(item.path)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
        {liveAlert && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-600 text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
              <Bell className="w-4 h-4 shrink-0" />
              <span>
                Novo pedido #{liveAlert.orderNumber} de {liveAlert.customerName} (
                {formatBRL(liveAlert.totalCents)})
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setLiveAlert(null);
                  onNavigate('/painel/cozinha');
                }}
                className="px-3 py-1 rounded-lg bg-white text-emerald-800 text-xs font-bold cursor-pointer"
              >
                Abrir cozinha
              </button>
              <button
                type="button"
                onClick={() => setLiveAlert(null)}
                aria-label="Fechar alerta"
                className="p-1 rounded-lg hover:bg-emerald-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading && !overview ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
            Carregando painel da loja...
          </div>
        ) : overview ? (
          <>
            {currentPath === '/painel' && (
              <OverviewTab
                store={overview.store}
                products={overview.products}
                orders={overview.orders}
                cashRegister={overview.cashRegister}
                subscription={overview.subscription}
                onNavigate={onNavigate}
              />
            )}
            {currentPath === '/painel/cozinha' && (
              <KitchenTab
                store={overview.store}
                orders={overview.orders}
                soundOn={soundOn}
                onToggleSound={handleToggleSound}
                onRefresh={loadOverview}
              />
            )}
            {currentPath === '/painel/garcom' && (
              <WaiterTab
                store={overview.store}
                tables={overview.tables || []}
                categories={overview.categories}
                products={overview.products}
                orders={overview.orders}
                onRefresh={loadOverview}
                onNavigate={onNavigate}
              />
            )}
            {currentPath === '/painel/pdv' && (
              <PosCashTab
                store={overview.store}
                cashRegister={overview.cashRegister}
                orders={overview.orders}
                products={overview.products}
                tables={overview.tables || []}
                onRefresh={loadOverview}
              />
            )}
            {currentPath === '/painel/cardapio' && (
              <MenuTab
                storeId={overview.store.id}
                categories={overview.categories}
                products={overview.products}
                onRefresh={loadOverview}
              />
            )}
            {currentPath === '/painel/pedidos' && (
              <OrdersTab
                store={overview.store}
                orders={overview.orders}
                onRefresh={loadOverview}
              />
            )}
            {currentPath === '/painel/relatorios' && <ReportsTab store={overview.store} />}
            {currentPath === '/painel/configuracoes' && (
              <SettingsTab
                store={overview.store}
                hours={overview.hours}
                neighborhoods={overview.neighborhoods}
                tables={overview.tables || []}
                onRefresh={loadOverview}
              />
            )}
            {currentPath === '/painel/assinatura' && (
              <SubscriptionTab
                storeId={overview.store.id}
                config={config}
                subscription={overview.subscription}
                paymentEvents={overview.paymentEvents}
                onRefresh={loadOverview}
              />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
};

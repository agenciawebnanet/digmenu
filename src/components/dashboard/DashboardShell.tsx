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
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import {
  AuthUser,
  Category,
  DeliveryNeighborhood,
  OrderRecord,
  PaymentEventRecord,
  PlatformConfig,
  Product,
  StoreHour,
  StoreSummary,
  SubscriptionRecord,
} from '../../types';
import { OverviewTab, MenuTab } from './OverviewAndMenuTabs';
import { OrdersTab, SettingsTab, SubscriptionTab } from './OrdersSettingsSubTabs';

export type DashboardRoute =
  | '/painel'
  | '/painel/cardapio'
  | '/painel/pedidos'
  | '/painel/configuracoes'
  | '/painel/assinatura';

interface OverviewResponse {
  store: StoreSummary;
  categories: Category[];
  products: Product[];
  hours: StoreHour[];
  neighborhoods: DeliveryNeighborhood[];
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

const NAV_ITEMS: Array<{ path: DashboardRoute; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { path: '/painel', label: 'Visão geral', icon: LayoutDashboard },
  { path: '/painel/cardapio', label: 'Cardápio', icon: UtensilsCrossed },
  { path: '/painel/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { path: '/painel/configuracoes', label: 'Configurações', icon: Settings },
  { path: '/painel/assinatura', label: 'Assinatura', icon: CreditCard },
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row overflow-x-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-slate-200 flex-col justify-between shrink-0 sticky top-0 h-screen">
        <div className="p-5 space-y-6">
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
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Loja ativa
            </p>
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
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                    active
                      ? 'bg-orange-600 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <button
            type="button"
            onClick={() => onNavigate(`/m/${store.slug}`)}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Ver cardápio público</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-xl text-rose-700 hover:bg-rose-50 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da conta</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header + Horizontal Tabs (optimized for 360px) */}
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
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate(`/m/${store.slug}`)}
              aria-label="Abrir cardápio público"
              className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Cardápio</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sair da conta"
              className="min-h-[40px] min-w-[40px] rounded-lg text-rose-700 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <nav className="px-3 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {NAV_ITEMS.map((item) => {
            const active = currentPath === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => onNavigate(item.path)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto">
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
                subscription={overview.subscription}
                onNavigate={onNavigate}
              />
            )}
            {currentPath === '/painel/cardapio' && (
              <MenuTab
                storeId={overview.store.id}
                slug={store.slug}
                categories={overview.categories}
                products={overview.products}
                onRefresh={loadOverview}
              />
            )}
            {currentPath === '/painel/pedidos' && (
              <OrdersTab
                storeId={overview.store.id}
                orders={overview.orders}
                onRefresh={loadOverview}
              />
            )}
            {currentPath === '/painel/configuracoes' && (
              <SettingsTab
                store={overview.store}
                hours={overview.hours}
                neighborhoods={overview.neighborhoods}
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

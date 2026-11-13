import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  LogOut,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  CustomerAccount,
  CustomerOrderRecord,
  PlatformConfig,
  formatBRL,
  formatDateTimeBR,
} from '../types';
import { GoogleAuthButton } from './GoogleAuthButton';

interface CustomerAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: PlatformConfig | null;
  storeSlug: string;
  storeName: string;
  customer: CustomerAccount | null;
  onCustomerChange: (customer: CustomerAccount | null) => void;
}

export const CustomerAccountModal: React.FC<CustomerAccountModalProps> = ({
  isOpen,
  onClose,
  config,
  storeSlug,
  storeName,
  customer,
  onCustomerChange,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [accountTab, setAccountTab] = useState<'orders' | 'profile'>('orders');
  const [ordersScope, setOrdersScope] = useState<'store' | 'all'>('store');

  // Auth form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');

  // Profile edit fields
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');

  const [orders, setOrders] = useState<CustomerOrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  useEffect(() => {
    if (customer) {
      setProfileName(customer.name);
      setProfilePhone(customer.phoneE164 ? `+${customer.phoneE164}` : '');
      setProfileAddress(customer.defaultAddress || '');
    }
  }, [customer]);

  useEffect(() => {
    if (!isOpen || !customer || accountTab !== 'orders') return;
    setLoadingOrders(true);
    const qs = ordersScope === 'store' ? `?storeSlug=${encodeURIComponent(storeSlug)}` : '';
    apiRequest<{ orders: CustomerOrderRecord[] }>(`/api/customer/orders${qs}`)
      .then((res) => setOrders(res.orders))
      .catch(() => setOrders([]))
      .finally(() => setLoadingOrders(false));
  }, [isOpen, customer, accountTab, ordersScope, storeSlug]);

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFeedbackMsg('');
    setBusy(true);
    try {
      if (authTab === 'login') {
        const res = await apiRequest<{ customer: CustomerAccount }>('/api/customer/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password }),
        });
        onCustomerChange(res.customer);
        setAccountTab('orders');
      } else {
        const res = await apiRequest<{ customer: CustomerAccount }>('/api/customer/register', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password,
            phone: phone.trim(),
            defaultAddress: defaultAddress.trim(),
          }),
        });
        onCustomerChange(res.customer);
        setAccountTab('orders');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível autenticar sua conta de cliente.');
    } finally {
      setBusy(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFeedbackMsg('');
    setBusy(true);
    try {
      const res = await apiRequest<{ customer: CustomerAccount }>('/api/customer/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profileName.trim(),
          phone: profilePhone.trim(),
          defaultAddress: profileAddress.trim(),
        }),
      });
      onCustomerChange(res.customer);
      setFeedbackMsg('Seus dados foram atualizados.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao atualizar seus dados.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await apiRequest('/api/customer/logout', { method: 'POST' });
      onCustomerChange(null);
      setOrders([]);
    } finally {
      setBusy(false);
    }
  };

  const fillDemoCustomer = (demoEmail: string) => {
    setAuthTab('login');
    setEmail(demoEmail);
    setPassword('demo1234');
    setErrorMsg('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conta individual de cliente"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-slate-900 truncate">
                {customer ? customer.name : 'Minha conta de cliente'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {customer
                  ? `${customer.email} · Conta individual`
                  : 'Separação total da conta de lojistas'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar conta do cliente"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {feedbackMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {!customer ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setErrorMsg('');
                  }}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-bold cursor-pointer ${
                    authTab === 'login' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setErrorMsg('');
                  }}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-bold cursor-pointer ${
                    authTab === 'register' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Criar conta
                </button>
              </div>

              <GoogleAuthButton
                config={config}
                audience="customer"
                returnTo={`/m/${storeSlug}`}
                label="Continuar com Google"
                onPreviewSuccess={(res) => {
                  if (res?.customer) {
                    onCustomerChange(res.customer);
                    setAccountTab('orders');
                  }
                }}
                onError={(msg) => setErrorMsg(msg)}
              />

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider shrink-0">
                  ou e-mail e senha
                </span>
                <div className="border-t border-slate-200 w-full" />
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                {authTab === 'register' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Seu nome completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Camila Ferreira"
                        className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          WhatsApp (opcional)
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(11) 98877-6655"
                          className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Endereço padrão
                        </label>
                        <input
                          type="text"
                          value={defaultAddress}
                          onChange={(e) => setDefaultAddress(e.target.value)}
                          placeholder="Rua, número e complemento"
                          className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    E-mail *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Senha *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[46px] bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
                >
                  {busy
                    ? 'Processando...'
                    : authTab === 'login'
                    ? 'Entrar como cliente'
                    : 'Criar conta de cliente'}
                </button>
              </form>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-slate-500">
                  Clientes de demonstração (senha: <span className="font-mono">demo1234</span>)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemoCustomer('camila@cliente.demo')}
                    className="min-h-[44px] px-3 py-2 text-left text-xs rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="block font-bold text-slate-900">Camila Ferreira</span>
                    <span className="block text-slate-500 truncate font-mono">camila@cliente.demo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoCustomer('rafael@cliente.demo')}
                    className="min-h-[44px] px-3 py-2 text-left text-xs rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    <span className="block font-bold text-slate-900">Rafael Mendes</span>
                    <span className="block text-slate-500 truncate font-mono">rafael@cliente.demo</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAccountTab('orders')}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-bold cursor-pointer ${
                    accountTab === 'orders' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Meus pedidos
                </button>
                <button
                  type="button"
                  onClick={() => setAccountTab('profile')}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-bold cursor-pointer ${
                    accountTab === 'profile' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Meus dados
                </button>
              </div>

              {accountTab === 'orders' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      Exibir pedidos:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOrdersScope('store')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          ordersScope === 'store'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        Em {storeName}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrdersScope('all')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          ordersScope === 'all'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        Todas as lojas
                      </button>
                    </div>
                  </div>

                  {loadingOrders ? (
                    <p className="text-sm text-slate-500 py-6 text-center">Carregando seus pedidos...</p>
                  ) : orders.length === 0 ? (
                    <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                      <ShoppingBag className="w-6 h-6 text-slate-400 mx-auto" />
                      <p className="text-sm font-semibold text-slate-700">
                        Nenhum pedido encontrado nesta conta
                      </p>
                      <p className="text-xs text-slate-500">
                        Seus pedidos enviados pelo WhatsApp enquanto estiver conectado aparecerão aqui.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {orders.map((ord) => (
                        <div
                          key={ord.id}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                Pedido #{ord.order_number} · {ord.store_name || storeName}
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatDateTimeBR(ord.created_at)}
                              </p>
                            </div>
                            <span className="text-sm font-bold font-mono text-slate-900 shrink-0">
                              {formatBRL(ord.total_cents)}
                            </span>
                          </div>
                          <ul className="text-xs text-slate-700 space-y-0.5">
                            {ord.items.map((it) => (
                              <li key={it.id}>
                                {it.quantity}× {it.product_name_snapshot}
                              </li>
                            ))}
                          </ul>
                          <a
                            href={ord.whatsapp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline pt-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Reabrir mensagem no WhatsApp</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleProfileSave} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Seu nome *
                    </label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      WhatsApp com DDD
                    </label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="(11) 98877-6655"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Endereço padrão para entrega
                    </label>
                    <input
                      type="text"
                      value={profileAddress}
                      onChange={(e) => setProfileAddress(e.target.value)}
                      placeholder="Rua, número e complemento"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl cursor-pointer"
                  >
                    {busy ? 'Salvando...' : 'Salvar dados'}
                  </button>
                </form>
              )}

              <div className="pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleLogout}
                  className="w-full min-h-[44px] border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair da conta de cliente</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

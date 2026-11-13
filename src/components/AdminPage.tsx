import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  ArrowLeft,
  Store,
  CheckCircle2,
  Ban,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  AuthUser,
  StoreSummary,
  SUBSCRIPTION_STATUS_LABELS,
  formatBRL,
  formatDateBR,
} from '../types';

interface AdminStoreRow extends StoreSummary {
  ownerEmail: string;
  ownerName: string;
  subscriptionPeriodEnd: string | null;
  ordersCount: number;
  gmvCents: number;
  createdAt: string;
}

interface AdminPageProps {
  user: AuthUser | null;
  onNavigate: (path: string) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ user, onNavigate }) => {
  const [stores, setStores] = useState<AdminStoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyId, setBusyId] = useState('');

  const loadStores = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<{ stores: AdminStoreRow[] }>('/api/admin/stores');
      setStores(res.stores);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Acesso negado ao painel administrativo da plataforma.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  const handleToggleBlock = async (store: AdminStoreRow) => {
    setBusyId(store.id);
    setErrorMsg('');
    try {
      const nextBlocked = !store.isPlatformBlocked;
      await apiRequest(`/api/admin/stores/${store.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          isPlatformBlocked: nextBlocked,
          platformBlockReason: nextBlocked
            ? 'Suspenso pela administração da plataforma DigMenu.'
            : '',
        }),
      });
      await loadStores();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível alterar o status da loja.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate(user ? '/painel' : '/')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-display text-base sm:text-lg font-extrabold text-slate-900">
              Administração da Plataforma DigMenu
            </h1>
            <p className="text-xs text-slate-500">
              Controle multiempresa restrito aos e-mails configurados em PLATFORM_ADMIN_EMAILS
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadStores}
          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar</span>
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {errorMsg ? (
          <div className="bg-white border border-rose-200 rounded-2xl p-6 text-center space-y-3 max-w-lg mx-auto mt-8">
            <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
            <h2 className="font-display text-lg font-bold text-slate-900">Acesso administrativo restrito</h2>
            <p className="text-sm text-slate-600">{errorMsg}</p>
            <p className="text-xs text-slate-500">
              Defina <span className="font-mono">PLATFORM_ADMIN_EMAILS</span> no ambiente do servidor para autorizar um administrador sem senhas padrão.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('/painel')}
              className="min-h-[44px] px-5 bg-slate-900 text-white text-sm font-semibold rounded-xl cursor-pointer"
            >
              Voltar ao painel da loja
            </button>
          </div>
        ) : loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Carregando lojas cadastradas...</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-orange-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Lojas registradas na plataforma ({stores.length})
                </h2>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Restaurante / Slug</th>
                    <th className="px-4 py-3 font-semibold">Responsável</th>
                    <th className="px-4 py-3 font-semibold">Assinatura Anual</th>
                    <th className="px-4 py-3 font-semibold text-right">Pedidos</th>
                    <th className="px-4 py-3 font-semibold text-right">Volume</th>
                    <th className="px-4 py-3 font-semibold">Status Plataforma</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stores.map((store) => {
                    const subMeta = SUBSCRIPTION_STATUS_LABELS[store.subscriptionStatus];
                    return (
                      <tr key={store.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{store.name}</p>
                          <a
                            href={`/m/${store.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-orange-700 hover:underline inline-flex items-center gap-1"
                          >
                            <span>/m/{store.slug}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-900 font-medium">{store.ownerName || '—'}</p>
                          <p className="text-xs text-slate-500 font-mono">{store.ownerEmail || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-semibold border ${subMeta.tone}`}>
                            {subMeta.label}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Até {formatDateBR(store.subscriptionPeriodEnd)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                          {store.ordersCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                          {formatBRL(store.gmvCents)}
                        </td>
                        <td className="px-4 py-3">
                          {store.isPlatformBlocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-300">
                              <Ban className="w-3.5 h-3.5" />
                              <span>Bloqueada</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Ativa</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={busyId === store.id}
                            onClick={() => handleToggleBlock(store)}
                            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                              store.isPlatformBlocked
                                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
                            }`}
                          >
                            {busyId === store.id
                              ? 'Salvando...'
                              : store.isPlatformBlocked
                              ? 'Reativar loja'
                              : 'Suspender loja'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

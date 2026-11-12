import React, { useState } from 'react';
import { UtensilsCrossed, ArrowLeft, AlertCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { AuthUser, StoreSummary } from '../types';

interface AuthPagesProps {
  mode: 'login' | 'register';
  onNavigate: (path: string) => void;
  onAuthSuccess: (user: AuthUser, stores: StoreSummary[]) => void;
}

function toSlugPreview(val: string): string {
  return val
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const AuthPages: React.FC<AuthPagesProps> = ({ mode, onNavigate, onAuthSuccess }) => {
  const [userName, setUserName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleStoreNameChange = (value: string) => {
    setStoreName(value);
    if (!slugManuallyEdited) {
      setSlug(toSlugPreview(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await apiRequest<{ user: AuthUser; stores: StoreSummary[] }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            userName: userName.trim() || storeName.trim(),
            storeName: storeName.trim(),
            slug: slug.trim(),
            whatsapp: whatsapp.trim(),
            pickupAddress: pickupAddress.trim(),
            city: city.trim(),
            email: email.trim(),
            password,
          }),
        });
        onAuthSuccess(res.user, res.stores);
        onNavigate('/painel');
      } else {
        const res = await apiRequest<{ user: AuthUser; stores: StoreSummary[] }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        });
        onAuthSuccess(res.user, res.stores);
        onNavigate('/painel');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível concluir a operação.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('demo1234');
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8 overflow-x-hidden">
      <div className="w-full max-w-md mx-auto space-y-5">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para a página inicial</span>
        </button>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5" />
              </span>
              <span className="font-display text-lg font-extrabold text-slate-900">DigMenu</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 pt-1">
              {mode === 'register' ? 'Criar minha loja' : 'Entrar no painel'}
            </h1>
            <p className="text-sm text-slate-600">
              {mode === 'register'
                ? 'Acesso à demonstração em ambiente de prévia isolado. Nenhuma cobrança real será feita.'
                : 'Acesse sua loja para gerenciar cardápio, pedidos, configurações e assinatura anual.'}
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nome do restaurante *
                  </label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => handleStoreNameChange(e.target.value)}
                    placeholder="Ex: Cantina Vila Mariana"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Endereço público do cardápio *
                  </label>
                  <div className="flex items-center rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-orange-600 overflow-hidden bg-white">
                    <span className="px-3 py-2.5 text-xs font-mono bg-slate-100 text-slate-600 border-r border-slate-200 shrink-0">
                      /m/
                    </span>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setSlug(toSlugPreview(e.target.value));
                      }}
                      placeholder="cantina-vila-mariana"
                      className="w-full min-h-[44px] px-3 py-2.5 text-sm font-mono focus:outline-none min-w-0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    WhatsApp com DDD *
                  </label>
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(11) 99988-7766"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Será normalizado para o formato internacional brasileiro (+55).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Seu nome
                    </label>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Cidade / UF
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ex: São Paulo - SP"
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Endereço de retirada
                  </label>
                  <input
                    type="text"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="Rua, número e bairro para retirada no balcão"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                E-mail *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@restaurante.com.br"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Senha *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {loading
                ? 'Processando...'
                : mode === 'register'
                ? 'Criar loja de demonstração'
                : 'Entrar no painel'}
            </button>
          </form>

          {mode === 'login' && (
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500">
                Contas de demonstração pré-cadastradas (senha: <span className="font-mono">demo1234</span>)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillDemoAccount('marco@fornonapolitano.demo')}
                  className="min-h-[44px] px-3 py-2 text-left text-xs rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <span className="block font-semibold text-slate-900">Forno Napolitano</span>
                  <span className="block text-slate-500 truncate font-mono">marco@fornonapolitano.demo</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount('lucas@pracasmash.demo')}
                  className="min-h-[44px] px-3 py-2 text-left text-xs rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <span className="block font-semibold text-slate-900">Praça Smash Burger</span>
                  <span className="block text-slate-500 truncate font-mono">lucas@pracasmash.demo</span>
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 text-center text-sm text-slate-600">
            {mode === 'register' ? (
              <button
                type="button"
                onClick={() => onNavigate('/entrar')}
                className="text-orange-700 hover:underline font-semibold min-h-[44px] cursor-pointer"
              >
                Já possui loja cadastrada? Entrar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('/cadastro')}
                className="text-orange-700 hover:underline font-semibold min-h-[44px] cursor-pointer"
              >
                Ainda não tem loja? Criar minha loja
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

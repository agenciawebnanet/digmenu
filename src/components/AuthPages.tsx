import React, { useEffect, useState } from 'react';
import {
  UtensilsCrossed,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Store,
  MessageSquare,
  Upload,
  KeyRound,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { readImageFileAsDataUrl } from '../lib/imageUpload';
import { AuthUser, PlatformConfig, StoreSummary } from '../types';
import { GoogleAuthButton } from './GoogleAuthButton';

interface AuthPagesProps {
  mode: 'login' | 'register' | 'reset';
  config: PlatformConfig | null;
  currentUser?: AuthUser | null;
  currentStores?: StoreSummary[];
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

const GOOGLE_ERROR_LABELS: Record<string, string> = {
  google_state_invalido: 'Não foi possível validar o retorno do Google. Tente novamente.',
  google_oauth_falhou: 'A autenticação com o Google falhou ou foi cancelada.',
};

export const AuthPages: React.FC<AuthPagesProps> = ({
  mode,
  config,
  currentUser,
  currentStores = [],
  onNavigate,
  onAuthSuccess,
}) => {
  const [userName, setUserName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [city, setCity] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Forgot/reset password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetInfo, setResetInfo] = useState('');
  const [previewResetToken, setPreviewResetToken] = useState('');

  const [pendingGoogleUser, setPendingGoogleUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isCompletingGoogleStore =
    Boolean(pendingGoogleUser) || (Boolean(currentUser) && currentStores.length === 0);

  const effectiveGoogleUser = pendingGoogleUser || (currentStores.length === 0 ? currentUser : null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get('erro');
    if (errCode) {
      setErrorMsg(GOOGLE_ERROR_LABELS[errCode] || 'Não foi possível autenticar com o Google.');
    }
    const tokenParam = params.get('token');
    if (tokenParam) {
      setResetToken(tokenParam);
    }
  }, [mode]);

  const handleStoreNameChange = (value: string) => {
    setStoreName(value);
    if (!slugManuallyEdited) {
      setSlug(toSlugPreview(value));
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    try {
      const dataUrl = await readImageFileAsDataUrl(file, 480, 0.85);
      setLogoUrl(dataUrl);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao carregar imagem do logotipo.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (isCompletingGoogleStore) {
        const res = await apiRequest<{ user: AuthUser; stores: StoreSummary[] }>(
          '/api/auth/complete-google-store',
          {
            method: 'POST',
            body: JSON.stringify({
              storeName: storeName.trim(),
              slug: slug.trim(),
              whatsapp: whatsapp.trim(),
              pickupAddress: pickupAddress.trim(),
              city: city.trim(),
              logoUrl: logoUrl.trim(),
            }),
          }
        );
        setPendingGoogleUser(null);
        onAuthSuccess(res.user, res.stores);
        onNavigate('/painel');
        return;
      }

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
            logoUrl: logoUrl.trim(),
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

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setResetInfo('');
    setPreviewResetToken('');
    setLoading(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        message: string;
        previewResetToken?: string;
      }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      setResetInfo(res.message);
      if (res.previewResetToken) {
        setPreviewResetToken(res.previewResetToken);
        setResetToken(res.previewResetToken);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao solicitar recuperação.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setResetInfo('');
    setLoading(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: resetToken.trim(),
          newPassword,
        }),
      });
      setResetInfo(res.message);
      setTimeout(() => onNavigate('/entrar'), 1400);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleGooglePreviewSuccess = (res: {
    user: AuthUser;
    stores: StoreSummary[];
    needsStoreSetup?: boolean;
  }) => {
    setErrorMsg('');
    onAuthSuccess(res.user, res.stores);
    if (res.needsStoreSetup || res.stores.length === 0) {
      setPendingGoogleUser(res.user);
      if (res.user.name && !userName) {
        setUserName(res.user.name);
      }
    } else {
      onNavigate('/painel');
    }
  };

  const fillDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('demo1234');
    setErrorMsg('');
  };

  const annualPriceText =
    config && config.annualPriceCents > 0 && config.annualPriceFormatted
      ? `${config.annualPriceFormatted}/ano`
      : 'Ciclo único anual (prévia)';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col lg:grid lg:grid-cols-12 overflow-x-hidden">
      {/* Left Brand & Architecture Panel (Desktop) */}
      <aside className="hidden lg:flex lg:col-span-5 bg-slate-950 text-white p-10 xl:p-12 flex-col justify-between relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_top_right,#ea580c_0%,transparent_55%)]"
        />

        <div className="relative z-10 space-y-8">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2.5 text-left cursor-pointer group"
          >
            <span className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-sm">
              <UtensilsCrossed className="w-5 h-5" />
            </span>
            <div>
              <span className="font-display text-xl font-extrabold tracking-tight block">
                DigMenu
              </span>
              <span className="text-xs text-slate-400">Cardápio digital multiempresa</span>
            </div>
          </button>

          <div className="space-y-3 pt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-400">
              Operação completa para restaurantes
            </p>
            <h2 className="font-display text-3xl font-extrabold leading-tight text-balance">
              {mode === 'register' || isCompletingGoogleStore
                ? 'Coloque o cardápio e o atendimento da sua loja no ar em minutos.'
                : mode === 'reset'
                ? 'Recupere o acesso ao seu painel com segurança.'
                : 'Acesse o painel isolado da sua loja.'}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Cardápio público, QR Code de mesas, tamanhos e adicionais, Cozinha (KDS), Garçom,
              PDV/Caixa e pedidos validados no WhatsApp.
            </p>
          </div>

          <div className="space-y-3.5 pt-2">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <Store className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-white">Separação total por restaurante</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Cada loja possui catálogo, equipe, mesas, caixa e endereço <span className="font-mono">/m/slug</span> exclusivos.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-white">Tempo real + WhatsApp validado</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Pedidos conferidos no servidor chegam instantaneamente no painel e na cozinha com alerta sonoro.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-white">Assinatura anual recorrente</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {annualPriceText} · Cobrança anual com renovação automática. Nenhuma cobrança real nesta prévia.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-8 border-t border-white/10 text-xs text-slate-400 flex items-center justify-between gap-4">
          <span>DigMenu SaaS · Prévia navegável</span>
          <button
            type="button"
            onClick={() => onNavigate('/suporte')}
            className="text-slate-300 hover:text-white underline cursor-pointer"
          >
            Suporte
          </button>
        </div>
      </aside>

      {/* Right Auth Form Column */}
      <main className="flex-1 lg:col-span-7 flex flex-col justify-center px-4 py-6 sm:px-8 lg:px-12">
        <div className="w-full max-w-lg mx-auto space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao início</span>
            </button>

            <div className="flex items-center gap-2 lg:hidden">
              <span className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center">
                <UtensilsCrossed className="w-4 h-4" />
              </span>
              <span className="font-display text-base font-extrabold text-slate-900">DigMenu</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
            {mode === 'reset' ? (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-orange-700 text-xs font-bold uppercase tracking-wider">
                    <KeyRound className="w-4 h-4" />
                    <span>Recuperação de acesso</span>
                  </div>
                  <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
                    Redefinir senha do lojista
                  </h1>
                  <p className="text-sm text-slate-600">
                    Solicite um token temporário pelo seu e-mail cadastrado e defina uma nova senha segura.
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

                {resetInfo && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm space-y-1.5">
                    <p className="font-semibold">{resetInfo}</p>
                    {previewResetToken && (
                      <p className="text-xs font-mono break-all bg-white/80 p-2 rounded-lg border border-emerald-200">
                        Token de prévia: {previewResetToken}
                      </p>
                    )}
                  </div>
                )}

                <form onSubmit={handleRequestReset} className="space-y-3 border-b border-slate-200 pb-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      1. Seu e-mail cadastrado
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="voce@restaurante.com.br"
                        className="flex-1 min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                      />
                      <button
                        type="submit"
                        disabled={loading}
                        className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-xl shrink-0 cursor-pointer"
                      >
                        Gerar token
                      </button>
                    </div>
                  </div>
                </form>

                <form onSubmit={handleConfirmReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      2. Token de redefinição
                    </label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Cole o token recebido"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Nova senha *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl cursor-pointer"
                  >
                    Salvar nova senha
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => onNavigate('/entrar')}
                  className="w-full min-h-[40px] text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Voltar para o login
                </button>
              </div>
            ) : (
              <>
                {!isCompletingGoogleStore && (
                  <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        onNavigate('/cadastro');
                      }}
                      className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                        mode === 'register'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Criar minha loja
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        onNavigate('/entrar');
                      }}
                      className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                        mode === 'login'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Entrar no painel
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
                    {isCompletingGoogleStore
                      ? 'Concluir criação da loja'
                      : mode === 'register'
                      ? 'Criar minha loja'
                      : 'Entrar no painel'}
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {isCompletingGoogleStore
                      ? `Conta Google autenticada (${effectiveGoogleUser?.email}). Preencha os dados do seu restaurante para gerar o cardápio público.`
                      : mode === 'register'
                      ? 'Acesso à demonstração em ambiente de prévia isolado. Nenhuma cobrança real será feita.'
                      : 'Acesse sua loja para gerenciar cardápio, pedidos, cozinha, garçom, PDV e assinatura anual.'}
                  </p>
                </div>

                {effectiveGoogleUser && isCompletingGoogleStore && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold truncate">{effectiveGoogleUser.name}</p>
                      <p className="text-xs text-emerald-800 truncate">{effectiveGoogleUser.email}</p>
                    </div>
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {!isCompletingGoogleStore && (
                  <div className="space-y-4">
                    <GoogleAuthButton
                      config={config}
                      audience="merchant"
                      returnTo="/painel"
                      label={mode === 'register' ? 'Cadastrar loja com Google' : 'Entrar com Google'}
                      onPreviewSuccess={handleGooglePreviewSuccess}
                      onError={(msg) => setErrorMsg(msg)}
                    />

                    <div className="relative flex items-center justify-center">
                      <div className="border-t border-slate-200 w-full" />
                      <span className="bg-white px-3 text-xs font-medium text-slate-400 uppercase tracking-wider shrink-0">
                        ou use e-mail e senha
                      </span>
                      <div className="border-t border-slate-200 w-full" />
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {(mode === 'register' || isCompletingGoogleStore) && (
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
                          Normalizado automaticamente para o formato internacional (+55).
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {!isCompletingGoogleStore && (
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
                        )}
                        <div className={isCompletingGoogleStore ? 'sm:col-span-2' : ''}>
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
                          Endereço de retirada (balcão)
                        </label>
                        <input
                          type="text"
                          value={pickupAddress}
                          onChange={(e) => setPickupAddress(e.target.value)}
                          placeholder="Rua, número e bairro"
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Logo da loja (opcional)
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 inline-flex items-center gap-2 cursor-pointer shrink-0">
                            <Upload className="w-4 h-4" />
                            <span>Enviar arquivo</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoFileChange}
                              className="hidden"
                            />
                          </label>
                          <input
                            type="text"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            placeholder="Ou cole a URL da logo"
                            className="flex-1 min-h-[44px] px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600 min-w-0"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {!isCompletingGoogleStore && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          E-mail do lojista *
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
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-slate-700">
                            Senha *
                          </label>
                          {mode === 'login' && (
                            <button
                              type="button"
                              onClick={() => onNavigate('/recuperar-senha')}
                              className="text-xs font-semibold text-orange-700 hover:underline cursor-pointer"
                            >
                              Esqueci minha senha
                            </button>
                          )}
                        </div>
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
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    {loading
                      ? 'Processando...'
                      : isCompletingGoogleStore
                      ? 'Finalizar criação da loja'
                      : mode === 'register'
                      ? 'Criar minha loja'
                      : 'Entrar no painel'}
                  </button>
                </form>

                {mode === 'login' && !isCompletingGoogleStore && (
                  <div className="pt-4 border-t border-slate-100 space-y-2.5">
                    <p className="text-xs font-semibold text-slate-500">
                      Lojistas de demonstração na prévia (senha: <span className="font-mono">demo1234</span>)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => fillDemoAccount('marco@fornonapolitano.demo')}
                        className="min-h-[44px] px-3 py-2 text-left text-xs rounded-xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50/40 transition-colors cursor-pointer"
                      >
                        <span className="block font-semibold text-slate-900">Forno Napolitano</span>
                        <span className="block text-slate-500 truncate font-mono">marco@fornonapolitano.demo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fillDemoAccount('lucas@pracasmash.demo')}
                        className="min-h-[44px] px-3 py-2 text-left text-xs rounded-xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50/40 transition-colors cursor-pointer"
                      >
                        <span className="block font-semibold text-slate-900">Praça Smash Burger</span>
                        <span className="block text-slate-500 truncate font-mono">lucas@pracasmash.demo</span>
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-center text-slate-500 leading-relaxed pt-1">
                  Clientes individuais compram sem precisar de conta de lojista diretamente pelo endereço público <span className="font-mono">/m/sua-loja</span>.
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

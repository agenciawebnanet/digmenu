import React, { useState } from 'react';
import { X, ShieldCheck, AlertCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { PlatformConfig } from '../types';

interface GoogleAuthButtonProps {
  config: PlatformConfig | null;
  audience: 'merchant' | 'customer';
  returnTo?: string;
  label?: string;
  onPreviewSuccess: (data: any) => void;
  onError?: (message: string) => void;
}

const GoogleGLogo: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  config,
  audience,
  returnTo = '/',
  label = 'Continuar com Google',
  onPreviewSuccess,
  onError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState(
    audience === 'customer' ? 'camila.google@cliente.demo' : 'pedroigooralves@gmail.com'
  );
  const [name, setName] = useState(audience === 'customer' ? 'Camila Google' : 'Pedro Alves');
  const [loading, setLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  const isLiveOAuth = Boolean(config?.googleAuth?.configured);

  const handleClick = () => {
    if (isLiveOAuth) {
      const qs = new URLSearchParams({
        audience,
        returnTo,
      });
      window.location.href = `/api/auth/google?${qs.toString()}`;
      return;
    }
    setModalError('');
    setModalOpen(true);
  };

  const handlePreviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setLoading(true);
    try {
      const res = await apiRequest<any>('/api/auth/google/preview', {
        method: 'POST',
        body: JSON.stringify({
          audience,
          email: email.trim(),
          name: name.trim(),
        }),
      });
      setModalOpen(false);
      onPreviewSuccess(res);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao autenticar com Google na prévia.';
      setModalError(msg);
      if (onError) onError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="w-full min-h-[46px] px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 flex items-center justify-center gap-2.5 transition-colors shadow-2xs cursor-pointer"
      >
        <GoogleGLogo />
        <span>{label}</span>
      </button>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Entrar com Google na prévia"
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xl"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <GoogleGLogo />
                <h3 className="font-display text-base font-bold text-slate-900">
                  Entrar com Google (Prévia)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar janela Google"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePreviewSubmit} className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  As chaves <span className="font-mono">GOOGLE_CLIENT_ID</span> e{' '}
                  <span className="font-mono">GOOGLE_CLIENT_SECRET</span> ainda não foram
                  adicionadas neste ambiente. Simule o retorno autenticado do Google abaixo para
                  testar o fluxo completo de{' '}
                  <strong>{audience === 'customer' ? 'cliente individual' : 'lojista'}</strong>.
                </p>
              </div>

              {modalError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome do perfil Google
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  E-mail Google
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl cursor-pointer"
                >
                  {loading ? 'Autenticando...' : 'Confirmar conta Google'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

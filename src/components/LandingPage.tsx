import React, { useState } from 'react';
import {
  UtensilsCrossed,
  ArrowRight,
  Check,
  Store,
  Clock,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import { PlatformConfig, StoreOperationalStatus } from '../types';

export interface DemoStoreItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
  city: string;
  operationalStatus: StoreOperationalStatus;
}

interface LandingPageProps {
  config: PlatformConfig | null;
  demoStores: DemoStoreItem[];
  isAuthenticated: boolean;
  onNavigate: (path: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  config,
  demoStores,
  isAuthenticated,
  onNavigate,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const annualPriceText =
    config && config.annualPriceCents > 0 && config.annualPriceFormatted
      ? `${config.annualPriceFormatted}/ano`
      : 'R$ —/ano (preço em definição)';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="flex items-center gap-2.5 shrink-0 whitespace-nowrap"
          >
            <span className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">
              DigMenu
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#recursos" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Recursos
            </a>
            <a href="#demonstracoes" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Demonstrações
            </a>
            <a href="#assinatura" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Assinatura anual
            </a>
          </nav>

          <div className="hidden md:flex items-center gap-4 shrink-0">
            {isAuthenticated ? (
              <button
                onClick={() => onNavigate('/painel')}
                className="px-4 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Acessar painel
              </button>
            ) : (
              <>
                <button
                  onClick={() => onNavigate('/entrar')}
                  className="px-3 py-2 min-h-[44px] text-sm font-semibold text-slate-700 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Entrar
                </button>
                <button
                  onClick={() => onNavigate('/cadastro')}
                  className="px-4 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Criar minha loja
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 py-4 space-y-2">
            <a
              href="#recursos"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2.5 text-sm font-medium text-slate-700"
            >
              Recursos
            </a>
            <a
              href="#demonstracoes"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2.5 text-sm font-medium text-slate-700"
            >
              Demonstrações
            </a>
            <a
              href="#assinatura"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2.5 text-sm font-medium text-slate-700"
            >
              Assinatura anual
            </a>
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              {isAuthenticated ? (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigate('/painel');
                  }}
                  className="w-full min-h-[44px] bg-orange-600 text-white rounded-xl text-sm font-semibold cursor-pointer"
                >
                  Acessar painel
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('/entrar');
                    }}
                    className="w-full min-h-[44px] bg-slate-100 text-slate-900 rounded-xl text-sm font-semibold cursor-pointer"
                  >
                    Entrar
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('/cadastro');
                    }}
                    className="w-full min-h-[44px] bg-orange-600 text-white rounded-xl text-sm font-semibold cursor-pointer"
                  >
                    Criar minha loja
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">
              Prévia isolada · Cardápio digital multiempresa
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 text-balance leading-[1.12]">
              Cardápio digital com link próprio e pedidos organizados no WhatsApp.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
              O DigMenu centraliza o catálogo do seu restaurante, calcula taxas de entrega por bairro,
              respeita horários de funcionamento e envia cada pedido conferido no servidor diretamente para o WhatsApp da loja.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => onNavigate(isAuthenticated ? '/painel' : '/cadastro')}
                className="min-h-[48px] px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>{isAuthenticated ? 'Ir para meu painel' : 'Criar minha loja'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#demonstracoes"
                className="min-h-[48px] px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl flex items-center justify-center transition-colors"
              >
                Ver cardápios de exemplo
              </a>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden shadow-sm">
              <img
                src="/images/rest_pizzaria_cover.jpg"
                alt="Restaurante operando com cardápio digital DigMenu"
                className="w-full h-56 sm:h-64 object-cover"
              />
              <div className="p-5 space-y-2 bg-white">
                <p className="text-xs font-semibold text-slate-500">Fluxo operacional completo</p>
                <p className="text-sm font-bold text-slate-900">
                  Cadastro da loja → Produtos e bairros → Link público /m/sua-loja → Pedido no WhatsApp
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Todos os valores e disponibilidade são conferidos no servidor antes de gerar a mensagem para o WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recursos objetivos */}
      <section id="recursos" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-10">
        <div className="max-w-2xl space-y-2">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            O que o DigMenu entrega para a operação do restaurante
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Funcionalidades focadas no atendimento diário de restaurantes brasileiros pelo celular.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-700 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Isolamento multiempresa</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cada restaurante possui conta, vínculo próprio, catálogo, pedidos, horários e endereço público <span className="font-mono text-xs">/m/[slug]</span> separados.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-700 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Entrega por bairro e retirada</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cadastre bairros atendidos com taxas específicas em reais e configure retirada no balcão com o endereço da loja.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Horários e pausa manual</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cálculo automático de Aberto ou Fechado pelo fuso da loja, incluindo turnos que passam da meia-noite, além de pausa imediata.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-700 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Pedido conferido no servidor</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Preços, taxas e disponibilidade são validados no backend sem duplicação por clique duplo antes de abrir o WhatsApp.
            </p>
          </div>
        </div>
      </section>

      {/* Demonstrações */}
      <section id="demonstracoes" className="bg-white border-y border-slate-200 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="max-w-2xl space-y-2">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              Cardápios de demonstração ao vivo
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Abra qualquer loja de exemplo diretamente pela rota pública, recarregue a página e teste sacola, cálculo de taxa e envio para o WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {demoStores.map((store) => (
              <div
                key={store.id}
                className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 flex flex-col"
              >
                <div className="relative h-44 bg-slate-200">
                  {store.coverUrl ? (
                    <img
                      src={store.coverUrl}
                      alt={store.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-500">
                      <Store className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <div className="p-5 bg-white flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-slate-900 truncate">{store.name}</h3>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border shrink-0 ${
                          store.operationalStatus.canAcceptOrders
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {store.operationalStatus.badgeLabel}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-2">{store.description}</p>
                    <p className="text-xs text-slate-500 font-mono truncate">
                      {store.city} · /m/{store.slug}
                    </p>
                  </div>

                  <button
                    onClick={() => onNavigate(`/m/${store.slug}`)}
                    className="w-full min-h-[44px] px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <span>Abrir cardápio /m/{store.slug}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Assinatura Exclusivamente Anual */}
      <section id="assinatura" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-700 text-sm font-semibold">
              <ShieldCheck className="w-5 h-5" />
              <span>Ciclo único anual</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              Assinatura anual do DigMenu
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Cobrança anual com renovação automática. Sem taxas por pedido e com painel completo para gerenciar catálogo, bairros e horários.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono tabular-nums">
                {annualPriceText}
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Cobrança anual com renovação automática (ciclo de 12 meses)
              </p>
            </div>
            <button
              onClick={() => onNavigate(isAuthenticated ? '/painel/assinatura' : '/cadastro')}
              className="min-h-[48px] px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              Testar assinatura anual
            </button>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700 pt-2">
            <li className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
              <span>Cardápio público próprio em /m/sua-loja</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
              <span>Envio de pedidos conferidos para o WhatsApp</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
              <span>QR Code geral da loja para divulgação</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
              <span>Cancelamento de renovação mantendo acesso até o fim do período vigente</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Footer com links válidos */}
      <footer className="bg-white border-t border-slate-200 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-600">
          <div className="space-y-1">
            <p className="font-bold text-slate-900 text-sm">DigMenu</p>
            <p>Ambiente de prévia isolado — nenhuma cobrança real está ativa.</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a
              href="/termos"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/termos');
              }}
              className="hover:text-slate-900 py-1"
            >
              Termos de Uso
            </a>
            <a
              href="/privacidade"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/privacidade');
              }}
              className="hover:text-slate-900 py-1"
            >
              Privacidade
            </a>
            <a
              href="/suporte"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/suporte');
              }}
              className="hover:text-slate-900 py-1"
            >
              Suporte
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

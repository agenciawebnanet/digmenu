import React, { useState } from 'react';
import { Restaurant } from '../../types';
import { 
  UtensilsCrossed, QrCode, Smartphone, Sparkles, 
  Check, ArrowRight, ShieldCheck, Zap, MessageSquare, 
  DollarSign, Star, Menu, X 
} from 'lucide-react';

interface LandingPageProps {
  restaurants: Restaurant[];
  onSelectRestaurantMenu: (restaurant: Restaurant) => void;
  onOpenAuth: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ restaurants, onSelectRestaurantMenu, onOpenAuth }) => {
  const [isAnnualBilling, setIsAnnualBilling] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-orange-500 selection:text-white">
      
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-8">
          
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-2.5 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-xl text-white shadow-lg shadow-orange-600/30">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-white whitespace-nowrap">
              Dig<span className="text-orange-500">Menu</span>
            </span>
          </div>

          {/* Zone 2: Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#recursos" className="hover:text-white transition-colors whitespace-nowrap shrink-0">Recursos</a>
            <a href="#cardapios" className="hover:text-white transition-colors whitespace-nowrap shrink-0">Cardápios Demo</a>
            <a href="#precos" className="hover:text-white transition-colors whitespace-nowrap shrink-0">Planos & Preços</a>
            <a href="#depoimentos" className="hover:text-white transition-colors whitespace-nowrap shrink-0">Depoimentos</a>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenAuth}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Fazer Login
            </button>
            <button
              onClick={onOpenAuth}
              className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 rounded-xl shadow-lg shadow-orange-600/25 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Criar Cardápio Grátis
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 p-6 space-y-4">
            <a href="#recursos" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-300 font-medium">Recursos</a>
            <a href="#cardapios" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-300 font-medium">Cardápios Demo</a>
            <a href="#precos" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-slate-300 font-medium">Planos & Preços</a>
            <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
              <button onClick={() => { setMobileMenuOpen(false); onOpenAuth(); }} className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold">Fazer Login</button>
              <button onClick={() => { setMobileMenuOpen(false); onOpenAuth(); }} className="w-full py-2.5 bg-orange-600 text-white rounded-xl text-xs font-bold">Criar Cardápio Grátis</button>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-28 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-950/40 via-slate-950 to-slate-950 -z-10" />
        
        <div className="max-w-5xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SaaS de Cardápio Digital Nº 1 para Restaurantes no Brasil</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Seu Cardápio Digital com <span className="bg-gradient-to-r from-orange-500 to-amber-400 bg-clip-text text-transparent">QR Code nas Mesas</span> e Pedidos no WhatsApp
          </h1>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Elimine taxas abusivas de marketplaces. Tenha sua própria plataforma de pedidos multiempresa com cardápio interativo, taxa de entrega por bairro e IA para descrições de pratos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={onOpenAuth}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold rounded-2xl shadow-xl shadow-orange-600/30 flex items-center justify-center gap-3 transition-all cursor-pointer text-base"
            >
              <span>Criar Cardápio do Restaurante</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <a
              href="#cardapios"
              className="w-full sm:w-auto px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors text-base"
            >
              <span>Ver Demonstrações ao Vivo</span>
            </a>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-12 border-t border-slate-800/80 max-w-4xl mx-auto text-left">
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">+1.200</p>
              <p className="text-xs text-slate-400">Restaurantes Ativos</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-orange-400 font-mono tabular-nums">0%</p>
              <p className="text-xs text-slate-400">Comissão sobre Vendas</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums">R$ 2.400</p>
              <p className="text-xs text-slate-400">Economia Média Mensal</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl sm:text-3xl font-bold text-amber-400 font-mono tabular-nums">99.9%</p>
              <p className="text-xs text-slate-400">Disponibilidade Cloud</p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Restaurants Showcase Section */}
      <section id="cardapios" className="py-20 px-6 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Experimente Cardápios Reais ao Vivo</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Clique em qualquer restaurante abaixo para testar o cardápio digital mobile-first, simular um pedido e testar o envio para o WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {restaurants.map(rest => (
              <div 
                key={rest.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl hover:border-orange-500/50 transition-all flex flex-col group"
              >
                <div className="relative h-48 bg-slate-950">
                  <img src={rest.coverImage} alt={rest.name} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                  <div className="absolute bottom-4 left-4 flex items-center gap-3">
                    <img src={rest.logo} alt={rest.name} className="w-14 h-14 rounded-xl object-cover border-2 border-white shadow-md bg-white" />
                    <div>
                      <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] font-bold rounded-md uppercase border border-orange-500/30">{rest.category}</span>
                      <h3 className="text-lg font-bold text-white mt-0.5">{rest.name}</h3>
                    </div>
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2 text-xs text-slate-300">
                    <p>📍 {rest.neighborhood}, {rest.city}</p>
                    <p>🕒 {rest.openingHours}</p>
                    <p>🛵 Taxa de Entrega: <strong className="text-white">R$ {rest.deliveryFee.toFixed(2)}</strong></p>
                  </div>

                  <button
                    onClick={() => onSelectRestaurantMenu(rest)}
                    className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
                  >
                    <span>Abrir Cardápio Digital Mobile</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="recursos" className="py-24 px-6 max-w-7xl mx-auto space-y-16">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white tracking-tight">Tudo que Seu Restaurante Precisa para Crescer</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Feito sob medida para o mercado brasileiro, combinando agilidade, zero comissão e praticidade no WhatsApp.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-orange-600/10 text-orange-500 rounded-2xl flex items-center justify-center border border-orange-500/20">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">QR Code Exclusivo por Mesa</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Gere QR codes instantâneos para mesas, comanda individual ou balcão. O cliente escaneia e faz o pedido direto da mesa.
            </p>
          </div>

          <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-emerald-600/10 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Pedidos Diretos no WhatsApp</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Cada pedido chega formatado perfeitamente no WhatsApp do seu estabelecimento com endereço, itens, opções e total.
            </p>
          </div>

          <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 bg-purple-600/10 text-purple-400 rounded-2xl flex items-center justify-center border border-purple-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Gerador de Pratos com IA</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Utilize inteligência artificial integrada para criar descrições gastronômicas irresistíveis que aumentam as vendas dos pratos.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precos" className="py-24 px-6 bg-slate-900/50 border-t border-slate-800">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-white tracking-tight">Assinatura Simples e Transparente</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Sem comissão sobre as vendas. Escolha o plano ideal para o seu negócio.
            </p>

            <div className="flex items-center justify-center gap-3 pt-4">
              <span className={`text-xs font-bold ${!isAnnualBilling ? 'text-white' : 'text-slate-400'}`}>Mensal</span>
              <button
                onClick={() => setIsAnnualBilling(!isAnnualBilling)}
                className="w-12 h-6 bg-orange-600 rounded-full p-1 transition-colors cursor-pointer relative"
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isAnnualBilling ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className={`text-xs font-bold ${isAnnualBilling ? 'text-white' : 'text-slate-400'}`}>Anual (30% OFF)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-bold rounded-full">Plano Mensal Flexível</span>
                <h3 className="text-3xl font-bold text-white">R$ 59,90<span className="text-sm font-normal text-slate-400">/mês</span></h3>
                <p className="text-xs text-slate-400">Para restaurantes que buscam total flexibilidade.</p>

                <div className="space-y-3 pt-4 border-t border-slate-800 text-sm text-slate-300">
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-orange-500" /><span>Cardápio digital ilimitado</span></div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-orange-500" /><span>Pedidos no WhatsApp</span></div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-orange-500" /><span>QR Code para mesas</span></div>
                </div>
              </div>

              <button
                onClick={onOpenAuth}
                className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors text-sm cursor-pointer"
              >
                Assinar Plano Mensal
              </button>
            </div>

            <div className="p-8 bg-gradient-to-b from-orange-950/40 to-slate-900 border-2 border-orange-500/50 rounded-3xl space-y-6 flex flex-col justify-between relative shadow-xl shadow-orange-600/10">
              <div className="absolute -top-3.5 right-8 px-4 py-1 bg-orange-600 text-white text-xs font-bold rounded-full shadow">
                Mais Popular
              </div>

              <div className="space-y-4">
                <span className="px-3 py-1 bg-orange-500/20 text-orange-400 text-xs font-bold rounded-full border border-orange-500/30">Plano Anual PRO</span>
                <h3 className="text-3xl font-bold text-white">R$ 47,90<span className="text-sm font-normal text-slate-400">/mês</span></h3>
                <p className="text-xs text-slate-300">Cobrado anualmente (R$ 574,80/ano). Economia de 30%.</p>

                <div className="space-y-3 pt-4 border-t border-slate-800 text-sm text-slate-200">
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-orange-500" /><span>Tudo do plano mensal</span></div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-orange-500" /><span>Gerador de pratos com IA</span></div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-orange-500" /><span>Suporte prioritário via WhatsApp</span></div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-orange-500" /><span>Domínio personalizado</span></div>
                </div>
              </div>

              <button
                onClick={onOpenAuth}
                className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-bold rounded-xl shadow-lg shadow-orange-600/30 transition-all text-sm cursor-pointer"
              >
                Assinar Plano Anual PRO
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12 px-6 bg-slate-950 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-600 rounded-lg text-white">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
            <span className="font-bold text-white text-sm">DigMenu SaaS</span>
          </div>

          <p>© 2026 DigMenu Brasil. Todos os direitos reservados. Feito para restaurantes brasileiros.</p>

          <div className="flex items-center gap-6">
            <a href="#recursos" className="hover:text-white">Termos de Uso</a>
            <a href="#recursos" className="hover:text-white">Privacidade</a>
            <a href="#recursos" className="hover:text-white">Suporte</a>
          </div>
        </div>
      </footer>

    </div>
  );
};

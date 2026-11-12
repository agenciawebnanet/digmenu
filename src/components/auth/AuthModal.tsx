import React, { useState } from 'react';
import { X, UtensilsCrossed, Lock, Mail, User, Phone } from 'lucide-react';
import { Restaurant } from '../../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (restaurant: Restaurant) => void;
  restaurants: Restaurant[];
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess, restaurants }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('contato@pizzarianapolitana.com.br');
  const [password, setPassword] = useState('******');
  const [restaurantName, setRestaurantName] = useState('');
  const [category, setCategory] = useState('Pizzaria');
  const [whatsapp, setWhatsapp] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister) {
      // Create new demo restaurant
      const newRest: Restaurant = {
        id: `rest-${Date.now()}`,
        slug: restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: restaurantName || 'Meu Restaurante Delícia',
        category: category,
        logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&auto=format&fit=crop&q=80',
        whatsapp: whatsapp || '5511999998888',
        pixKey: email,
        address: 'Rua Principal, 100',
        neighborhood: 'Centro',
        city: 'São Paulo - SP',
        deliveryFee: 8.00,
        freeDeliveryOver: 100.00,
        isOpen: true,
        openingHours: 'Terça a Domingo das 18h às 23h',
        primaryColor: '#f97316',
        categories: [
          { id: 'c-1', name: 'Destaques do Chef', description: 'Os pratos mais pedidos da casa.' },
          { id: 'c-2', name: 'Bebidas', description: 'Bebidas bem geladas.' }
        ],
        products: [
          {
            id: 'p-1',
            categoryId: 'c-1',
            name: 'Prato Especial da Casa',
            description: 'Experimente nossa receita exclusiva preparada com ingredientes frescos.',
            price: 49.90,
            imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
            available: true,
            highlight: true
          }
        ],
        subscription: {
          planId: 'pro',
          planName: 'Plano Pro Anual (Período de Testes)',
          billingCycle: 'annual',
          status: 'trial',
          expiresAt: '2027-12-31',
          price: 47.90
        }
      };
      onLoginSuccess(newRest);
    } else {
      // Login with default restaurant
      onLoginSuccess(restaurants[0]);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-6 text-white">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-white/15 rounded-xl">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold tracking-tight">Painel DigMenu</h3>
          </div>
          <p className="text-orange-100 text-sm">
            {isRegister ? 'Cadastre seu restaurante e crie seu cardápio em segundos.' : 'Acesse sua conta para gerenciar pedidos e cardápio.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Nome do Restaurante</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="Ex: Pizzaria Bella Napoli"
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Segmento</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="Pizzaria">Pizzaria</option>
                    <option value="Hamburgueria">Hamburgueria</option>
                    <option value="Japonesa">Comida Japonesa</option>
                    <option value="Cafeteria">Cafeteria / Doceria</option>
                    <option value="Restaurante">Restaurante / Prato Feito</option>
                    <option value="Açaí & Sorvete">Açaí & Sorveteria</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">WhatsApp do Pedido</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="11999998888"
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">E-mail de Acesso</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-semibold rounded-xl shadow-lg shadow-orange-600/20 transition-all cursor-pointer"
          >
            {isRegister ? 'Criar Meu Cardápio Agora' : 'Entrar no Painel'}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              {isRegister ? 'Já tem uma conta? Faça login' : 'Não tem conta? Cadastre seu restaurante'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

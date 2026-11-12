import React, { useState } from 'react';
import { Restaurant, Order, Product, ProductCategory } from '../../types';
import { AIAssistantModal } from '../ai/AIAssistantModal';
import { 
  LayoutDashboard, UtensilsCrossed, QrCode, ShoppingBag, 
  Settings, CreditCard, LogOut, ExternalLink, Sparkles, 
  Plus, Check, Trash2, Edit2, TrendingUp, DollarSign, 
  Clock, Users, Phone, MapPin, ShieldCheck, Download
} from 'lucide-react';

interface MerchantDashboardProps {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateRestaurant: (updated: Restaurant) => void;
  onUpdateOrders: (updatedOrders: Order[]) => void;
  onLogout: () => void;
  onOpenPublicMenu: () => void;
}

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ 
  restaurant, orders, onUpdateRestaurant, onUpdateOrders, onLogout, onOpenPublicMenu 
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'qrcodes' | 'orders' | 'settings' | 'subscription'>('overview');
  
  // Product & Category modal states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productName, setProductName] = useState('');
  const [productCategoryId, setProductCategoryId] = useState(restaurant.categories[0]?.id || '');
  const [productPrice, setProductPrice] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [productImage, setProductImage] = useState('');
  const [productHighlight, setProductHighlight] = useState(false);

  // AI Assistant modal state
  const [isAIOpen, setIsAIOpen] = useState(false);

  // Settings form states
  const [formName, setFormName] = useState(restaurant.name);
  const [formWhatsapp, setFormWhatsapp] = useState(restaurant.whatsapp);
  const [formPix, setFormPix] = useState(restaurant.pixKey);
  const [formDeliveryFee, setFormDeliveryFee] = useState(restaurant.deliveryFee.toString());
  const [formOpeningHours, setFormOpeningHours] = useState(restaurant.openingHours);

  // Calculate Stats
  const todayOrders = orders.filter(o => o.restaurantId === restaurant.id);
  const totalRevenue = todayOrders.reduce((acc, o) => acc + o.total, 0);
  const avgTicket = todayOrders.length > 0 ? totalRevenue / todayOrders.length : 0;

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const newProd: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      categoryId: productCategoryId,
      name: productName,
      description: productDesc,
      price: parseFloat(productPrice) || 0.00,
      imageUrl: productImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
      available: true,
      highlight: productHighlight,
      options: editingProduct?.options || [
        { id: 'opt-def', name: 'Adicional Padrão', price: 5.00 }
      ]
    };

    let updatedProducts = [...restaurant.products];
    if (editingProduct) {
      updatedProducts = updatedProducts.map(p => p.id === editingProduct.id ? newProd : p);
    } else {
      updatedProducts.push(newProd);
    }

    onUpdateRestaurant({
      ...restaurant,
      products: updatedProducts
    });

    setIsProductModalOpen(false);
    setEditingProduct(null);
    setProductName('');
    setProductPrice('');
    setProductDesc('');
    setProductImage('');
    setProductHighlight(false);
  };

  const handleDeleteProduct = (productId: string) => {
    if (confirm('Deseja realmente excluir este produto?')) {
      onUpdateRestaurant({
        ...restaurant,
        products: restaurant.products.filter(p => p.id !== productId)
      });
    }
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: Order['status']) => {
    const updated = orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
    onUpdateOrders(updated);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            <div className="p-2.5 bg-orange-600 rounded-xl text-white">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">DigMenu</h2>
              <p className="text-xs text-orange-400 font-medium">Painel do Lojista</p>
            </div>
          </div>

          <nav className="p-4 space-y-1.5">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'overview' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Visão Geral</span>
            </button>
            <button
              onClick={() => setActiveTab('menu')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'menu' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              <span>Cardápio & Produtos</span>
            </button>
            <button
              onClick={() => setActiveTab('qrcodes')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'qrcodes' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Codes de Mesas</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'orders' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Pedidos no WhatsApp</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'settings' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <Settings className="w-4 h-4" />
              <span>Configurações & Tema</span>
            </button>
            <button
              onClick={() => setActiveTab('subscription')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${activeTab === 'subscription' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Assinatura SaaS</span>
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={onOpenPublicMenu}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-orange-400 border border-orange-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Ver Cardápio Público</span>
          </button>
          <button
            onClick={onLogout}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-rose-950/50 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair do Painel</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto text-slate-100">
        
        {/* Top Header Bar */}
        <header className="flex items-center justify-between pb-6 mb-8 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{restaurant.name}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Gerenciamento multiempresa e pedidos via WhatsApp</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{restaurant.subscription.planName} (Ativo)</span>
            </span>
          </div>
        </header>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Faturamento Hoje</span>
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-3xl font-bold text-white tracking-tight">R$ {totalRevenue.toFixed(2)}</p>
                <p className="text-xs text-emerald-400 font-medium">+18% em relação a ontem</p>
              </div>

              <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Pedidos no WhatsApp</span>
                  <ShoppingBag className="w-5 h-5 text-orange-400" />
                </div>
                <p className="text-3xl font-bold text-white tracking-tight">{todayOrders.length}</p>
                <p className="text-xs text-orange-400 font-medium">100% integrados via WhatsApp</p>
              </div>

              <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Ticket Médio</span>
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                </div>
                <p className="text-3xl font-bold text-white tracking-tight">R$ {avgTicket.toFixed(2)}</p>
                <p className="text-xs text-indigo-400 font-medium">Por pedido finalizado</p>
              </div>

              <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Mesas Ativas (QR)</span>
                  <QrCode className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-3xl font-bold text-white tracking-tight">20</p>
                <p className="text-xs text-amber-400 font-medium">Mesas com QR Code gerado</p>
              </div>
            </div>

            {/* Recent Orders List */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Pedidos Recentes</h3>
                <button onClick={() => setActiveTab('orders')} className="text-xs text-orange-400 hover:text-orange-300 font-semibold">
                  Ver todos os pedidos →
                </button>
              </div>

              <div className="space-y-3">
                {todayOrders.map(order => (
                  <div key={order.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{order.id}</span>
                        <span className="text-xs text-slate-400">· {order.customerName}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${order.status === 'novo' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : order.status === 'preparando' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">
                        {order.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-orange-400">R$ {order.total.toFixed(2)}</span>
                      <select
                        value={order.status}
                        onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                        className="bg-slate-800 text-xs text-white px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="novo">Novo</option>
                        <option value="preparando">Preparando</option>
                        <option value="pronto">Pronto</option>
                        <option value="entregue">Entregue</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MENU & PRODUCTS */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">Gerenciamento de Cardápio</h3>
                <p className="text-xs text-slate-400 mt-0.5">Adicione pratos, categorias e use IA para criar descrições.</p>
              </div>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setProductName('');
                  setProductPrice('');
                  setProductDesc('');
                  setProductImage('');
                  setProductHighlight(false);
                  setIsProductModalOpen(true);
                }}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-600/20 flex items-center gap-2 transition-all cursor-pointer text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Produto</span>
              </button>
            </div>

            {restaurant.categories.map(cat => {
              const catProducts = restaurant.products.filter(p => p.categoryId === cat.id);
              return (
                <div key={cat.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-base font-bold text-white">{cat.name}</h4>
                      {cat.description && <p className="text-xs text-slate-400 mt-0.5">{cat.description}</p>}
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{catProducts.length} itens</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {catProducts.map(product => (
                      <div key={product.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex gap-4 items-center">
                        <img src={product.imageUrl} alt={product.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="text-sm font-bold text-white truncate">{product.name}</h5>
                            <span className="text-sm font-bold text-orange-400 shrink-0">R$ {product.price.toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-1 mt-1">{product.description}</p>
                          
                          <div className="flex items-center gap-3 mt-3">
                            <button
                              onClick={() => {
                                setEditingProduct(product);
                                setProductCategoryId(product.categoryId);
                                setProductName(product.name);
                                setProductPrice(product.price.toString());
                                setProductDesc(product.description);
                                setProductImage(product.imageUrl);
                                setProductHighlight(product.highlight || false);
                                setIsProductModalOpen(true);
                              }}
                              className="text-xs text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Excluir</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: QR CODES */}
        {activeTab === 'qrcodes' && (
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-xl font-bold text-white">QR Codes para Mesas & Salão</h3>
                <p className="text-xs text-slate-400 mt-0.5">Imprima e cole nas mesas do seu restaurante para pedidos diretos no celular do cliente.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(tableNum => (
                  <div key={tableNum} className="p-6 bg-white rounded-2xl text-slate-900 flex flex-col items-center text-center space-y-3 shadow-lg">
                    <span className="text-xs font-bold uppercase tracking-wider text-orange-600">{restaurant.name}</span>
                    <div className="p-4 bg-slate-100 rounded-xl border border-slate-200">
                      <QrCode className="w-24 h-24 text-slate-900" />
                    </div>
                    <span className="text-lg font-bold">Mesa {tableNum < 10 ? `0${tableNum}` : tableNum}</span>
                    <button
                      onClick={() => alert(`Baixando QR Code da Mesa ${tableNum} em alta resolução para impressão!`)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar PDF / PNG</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ORDERS & WHATSAPP */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-xl font-bold text-white">Central de Pedidos WhatsApp</h3>
              <p className="text-xs text-slate-400">Gerencie todos os pedidos recebidos através do seu cardápio digital DigMenu.</p>

              <div className="space-y-4 pt-2">
                {orders.map(order => (
                  <div key={order.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-base font-bold text-white">{order.id}</span>
                          <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">{order.orderType === 'delivery' ? 'Entrega' : order.orderType === 'pickup' ? 'Retirada' : order.tableNumber}</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">Cliente: <strong className="text-white">{order.customerName}</strong> ({order.customerPhone})</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-orange-400">R$ {order.total.toFixed(2)}</span>
                        <select
                          value={order.status}
                          onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                          className="bg-slate-800 text-xs text-white px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                        >
                          <option value="novo">Novo</option>
                          <option value="preparando">Preparando</option>
                          <option value="pronto">Pronto</option>
                          <option value="entregue">Entregue</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Itens:</p>
                      {order.items.map((item, idx) => (
                        <div key={idx} className="text-sm text-slate-200 flex justify-between">
                          <span>{item.quantity}x {item.productName} {item.selectedOptions?.length ? `(${item.selectedOptions.map(o=>o.name).join(', ')})` : ''}</span>
                          <span className="font-mono text-slate-400">R$ {(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {order.address && (
                      <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
                        📍 <strong>Endereço:</strong> {order.address} - {order.neighborhood}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SETTINGS & THEME */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4 max-w-2xl">
              <h3 className="text-xl font-bold text-white">Configurações do Restaurante</h3>
              <p className="text-xs text-slate-400">Altere dados cadastrais, chave Pix e horários de atendimento.</p>

              <form onSubmit={(e) => {
                e.preventDefault();
                onUpdateRestaurant({
                  ...restaurant,
                  name: formName,
                  whatsapp: formWhatsapp,
                  pixKey: formPix,
                  deliveryFee: parseFloat(formDeliveryFee) || 0,
                  openingHours: formOpeningHours
                });
                alert('Configurações salvas com sucesso!');
              }} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Nome do Restaurante</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">WhatsApp para Pedidos</label>
                    <input
                      type="text"
                      value={formWhatsapp}
                      onChange={(e) => setFormWhatsapp(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Chave Pix para Pagamento</label>
                    <input
                      type="text"
                      value={formPix}
                      onChange={(e) => setFormPix(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Taxa Padrão de Entrega (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formDeliveryFee}
                      onChange={(e) => setFormDeliveryFee(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Horário de Funcionamento</label>
                    <input
                      type="text"
                      value={formOpeningHours}
                      onChange={(e) => setFormOpeningHours(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-600/20 transition-all cursor-pointer text-sm"
                >
                  Salvar Alterações
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 6: SUBSCRIPTION & BILLING */}
        {activeTab === 'subscription' && (
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-6 max-w-3xl">
              <div>
                <h3 className="text-xl font-bold text-white">Assinatura Recorrente DigMenu</h3>
                <p className="text-xs text-slate-400 mt-0.5">Gerencie seu plano anual ou mensal e histórico de faturas.</p>
              </div>

              <div className="p-6 bg-gradient-to-r from-orange-950/40 to-amber-950/40 border border-orange-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-orange-400" />
                    <span className="text-base font-bold text-white">{restaurant.subscription.planName}</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded">Ativo</span>
                  </div>
                  <p className="text-xs text-slate-300">Renovação automática em {restaurant.subscription.expiresAt}. Sem fidelidade abusiva.</p>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold text-orange-400">R$ {restaurant.subscription.price.toFixed(2)}<span className="text-xs text-slate-400 font-normal">/mês</span></p>
                  <p className="text-[11px] text-slate-400">Cobrado anualmente (Economia de 30%)</p>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <h4 className="text-sm font-bold text-white">Planos Disponíveis</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                    <h5 className="font-bold text-white">Plano Mensal Flexível</h5>
                    <p className="text-xs text-slate-400">Ideal para restaurantes que desejam flexibilidade total.</p>
                    <p className="text-xl font-bold text-white">R$ 59,90<span className="text-xs font-normal text-slate-400">/mês</span></p>
                    <button onClick={() => alert('Plano alterado para Mensal com sucesso!')} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer">
                      Mudar para Mensal
                    </button>
                  </div>

                  <div className="p-5 bg-orange-600/10 border border-orange-500/40 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                      <h5 className="font-bold text-white">Plano Anual PRO (Recomendado)</h5>
                      <span className="px-2 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded">Melhor Valor</span>
                    </div>
                    <p className="text-xs text-slate-300">QR Code ilimitado, suporte prioritário e IA de pratos.</p>
                    <p className="text-xl font-bold text-orange-400">R$ 47,90<span className="text-xs font-normal text-slate-400">/mês</span></p>
                    <button className="w-full py-2 bg-orange-600 text-white rounded-xl text-xs font-bold cursor-pointer shadow-lg shadow-orange-600/20">
                      Plano Atual Ativo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ex: Pizza Quatro Queijos"
                  className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Categoria</label>
                  <select
                    value={productCategoryId}
                    onChange={(e) => setProductCategoryId(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {restaurant.categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    placeholder="45.90"
                    className="w-full px-3 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Descrição</label>
                  <button
                    type="button"
                    onClick={() => setIsAIOpen(true)}
                    className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Gerar com IA</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  placeholder="Ingredientes e detalhes apetitosos..."
                  className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">URL da Foto</label>
                <input
                  type="text"
                  value={productImage}
                  onChange={(e) => setProductImage(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-4 py-2.5 text-sm rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="highlight"
                  checked={productHighlight}
                  onChange={(e) => setProductHighlight(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 bg-slate-950 border-slate-800"
                />
                <label htmlFor="highlight" className="text-xs font-medium text-slate-300">Destacar como "Mais Pedido" no cardápio</label>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-600/20 transition-all cursor-pointer text-sm"
              >
                Salvar Produto
              </button>
            </form>
          </div>
        </div>
      )}

      {/* AI Assistant Modal */}
      <AIAssistantModal
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        onSelectDescription={(desc) => setProductDesc(desc)}
      />
    </div>
  );
};

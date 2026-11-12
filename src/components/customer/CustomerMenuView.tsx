import React, { useState } from 'react';
import { Restaurant, Product, OrderItem, Order } from '../../types';
import { 
  ShoppingBag, Search, Phone, MapPin, Clock, 
  CheckCircle2, AlertCircle, Plus, Minus, X, 
  ChevronRight, Smartphone, Monitor, Send, QrCode
} from 'lucide-react';

interface CustomerMenuViewProps {
  restaurant: Restaurant;
  onBackToSaaS: () => void;
  onNewOrder: (order: Order) => void;
}

export const CustomerMenuView: React.FC<CustomerMenuViewProps> = ({ restaurant, onBackToSaaS, onNewOrder }) => {
  const [activeCategory, setActiveCategory] = useState<string>(restaurant.categories[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [itemNotes, setItemNotes] = useState('');
  
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isMobileFrame, setIsMobileFrame] = useState(true);

  // Checkout form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<'delivery' | 'pickup' | 'table'>('delivery');
  const [tableNumber, setTableNumber] = useState('Mesa 01');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState(restaurant.neighborhood || 'Centro');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit' | 'cash'>('pix');
  const [changeFor, setChangeFor] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(false);

  const filteredProducts = restaurant.products.filter(p => {
    const matchesCat = activeCategory ? p.categoryId === activeCategory : true;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleAddToCart = () => {
    if (!selectedProduct) return;

    const chosenOpts = selectedProduct.options?.filter(o => selectedOptions.includes(o.id)) || [];
    const optionTotal = chosenOpts.reduce((acc, o) => acc + o.price, 0);
    const unitPrice = selectedProduct.price + optionTotal;

    const newItem: OrderItem = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      price: unitPrice,
      quantity: productQuantity,
      selectedOptions: chosenOpts,
      notes: itemNotes
    };

    setCart([...cart, newItem]);
    setSelectedProduct(null);
    setProductQuantity(1);
    setSelectedOptions([]);
    setItemNotes('');
    setIsCartOpen(true);
  };

  const updateCartItemQty = (index: number, delta: number) => {
    const updated = [...cart];
    updated[index].quantity += delta;
    if (updated[index].quantity <= 0) {
      updated.splice(index, 1);
    }
    setCart(updated);
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const deliveryFee = orderType === 'delivery' ? (subtotal >= (restaurant.freeDeliveryOver || 9999) ? 0 : restaurant.deliveryFee) : 0;
  const total = subtotal + deliveryFee;

  const handleFinishOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const newOrder: Order = {
      id: `PED-${Math.floor(1000 + Math.random() * 9000)}`,
      restaurantId: restaurant.id,
      customerName,
      customerPhone,
      orderType,
      tableNumber: orderType === 'table' ? tableNumber : undefined,
      address: orderType === 'delivery' ? address : undefined,
      neighborhood: orderType === 'delivery' ? neighborhood : undefined,
      paymentMethod,
      changeFor: paymentMethod === 'cash' ? changeFor : undefined,
      items: cart,
      subtotal,
      deliveryFee,
      total,
      status: 'novo',
      createdAt: 'Agora mesmo'
    };

    onNewOrder(newOrder);

    // Build WhatsApp Message
    const itemsText = cart.map(i => `• ${i.quantity}x ${i.productName} (R$ ${(i.price * i.quantity).toFixed(2)})` + (i.selectedOptions?.length ? `\n   _Opções: ${i.selectedOptions.map(o => o.name).join(', ')}_` : '')).join('\n');
    
    let deliveryText = '';
    if (orderType === 'delivery') {
      deliveryText = `🛵 *Entrega a Domicílio*\n📍 Endereço: ${address} - ${neighborhood}`;
    } else if (orderType === 'pickup') {
      deliveryText = `🛍️ *Retirada no Balcão*`;
    } else {
      deliveryText = `🪑 *Consumo no Salão* (${tableNumber})`;
    }

    const paymentText = paymentMethod === 'pix' ? 'Pix (Chave: ' + restaurant.pixKey + ')' : paymentMethod === 'credit' ? 'Cartão na Entrega/Retirada' : `Dinheiro (Troco para R$ ${changeFor})`;

    const message = encodeURIComponent(
      `*NOVO PEDIDO - ${restaurant.name.toUpperCase()}* 🚀\n\n` +
      `👤 *Cliente:* ${customerName}\n` +
      `📱 *Telefone:* ${customerPhone}\n\n` +
      `📦 *Itens do Pedido:*\n${itemsText}\n\n` +
      `💰 *Subtotal:* R$ ${subtotal.toFixed(2)}\n` +
      `🚚 *Taxa de Entrega:* R$ ${deliveryFee.toFixed(2)}\n` +
      `💵 *TOTAL: R$ ${total.toFixed(2)}*\n\n` +
      `${deliveryText}\n` +
      `💳 *Pagamento:* ${paymentText}\n\n` +
      `_Enviado via DigMenu - Cardápio Digital_`
    );

    // Open WhatsApp
    const waUrl = `https://wa.me/${restaurant.whatsapp}?text=${message}`;
    window.open(waUrl, '_blank');

    setOrderSuccess(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 py-6 px-4 flex flex-col items-center">
      {/* Top Demo Bar */}
      <div className="w-full max-w-5xl mb-4 flex items-center justify-between bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-xl text-white text-sm">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 bg-orange-500/20 text-orange-400 font-semibold text-xs rounded-lg border border-orange-500/30">
            Cardápio Público
          </span>
          <span className="text-slate-300 font-medium hidden sm:inline">Visualizando: {restaurant.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setIsMobileFrame(true)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${isMobileFrame ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Celular</span>
            </button>
            <button
              onClick={() => setIsMobileFrame(false)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${!isMobileFrame ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Tela Cheia</span>
            </button>
          </div>

          <button
            onClick={onBackToSaaS}
            className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg text-xs transition-colors"
          >
            Voltar ao Início do SaaS
          </button>
        </div>
      </div>

      {/* Menu Container (Device Frame or Full) */}
      <div className={`transition-all duration-300 bg-white shadow-2xl overflow-hidden flex flex-col ${isMobileFrame ? 'w-full max-w-[420px] rounded-[36px] border-[10px] border-slate-800 min-h-[820px]' : 'w-full max-w-4xl rounded-2xl min-h-[800px]'}`}>
        
        {/* Restaurant Header */}
        <div className="relative h-48 sm:h-56 bg-slate-900">
          <img 
            src={restaurant.coverImage} 
            alt={restaurant.name} 
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
          
          <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3.5">
            <img 
              src={restaurant.logo} 
              alt={restaurant.name} 
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white shadow-lg shrink-0 bg-white"
            />
            <div className="text-white flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-2.5 h-2.5 rounded-full ${restaurant.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-xs font-semibold tracking-wide uppercase text-orange-400">
                  {restaurant.isOpen ? 'Aberto agora' : 'Fechado no momento'}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold truncate text-white">{restaurant.name}</h1>
              <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="truncate">{restaurant.neighborhood}, {restaurant.city}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Info Strip */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
            <span>{restaurant.openingHours}</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-slate-900">
            <span>Taxa: R$ {restaurant.deliveryFee.toFixed(2)}</span>
          </div>
        </div>

        {/* Search & Categories */}
        <div className="p-4 bg-white border-b border-slate-100 space-y-3 sticky top-0 z-20 shadow-xs">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar prato, bebida, ingrediente..."
              className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-slate-100 border-none focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Categories Horizontal Scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {restaurant.categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${activeCategory === cat.id ? 'bg-orange-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 p-4 space-y-3 overflow-y-auto bg-slate-50/50 pb-28">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 text-sm">Nenhum produto encontrado nesta categoria.</p>
            </div>
          ) : (
            filteredProducts.map(product => (
              <div
                key={product.id}
                onClick={() => {
                  setSelectedProduct(product);
                  setProductQuantity(1);
                  setSelectedOptions([]);
                  setItemNotes('');
                }}
                className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-orange-300 transition-all flex gap-3.5 cursor-pointer group"
              >
                <img 
                  src={product.imageUrl} 
                  alt={product.name} 
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 bg-slate-100 group-hover:scale-102 transition-transform"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors line-clamp-1">{product.name}</h3>
                      {product.highlight && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-md shrink-0">Mais Pedido</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{product.description}</p>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <span className="text-sm font-bold text-slate-900">
                      R$ {product.price.toFixed(2)}
                    </span>
                    <span className="w-7 h-7 bg-orange-50 group-hover:bg-orange-600 group-hover:text-white text-orange-600 rounded-lg flex items-center justify-center transition-colors">
                      <Plus className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Floating Cart Bar */}
        {cart.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg flex items-center justify-between z-30">
            <div>
              <p className="text-xs text-slate-500 font-medium">{cart.reduce((a, b) => a + b.quantity, 0)} itens na sacola</p>
              <p className="text-base font-bold text-slate-900">R$ {total.toFixed(2)}</p>
            </div>
            <button
              onClick={() => setIsCartOpen(true)}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-5 h-5" />
              <span>Ver Sacola & Pedir</span>
            </button>
          </div>
        )}

      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 z-10 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative h-48 bg-slate-100">
              <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedProduct.name}</h3>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{selectedProduct.description}</p>
                <p className="text-lg font-bold text-orange-600 mt-2">R$ {selectedProduct.price.toFixed(2)}</p>
              </div>

              {selectedProduct.options && selectedProduct.options.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">Opções & Adicionais</label>
                  {selectedProduct.options.map(opt => {
                    const isSelected = selectedOptions.includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedOptions(selectedOptions.filter(id => id !== opt.id));
                          } else {
                            setSelectedOptions([...selectedOptions, opt.id]);
                          }
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isSelected ? 'border-orange-500 bg-orange-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <span className="text-sm font-medium text-slate-800">{opt.name}</span>
                        <span className="text-sm font-bold text-orange-600">+ R$ {opt.price.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Observações para a cozinha</label>
                <input
                  type="text"
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="Ex: Sem cebola, maionese à parte..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <div className="flex items-center gap-3 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))}
                    className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-700 shadow-xs hover:bg-slate-50 cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-bold text-slate-900">{productQuantity}</span>
                  <button
                    onClick={() => setProductQuantity(productQuantity + 1)}
                    className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-700 shadow-xs hover:bg-slate-50 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={handleAddToCart}
                  className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-600/20 transition-all cursor-pointer"
                >
                  Adicionar · R$ {((selectedProduct.price + (selectedProduct.options?.filter(o => selectedOptions.includes(o.id)).reduce((a,b)=>a+b.price,0) || 0)) * productQuantity).toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart & Checkout Drawer / Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 bg-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                <h3 className="text-lg font-bold">Sua Sacola</h3>
              </div>
              <button onClick={() => setIsCartOpen(false)} className="p-1 text-white/80 hover:text-white rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {orderSuccess ? (
              <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Pedido Enviado com Sucesso!</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Seu pedido foi aberto no WhatsApp do restaurante <strong className="text-slate-900">{restaurant.name}</strong>. Acompanhe o status por lá!
                </p>
                <button
                  onClick={() => {
                    setCart([]);
                    setOrderSuccess(false);
                    setIsCartOpen(false);
                  }}
                  className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Fazer Novo Pedido
                </button>
              </div>
            ) : !isCheckoutOpen ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  {cart.map((item, idx) => (
                    <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-slate-900">{item.productName}</h4>
                        {item.selectedOptions && item.selectedOptions.length > 0 && (
                          <p className="text-xs text-orange-600 mt-0.5">{item.selectedOptions.map(o => o.name).join(', ')}</p>
                        )}
                        {item.notes && <p className="text-xs text-slate-500 italic mt-0.5">Obs: "{item.notes}"</p>}
                        <p className="text-xs font-semibold text-slate-700 mt-1">R$ {(item.price * item.quantity).toFixed(2)}</p>
                      </div>

                      <div className="flex items-center gap-2 bg-white border border-slate-200 p-1 rounded-lg">
                        <button onClick={() => updateCartItemQty(idx, -1)} className="p-1 text-slate-600 hover:text-slate-900">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateCartItemQty(idx, 1)} className="p-1 text-slate-600 hover:text-slate-900">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-bold text-slate-900">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Taxa de Entrega</span>
                    <span className="font-bold text-slate-900">R$ {deliveryFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-base border-t border-slate-200 pt-3">
                    <span className="font-bold text-slate-900">Total do Pedido</span>
                    <span className="font-bold text-orange-600 text-lg">R$ {total.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={() => setIsCheckoutOpen(true)}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Send className="w-5 h-5" />
                    <span>Continuar para Dados & WhatsApp</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleFinishOrder} className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  <button
                    type="button"
                    onClick={() => setIsCheckoutOpen(false)}
                    className="text-xs text-orange-600 font-semibold hover:underline"
                  >
                    ← Voltar para a sacola
                  </button>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Seu Nome Completo</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Seu WhatsApp / Telefone</label>
                    <input
                      type="text"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(11) 99999-8888"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Tipo de Recebimento</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setOrderType('delivery')}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-colors ${orderType === 'delivery' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-200'}`}
                      >
                        Entrega
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderType('pickup')}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-colors ${orderType === 'pickup' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-200'}`}
                      >
                        Retirada
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderType('table')}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-colors ${orderType === 'table' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-200'}`}
                      >
                        Na Mesa
                      </button>
                    </div>
                  </div>

                  {orderType === 'delivery' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Endereço (Rua, Número, Apto)</label>
                        <input
                          type="text"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Ex: Rua das Palmeiras, 220 - Apto 31"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Bairro</label>
                        <input
                          type="text"
                          required
                          value={neighborhood}
                          onChange={(e) => setNeighborhood(e.target.value)}
                          placeholder="Ex: Jardim Paulista"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                  )}

                  {orderType === 'table' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Número da Mesa</label>
                      <input
                        type="text"
                        required
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="Ex: Mesa 04"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Forma de Pagamento</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('pix')}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-colors ${paymentMethod === 'pix' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-200'}`}
                      >
                        Pix
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('credit')}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-colors ${paymentMethod === 'credit' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-200'}`}
                      >
                        Cartão
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-colors ${paymentMethod === 'cash' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-200'}`}
                      >
                        Dinheiro
                      </button>
                    </div>
                  </div>

                  {paymentMethod === 'pix' && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                      <p className="font-bold">Chave Pix do Restaurante:</p>
                      <p className="font-mono bg-white p-2 rounded border border-amber-200 text-center select-all">{restaurant.pixKey}</p>
                      <p className="text-[11px] text-amber-800">O comprovante poderá ser enviado no WhatsApp junto com o pedido.</p>
                    </div>
                  )}

                  {paymentMethod === 'cash' && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">Troco para quanto?</label>
                      <input
                        type="text"
                        value={changeFor}
                        onChange={(e) => setChangeFor(e.target.value)}
                        placeholder="Ex: R$ 100,00 (ou deixar em branco se não precisar)"
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200">
                  <button
                    type="submit"
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer text-base"
                  >
                    <Send className="w-5 h-5" />
                    <span>Enviar Pedido no WhatsApp (R$ {total.toFixed(2)})</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

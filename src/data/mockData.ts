import { Restaurant, Order } from '../types';

export const INITIAL_RESTAURANTS: Restaurant[] = [
  {
    id: 'rest-1',
    slug: 'pizzaria-napolitana',
    name: 'Pizzaria Napolitana & Artesanal',
    category: 'Pizzaria',
    logo: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=150&auto=format&fit=crop&q=80',
    coverImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
    whatsapp: '5511999887766',
    pixKey: 'financeiro@pizzarianapolitana.com.br',
    address: 'Rua das Flores, 450',
    neighborhood: 'Jardim Paulista',
    city: 'São Paulo - SP',
    deliveryFee: 9.00,
    freeDeliveryOver: 120.00,
    isOpen: true,
    openingHours: 'Terça a Domingo das 18h às 23:30',
    primaryColor: '#ea580c', // orange-600
    categories: [
      { id: 'cat-1', name: 'Pizzas Salgadas Tradicionais', description: 'Massa fermentada por 48h, molho de tomates frescos e muito amor.' },
      { id: 'cat-2', name: 'Pizzas Especiais da Casa', description: 'Combinações exclusivas do nosso Chef pizzaiolo.' },
      { id: 'cat-3', name: 'Bebidas & Cervejas', description: 'Refrigerantes gelados e cervejas artesanais.' }
    ],
    products: [
      {
        id: 'prod-1',
        categoryId: 'cat-1',
        name: 'Pizza Margherita Especial',
        description: 'Molho de tomate artesanal, mozzarella de búfala fresca, manjericão roxo e azeite extravirgem.',
        price: 68.90,
        imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=600&auto=format&fit=crop&q=80',
        available: true,
        highlight: true,
        options: [
          { id: 'opt-1', name: 'Borda Recheada com Catupiry', price: 12.00 },
          { id: 'opt-2', name: 'Borda Recheada com Cheddar', price: 12.00 }
        ]
      },
      {
        id: 'prod-2',
        categoryId: 'cat-1',
        name: 'Pizza Calabresa Artesanal',
        description: 'Calabresa artesanal fatiada fina, cebolas roxas grelhadas, azeitonas pretas e orégano.',
        price: 72.00,
        imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
        available: true,
        highlight: false,
        options: [
          { id: 'opt-1', name: 'Borda Recheada com Catupiry', price: 12.00 }
        ]
      },
      {
        id: 'prod-3',
        categoryId: 'cat-2',
        name: 'Pizza Trufada com Parma',
        description: 'Mozzarella, presunto de Parma italiano curado 18 meses, lâminas de parmesão e toque de azeite trufado.',
        price: 98.50,
        imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80',
        available: true,
        highlight: true,
        options: [
          { id: 'opt-1', name: 'Massa Integral', price: 6.00 }
        ]
      },
      {
        id: 'prod-4',
        categoryId: 'cat-3',
        name: 'Coca-Cola Zero 2 Litros',
        description: 'Garrafa pet gelada.',
        price: 14.00,
        imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
        available: true,
        highlight: false
      },
      {
        id: 'prod-5',
        categoryId: 'cat-3',
        name: 'Cerveja IPA Artesanal 500ml',
        description: 'Cerveja artesanal local com notas cítricas.',
        price: 22.00,
        imageUrl: 'https://images.unsplash.com/photo-1608270154042-4f014e214d02?w=600&auto=format&fit=crop&q=80',
        available: true,
        highlight: false
      }
    ],
    subscription: {
      planId: 'pro',
      planName: 'Plano Pro Anual',
      billingCycle: 'annual',
      status: 'active',
      expiresAt: '2027-12-31',
      price: 47.90
    }
  },
  {
    id: 'rest-2',
    slug: 'burger-da-praca',
    name: 'Burger da Praça & Grill',
    category: 'Hamburgueria',
    logo: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=150&auto=format&fit=crop&q=80',
    coverImage: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=1200&auto=format&fit=crop&q=80',
    whatsapp: '5511988776655',
    pixKey: 'pix@burgerdapraca.com.br',
    address: 'Av. Brigadeiro Luis Antonio, 1200',
    neighborhood: 'Centro',
    city: 'São Paulo - SP',
    deliveryFee: 7.50,
    freeDeliveryOver: 90.00,
    isOpen: true,
    openingHours: 'Todos os dias das 17h às 00h',
    primaryColor: '#dc2626', // red-600
    categories: [
      { id: 'cat-b1', name: 'Smash Burgers', description: 'Blend artesanal de 100g de carne angus smashada na chapa.' },
      { id: 'cat-b2', name: 'Burgers Especiais', description: 'Pães brioche artesanal e carnes de 180g.' },
      { id: 'cat-b3', name: 'Acompanhamentos & Batatas', description: 'Batatas rústicas, fritas com cheddar e bacon.' }
    ],
    products: [
      {
        id: 'prod-b1',
        categoryId: 'cat-b1',
        name: 'Smash Duplo Cheddar Crispy',
        description: 'Dois blends angus de 100g, muito queijo cheddar cremoso, bacon crispy e molho especial da casa no pão brioche.',
        price: 38.90,
        imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
        available: true,
        highlight: true,
        options: [
          { id: 'opt-b1', name: 'Adicionar Bacon Extra', price: 6.00 },
          { id: 'opt-b2', name: 'Trocar por Batata Frita Média', price: 9.00 }
        ]
      },
      {
        id: 'prod-b2',
        categoryId: 'cat-b2',
        name: 'Burger Gorgonzola & Pera',
        description: 'Blend 180g, creme de gorgonzola artesanal, fatias de pera caramelizada e rúcula fresca.',
        price: 46.00,
        imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
        available: true,
        highlight: false
      },
      {
        id: 'prod-b3',
        categoryId: 'cat-b3',
        name: 'Batata Rústica com Alecrim',
        description: 'Batatas batidas e assadas com páprica, alecrim fresco e maionese verde da casa.',
        price: 24.00,
        imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
        available: true,
        highlight: false
      }
    ],
    subscription: {
      planId: 'pro',
      planName: 'Plano Pro Anual',
      billingCycle: 'annual',
      status: 'active',
      expiresAt: '2027-10-15',
      price: 47.90
    }
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'PED-1049',
    restaurantId: 'rest-1',
    customerName: 'Carlos Eduardo Silva',
    customerPhone: '(11) 98765-4321',
    orderType: 'delivery',
    address: 'Rua Augusta, 1500 - Apto 42',
    neighborhood: 'Consolação',
    paymentMethod: 'pix',
    items: [
      { productId: 'prod-1', productName: 'Pizza Margherita Especial', price: 68.90, quantity: 1, selectedOptions: [{ id: 'opt-1', name: 'Borda Recheada com Catupiry', price: 12.00 }] },
      { productId: 'prod-4', productName: 'Coca-Cola Zero 2 Litros', price: 14.00, quantity: 1 }
    ],
    subtotal: 94.90,
    deliveryFee: 9.00,
    total: 103.90,
    status: 'preparando',
    createdAt: 'Hoje, 19:42'
  },
  {
    id: 'PED-1048',
    restaurantId: 'rest-1',
    customerName: 'Mariana Costa',
    customerPhone: '(11) 97711-2233',
    orderType: 'table',
    tableNumber: 'Mesa 05',
    paymentMethod: 'credit',
    items: [
      { productId: 'prod-3', productName: 'Pizza Trufada com Parma', price: 98.50, quantity: 1 },
      { productId: 'prod-5', productName: 'Cerveja IPA Artesanal 500ml', price: 22.00, quantity: 2 }
    ],
    subtotal: 142.50,
    deliveryFee: 0,
    total: 142.50,
    status: 'novo',
    createdAt: 'Hoje, 20:05'
  }
];

export interface ProductOption {
  id: string;
  name: string;
  price: number;
}

export interface ProductCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  available: boolean;
  highlight?: boolean;
  options?: ProductOption[];
}

export interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  selectedOptions?: ProductOption[];
  notes?: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  orderType: 'delivery' | 'pickup' | 'table';
  tableNumber?: string;
  address?: string;
  neighborhood?: string;
  paymentMethod: 'pix' | 'credit' | 'cash';
  changeFor?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: 'novo' | 'preparando' | 'pronto' | 'entregue' | 'cancelado';
  createdAt: string;
}

export interface RestaurantSubscription {
  planId: 'basic' | 'pro' | 'enterprise';
  planName: string;
  billingCycle: 'monthly' | 'annual';
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  expiresAt: string;
  price: number;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  category: string;
  logo: string;
  coverImage: string;
  whatsapp: string;
  pixKey: string;
  address: string;
  neighborhood: string;
  city: string;
  deliveryFee: number;
  freeDeliveryOver?: number;
  isOpen: boolean;
  openingHours: string;
  primaryColor: string;
  categories: ProductCategory[];
  products: Product[];
  subscription: RestaurantSubscription;
}

export type ViewMode = 'landing' | 'dashboard' | 'customer' | 'auth';

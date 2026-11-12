import React, { useState, useEffect } from 'react';
import { ViewMode, Restaurant, Order } from './types';
import { INITIAL_RESTAURANTS, INITIAL_ORDERS } from './data/mockData';
import { LandingPage } from './components/landing/LandingPage';
import { MerchantDashboard } from './components/dashboard/MerchantDashboard';
import { CustomerMenuView } from './components/customer/CustomerMenuView';
import { AuthModal } from './components/auth/AuthModal';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('landing');
  const [restaurants, setRestaurants] = useState<Restaurant[]>(() => {
    const saved = localStorage.getItem('digmenu_restaurants');
    return saved ? JSON.parse(saved) : INITIAL_RESTAURANTS;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('digmenu_orders');
    return saved ? JSON.parse(saved) : INITIAL_ORDERS;
  });

  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant>(restaurants[0]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('digmenu_restaurants', JSON.stringify(restaurants));
  }, [restaurants]);

  useEffect(() => {
    localStorage.setItem('digmenu_orders', JSON.stringify(orders));
  }, [orders]);

  const handleUpdateRestaurant = (updated: Restaurant) => {
    setCurrentRestaurant(updated);
    setRestaurants(restaurants.map(r => r.id === updated.id ? updated : r));
  };

  const handleNewOrder = (newOrder: Order) => {
    const updatedOrders = [newOrder, ...orders];
    setOrders(updatedOrders);
  };

  return (
    <div>
      {viewMode === 'landing' && (
        <LandingPage
          restaurants={restaurants}
          onSelectRestaurantMenu={(rest) => {
            setCurrentRestaurant(rest);
            setViewMode('customer');
          }}
          onOpenAuth={() => setIsAuthOpen(true)}
        />
      )}

      {viewMode === 'dashboard' && (
        <MerchantDashboard
          restaurant={currentRestaurant}
          orders={orders}
          onUpdateRestaurant={handleUpdateRestaurant}
          onUpdateOrders={setOrders}
          onLogout={() => setViewMode('landing')}
          onOpenPublicMenu={() => setViewMode('customer')}
        />
      )}

      {viewMode === 'customer' && (
        <CustomerMenuView
          restaurant={currentRestaurant}
          onBackToSaaS={() => setViewMode('landing')}
          onNewOrder={handleNewOrder}
        />
      )}

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        restaurants={restaurants}
        onLoginSuccess={(rest) => {
          setCurrentRestaurant(rest);
          setViewMode('dashboard');
        }}
      />
    </div>
  );
}

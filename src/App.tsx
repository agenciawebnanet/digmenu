import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from './lib/api';
import { AuthUser, PlatformConfig, StoreSummary } from './types';
import { LandingPage, type DemoStoreItem } from './components/LandingPage';
import { AuthPages } from './components/AuthPages';
import { PublicMenuPage } from './components/PublicMenuPage';
import { DashboardShell, type DashboardRoute } from './components/dashboard/DashboardShell';
import { LegalPages } from './components/LegalPages';
import { AdminPage } from './components/AdminPage';

const DASHBOARD_ROUTES: DashboardRoute[] = [
  '/painel',
  '/painel/cozinha',
  '/painel/garcom',
  '/painel/pdv',
  '/painel/pedidos',
  '/painel/cardapio',
  '/painel/relatorios',
  '/painel/configuracoes',
  '/painel/assinatura',
];

function normalizePathname(raw: string): string {
  if (!raw || raw === '/') return '/';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export default function App() {
  const [pathname, setPathname] = useState<string>(() => normalizePathname(window.location.pathname));
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [demoStores, setDemoStores] = useState<DemoStoreItem[]>([]);

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stores, setStores] = useState<StoreSummary[]>([]);

  const navigate = useCallback((to: string) => {
    const cleanTarget = to.split('?')[0];
    const normalized = normalizePathname(cleanTarget);
    if (window.location.pathname + window.location.search !== to) {
      window.history.pushState({}, '', to);
    }
    setPathname(normalized);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(normalizePathname(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadBootstrap = useCallback(async () => {
    try {
      const [cfg, demos] = await Promise.all([
        apiRequest<PlatformConfig>('/api/config'),
        apiRequest<{ stores: DemoStoreItem[] }>('/api/public/demo-stores'),
      ]);
      setConfig(cfg);
      setDemoStores(demos.stores);
    } catch {
      // ignore initial non-fatal errors
    }

    try {
      const me = await apiRequest<{ user: AuthUser; stores: StoreSummary[] }>('/api/auth/me');
      setUser(me.user);
      setStores(me.stores);
    } catch {
      setUser(null);
      setStores([]);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const handleAuthSuccess = (authedUser: AuthUser, userStores: StoreSummary[]) => {
    setUser(authedUser);
    setStores(userStores);
    apiRequest<{ stores: DemoStoreItem[] }>('/api/public/demo-stores')
      .then((d) => setDemoStores(d.stores))
      .catch(() => {});
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setStores([]);
      navigate('/');
    }
  };

  // Route matching
  if (pathname.startsWith('/m/')) {
    const slug = pathname.slice(3).split('/')[0];
    return <PublicMenuPage slug={slug} config={config} onNavigate={navigate} />;
  }

  if (pathname === '/termos' || pathname === '/privacidade' || pathname === '/suporte') {
    const page = pathname.slice(1) as 'termos' | 'privacidade' | 'suporte';
    return <LegalPages page={page} onNavigate={navigate} />;
  }

  if (pathname === '/cadastro') {
    return (
      <AuthPages
        mode="register"
        config={config}
        currentUser={user}
        currentStores={stores}
        onNavigate={navigate}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (pathname === '/entrar') {
    return (
      <AuthPages
        mode="login"
        config={config}
        currentUser={user}
        currentStores={stores}
        onNavigate={navigate}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (pathname === '/recuperar-senha') {
    return (
      <AuthPages
        mode="reset"
        config={config}
        currentUser={user}
        currentStores={stores}
        onNavigate={navigate}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (pathname === '/admin') {
    if (!authChecked) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
          Verificando sessão...
        </div>
      );
    }
    return <AdminPage user={user} onNavigate={navigate} />;
  }

  if (DASHBOARD_ROUTES.includes(pathname as DashboardRoute)) {
    if (!authChecked) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
          Verificando sessão...
        </div>
      );
    }
    if (!user || stores.length === 0) {
      return (
        <AuthPages
          mode={user ? 'register' : 'login'}
          config={config}
          currentUser={user}
          currentStores={stores}
          onNavigate={navigate}
          onAuthSuccess={handleAuthSuccess}
        />
      );
    }
    return (
      <DashboardShell
        currentPath={pathname as DashboardRoute}
        user={user}
        stores={stores}
        config={config}
        onNavigate={navigate}
        onLogout={handleLogout}
      />
    );
  }

  // Default: Landing page '/'
  return (
    <LandingPage
      config={config}
      demoStores={demoStores}
      isAuthenticated={Boolean(user)}
      onNavigate={navigate}
    />
  );
}

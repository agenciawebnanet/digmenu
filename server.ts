import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type Express } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

import { getDb, getAnnualPlanPriceCents } from './server/db.ts';
import { seedPreviewDatabaseIfEmpty } from './server/seed.ts';
import {
  hashPassword,
  verifyPassword,
  createUserSession,
  setSessionCookie,
  clearSessionCookie,
  destroySessionFromRequest,
  requireAuth,
  requireStoreMembership,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  normalizeBrazilianWhatsApp,
  formatCentsBRL,
  buildWhatsAppOrderMessage,
  buildWhatsAppUrl,
} from './server/whatsapp.ts';
import {
  evaluateStoreOperationalStatus,
  type StoreHourRow,
  type SubscriptionStatus,
} from './server/storeStatus.ts';
import {
  getMercadoPagoConfig,
  createAnnualPreapprovalCheckout,
  fetchMercadoPagoPreapproval,
  verifyMercadoPagoWebhookSignature,
} from './server/mercadopago.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sanitizeSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function getStoreFullRow(storeId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as Record<string, any> | undefined;
}

function getStoreHours(storeId: string): StoreHourRow[] {
  const db = getDb();
  return db
    .prepare('SELECT day_of_week, open_time, close_time, is_closed FROM store_hours WHERE store_id = ? ORDER BY day_of_week ASC')
    .all(storeId) as unknown as StoreHourRow[];
}

function getStoreSubscription(storeId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM subscriptions WHERE store_id = ?').get(storeId) as Record<string, any> | undefined;
}

function buildOperationalStatusForStore(store: Record<string, any>) {
  const hours = getStoreHours(store.id);
  const sub = getStoreSubscription(store.id);
  return evaluateStoreOperationalStatus({
    timezone: store.timezone || 'America/Sao_Paulo',
    hours,
    isPaused: Boolean(store.is_paused),
    pauseReason: store.pause_reason,
    whatsappE164: store.whatsapp_e164 || null,
    subscriptionStatus: (sub?.status as SubscriptionStatus) || 'pendente',
    subscriptionPeriodEnd: sub?.current_period_end || null,
  });
}

function formatStoreSummary(store: Record<string, any>) {
  const sub = getStoreSubscription(store.id);
  const opStatus = buildOperationalStatusForStore(store);
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    description: store.description,
    logoUrl: store.logo_url,
    coverUrl: store.cover_url,
    whatsappE164: store.whatsapp_e164,
    pickupAddress: store.pickup_address,
    city: store.city,
    timezone: store.timezone,
    allowDelivery: Boolean(store.allow_delivery),
    allowPickup: Boolean(store.allow_pickup),
    isPaused: Boolean(store.is_paused),
    pauseReason: store.pause_reason,
    operationalStatus: opStatus,
    subscriptionStatus: sub?.status || 'pendente',
  };
}

export function createApiApp(): Express {
  getDb();
  seedPreviewDatabaseIfEmpty();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ============================================================================
  // PUBLIC PLATFORM CONFIG & DEMO STORES
  // ============================================================================
  app.get('/api/config', (_req, res) => {
    const annualPriceCents = getAnnualPlanPriceCents();
    res.json({
      annualPriceCents,
      annualPriceFormatted: annualPriceCents > 0 ? formatCentsBRL(annualPriceCents) : null,
      mercadoPago: getMercadoPagoConfig(),
      previewIsolated: true,
    });
  });

  app.get('/api/public/demo-stores', (_req, res) => {
    const db = getDb();
    const stores = db
      .prepare('SELECT * FROM stores ORDER BY created_at ASC LIMIT 6')
      .all() as Array<Record<string, any>>;

    const items = stores.map((store) => {
      const opStatus = buildOperationalStatusForStore(store);
      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        description: store.description,
        logoUrl: store.logo_url,
        coverUrl: store.cover_url,
        city: store.city,
        operationalStatus: opStatus,
      };
    });

    res.json({ stores: items });
  });

  // ============================================================================
  // AUTHENTICATION & REGISTRATION
  // ============================================================================
  app.post('/api/auth/register', (req, res) => {
    try {
      const { userName, email, password, storeName, whatsapp, slug: rawSlug, pickupAddress, city } = req.body || {};

      if (!storeName || typeof storeName !== 'string' || storeName.trim().length < 2) {
        res.status(400).json({ error: 'Informe o nome do restaurante (mínimo 2 caracteres).' });
        return;
      }
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'Informe um e-mail válido.' });
        return;
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        return;
      }

      const waCheck = normalizeBrazilianWhatsApp(whatsapp || '');
      if (!waCheck.valid || !waCheck.normalized) {
        res.status(400).json({ error: waCheck.error });
        return;
      }

      const cleanSlug = sanitizeSlug(rawSlug || storeName);
      if (!cleanSlug || cleanSlug.length < 3) {
        res.status(400).json({
          error: 'O endereço público do cardápio precisa ter pelo menos 3 caracteres válidos (letras, números ou hífen).',
        });
        return;
      }

      const db = getDb();
      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
      if (existingUser) {
        res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
        return;
      }

      const existingSlug = db.prepare('SELECT id FROM stores WHERE slug = ?').get(cleanSlug);
      if (existingSlug) {
        res.status(409).json({
          error: `O endereço "/m/${cleanSlug}" já está em uso. Escolha outro identificador para o cardápio.`,
        });
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const oneYearLater = new Date(now);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      const periodEnd = oneYearLater.toISOString();

      const userId = crypto.randomUUID();
      const storeId = crypto.randomUUID();
      const categoryId = crypto.randomUUID();
      const subId = crypto.randomUUID();
      const annualPriceCents = getAnnualPlanPriceCents();

      db.exec('BEGIN;');
      try {
        db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
          userId,
          (userName || storeName).trim(),
          normalizedEmail,
          hashPassword(password),
          nowIso
        );

        db.prepare(
          `INSERT INTO stores (
            id, slug, name, description, logo_url, cover_url, whatsapp_e164,
            pickup_address, city, timezone, allow_delivery, allow_pickup, is_paused, pause_reason, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          storeId,
          cleanSlug,
          storeName.trim(),
          'Cardápio digital com pedidos pelo WhatsApp.',
          '',
          '',
          waCheck.normalized,
          (pickupAddress || 'Endereço a configurar nas configurações da loja').trim(),
          (city || 'Brasil').trim(),
          'America/Sao_Paulo',
          1,
          1,
          0,
          '',
          nowIso,
          nowIso
        );

        db.prepare(
          'INSERT INTO user_store_memberships (id, user_id, store_id, role, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), userId, storeId, 'owner', nowIso);

        // Default daily opening hours (08:00 - 23:59) so newly created demo stores can be tested immediately
        for (let day = 0; day <= 6; day++) {
          db.prepare(
            'INSERT INTO store_hours (id, store_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(crypto.randomUUID(), storeId, day, '08:00', '23:59', 0);
        }

        // Default neighborhood
        db.prepare(
          'INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), storeId, 'Centro', 500, 1);

        // Default category
        db.prepare(
          'INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(categoryId, storeId, 'Pratos Principais', 'Itens do cardápio.', 1, nowIso);

        // Annual subscription (activated in preview demo mode so full flow works immediately, and all states can be simulated)
        db.prepare(
          `INSERT INTO subscriptions (
            id, store_id, provider, provider_subscription_id, status, annual_price_cents,
            auto_renew, current_period_start, current_period_end, next_renewal_at, cancelled_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          subId,
          storeId,
          'simulator',
          `SIM-ANNUAL-${storeId.slice(0, 8).toUpperCase()}`,
          'ativa',
          annualPriceCents,
          1,
          nowIso,
          periodEnd,
          periodEnd,
          null,
          nowIso
        );

        db.prepare(
          `INSERT INTO payment_events (
            id, subscription_id, store_id, provider, provider_event_id, event_type, status, amount_cents, payload_json, processed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          subId,
          storeId,
          'simulator',
          `demo-activation-${storeId}`,
          'annual_demo_activation',
          'approved',
          annualPriceCents,
          JSON.stringify({ source: 'preview_registration', cycleMonths: 12 }),
          nowIso
        );

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const session = createUserSession(userId);
      setSessionCookie(res, session.token, session.expiresAt);

      const createdStore = getStoreFullRow(storeId)!;
      res.status(201).json({
        user: { id: userId, name: (userName || storeName).trim(), email: normalizedEmail },
        stores: [formatStoreSummary(createdStore)],
      });
    } catch (err: any) {
      console.error('Register error:', err);
      res.status(500).json({ error: err.message || 'Erro ao criar conta e loja.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Informe seu e-mail e senha.' });
        return;
      }

      const db = getDb();
      const user = db
        .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
        .get(String(email).trim().toLowerCase()) as
        | { id: string; name: string; email: string; password_hash: string }
        | undefined;

      if (!user || !verifyPassword(String(password), user.password_hash)) {
        res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        return;
      }

      const session = createUserSession(user.id);
      setSessionCookie(res, session.token, session.expiresAt);

      const stores = db
        .prepare(
          `SELECT s.* FROM stores s
           JOIN user_store_memberships m ON m.store_id = s.id
           WHERE m.user_id = ?
           ORDER BY s.created_at ASC`
        )
        .all(user.id) as Array<Record<string, any>>;

      res.json({
        user: { id: user.id, name: user.name, email: user.email },
        stores: stores.map(formatStoreSummary),
      });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Erro interno ao autenticar.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    destroySessionFromRequest(req);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const stores = db
      .prepare(
        `SELECT s.* FROM stores s
         JOIN user_store_memberships m ON m.store_id = s.id
         WHERE m.user_id = ?
         ORDER BY s.created_at ASC`
      )
      .all(user.id) as Array<Record<string, any>>;

    res.json({
      user,
      stores: stores.map(formatStoreSummary),
    });
  });

  // ============================================================================
  // PRIVATE MERCHANT ENDPOINTS (ISOLATED BY storeId + MEMBERSHIP CHECK)
  // ============================================================================
  app.get('/api/stores/:storeId/overview', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const db = getDb();
    const store = getStoreFullRow(storeId);
    if (!store) {
      res.status(404).json({ error: 'Loja não encontrada.' });
      return;
    }

    const categories = db
      .prepare('SELECT * FROM categories WHERE store_id = ? ORDER BY sort_order ASC, created_at ASC')
      .all(storeId);
    const products = db
      .prepare('SELECT * FROM products WHERE store_id = ? ORDER BY sort_order ASC, created_at ASC')
      .all(storeId) as Array<Record<string, any>>;
    const hours = getStoreHours(storeId);
    const neighborhoods = db
      .prepare('SELECT * FROM delivery_neighborhoods WHERE store_id = ? ORDER BY name ASC')
      .all(storeId);
    const subscription = getStoreSubscription(storeId);
    const paymentEvents = db
      .prepare('SELECT * FROM payment_events WHERE store_id = ? ORDER BY processed_at DESC LIMIT 20')
      .all(storeId);

    const recentOrders = db
      .prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(storeId) as Array<Record<string, any>>;

    const ordersWithItems = recentOrders.map((ord) => {
      const items = db
        .prepare('SELECT * FROM order_items WHERE order_id = ?')
        .all(ord.id);
      return { ...ord, items };
    });

    res.json({
      store: formatStoreSummary(store),
      categories,
      products: products.map((p) => ({
        ...p,
        isAvailable: Boolean(p.is_available),
      })),
      hours: hours.map((h) => ({
        dayOfWeek: h.day_of_week,
        openTime: h.open_time,
        closeTime: h.close_time,
        isClosed: Boolean(h.is_closed),
      })),
      neighborhoods: (neighborhoods as Array<Record<string, any>>).map((n) => ({
        ...n,
        isActive: Boolean(n.is_active),
      })),
      subscription,
      paymentEvents,
      orders: ordersWithItems,
    });
  });

  app.patch('/api/stores/:storeId/settings', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const db = getDb();
    const current = getStoreFullRow(storeId);
    if (!current) {
      res.status(404).json({ error: 'Loja não encontrada.' });
      return;
    }

    const {
      name,
      description,
      logoUrl,
      coverUrl,
      whatsapp,
      pickupAddress,
      city,
      timezone,
      allowDelivery,
      allowPickup,
      isPaused,
      pauseReason,
      slug,
    } = req.body || {};

    let nextWhatsapp = current.whatsapp_e164;
    if (whatsapp !== undefined) {
      if (String(whatsapp).trim() === '') {
        nextWhatsapp = '';
      } else {
        const waCheck = normalizeBrazilianWhatsApp(String(whatsapp));
        if (!waCheck.valid || !waCheck.normalized) {
          res.status(400).json({ error: waCheck.error });
          return;
        }
        nextWhatsapp = waCheck.normalized;
      }
    }

    let nextSlug = current.slug;
    if (slug !== undefined && String(slug).trim() !== current.slug) {
      const clean = sanitizeSlug(String(slug));
      if (!clean || clean.length < 3) {
        res.status(400).json({ error: 'Endereço do cardápio deve ter pelo menos 3 caracteres válidos.' });
        return;
      }
      const conflict = db.prepare('SELECT id FROM stores WHERE slug = ? AND id != ?').get(clean, storeId);
      if (conflict) {
        res.status(409).json({ error: `O endereço "/m/${clean}" já está sendo usado por outra loja.` });
        return;
      }
      nextSlug = clean;
    }

    const nextAllowDelivery = allowDelivery !== undefined ? (allowDelivery ? 1 : 0) : current.allow_delivery;
    const nextAllowPickup = allowPickup !== undefined ? (allowPickup ? 1 : 0) : current.allow_pickup;
    if (nextAllowDelivery === 0 && nextAllowPickup === 0) {
      res.status(400).json({ error: 'Mantenha pelo menos uma modalidade ativa (Entrega ou Retirada).' });
      return;
    }

    db.prepare(
      `UPDATE stores SET
        slug = ?, name = ?, description = ?, logo_url = ?, cover_url = ?,
        whatsapp_e164 = ?, pickup_address = ?, city = ?, timezone = ?,
        allow_delivery = ?, allow_pickup = ?, is_paused = ?, pause_reason = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextSlug,
      name !== undefined ? String(name).trim() : current.name,
      description !== undefined ? String(description).trim() : current.description,
      logoUrl !== undefined ? String(logoUrl).trim() : current.logo_url,
      coverUrl !== undefined ? String(coverUrl).trim() : current.cover_url,
      nextWhatsapp,
      pickupAddress !== undefined ? String(pickupAddress).trim() : current.pickup_address,
      city !== undefined ? String(city).trim() : current.city,
      timezone !== undefined ? String(timezone).trim() : current.timezone,
      nextAllowDelivery,
      nextAllowPickup,
      isPaused !== undefined ? (isPaused ? 1 : 0) : current.is_paused,
      pauseReason !== undefined ? String(pauseReason).trim() : current.pause_reason,
      new Date().toISOString(),
      storeId
    );

    const updated = getStoreFullRow(storeId)!;
    res.json({ store: formatStoreSummary(updated) });
  });

  app.put('/api/stores/:storeId/hours', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const { hours } = req.body || {};
    if (!Array.isArray(hours) || hours.length !== 7) {
      res.status(400).json({ error: 'Envie a configuração dos 7 dias da semana (0 a 6).' });
      return;
    }

    const db = getDb();
    db.exec('BEGIN;');
    try {
      db.prepare('DELETE FROM store_hours WHERE store_id = ?').run(storeId);
      for (const h of hours) {
        const day = Number(h.dayOfWeek);
        if (Number.isNaN(day) || day < 0 || day > 6) {
          throw new Error('Dia da semana inválido.');
        }
        const openTime = String(h.openTime || '08:00').slice(0, 5);
        const closeTime = String(h.closeTime || '22:00').slice(0, 5);
        db.prepare(
          'INSERT INTO store_hours (id, store_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), storeId, day, openTime, closeTime, h.isClosed ? 1 : 0);
      }
      db.exec('COMMIT;');
    } catch (err: any) {
      db.exec('ROLLBACK;');
      res.status(400).json({ error: err.message || 'Erro ao salvar horários.' });
      return;
    }

    const updated = getStoreFullRow(storeId)!;
    res.json({
      store: formatStoreSummary(updated),
      hours: getStoreHours(storeId).map((h) => ({
        dayOfWeek: h.day_of_week,
        openTime: h.open_time,
        closeTime: h.close_time,
        isClosed: Boolean(h.is_closed),
      })),
    });
  });

  // Categories CRUD
  app.post('/api/stores/:storeId/categories', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const { name, description } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      res.status(400).json({ error: 'Informe o nome da categoria.' });
      return;
    }
    const db = getDb();
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM categories WHERE store_id = ?')
      .get(storeId) as { m: number };
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    db.prepare(
      'INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, storeId, String(name).trim(), String(description || '').trim(), maxOrder.m + 1, nowIso);

    const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND store_id = ?').get(id, storeId);
    res.status(201).json({ category: cat });
  });

  app.patch('/api/stores/:storeId/categories/:categoryId', requireAuth, requireStoreMembership, (req, res) => {
    const { storeId, categoryId } = req.params;
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM categories WHERE id = ? AND store_id = ?')
      .get(categoryId, storeId) as Record<string, any> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Categoria não encontrada nesta loja.' });
      return;
    }
    const { name, description, sortOrder } = req.body || {};
    db.prepare(
      'UPDATE categories SET name = ?, description = ?, sort_order = ? WHERE id = ? AND store_id = ?'
    ).run(
      name !== undefined ? String(name).trim() : existing.name,
      description !== undefined ? String(description).trim() : existing.description,
      sortOrder !== undefined ? Number(sortOrder) : existing.sort_order,
      categoryId,
      storeId
    );
    const updated = db.prepare('SELECT * FROM categories WHERE id = ? AND store_id = ?').get(categoryId, storeId);
    res.json({ category: updated });
  });

  app.delete('/api/stores/:storeId/categories/:categoryId', requireAuth, requireStoreMembership, (req, res) => {
    const { storeId, categoryId } = req.params;
    const db = getDb();
    const count = db
      .prepare('SELECT COUNT(*) as total FROM products WHERE category_id = ? AND store_id = ?')
      .get(categoryId, storeId) as { total: number };
    if (count.total > 0) {
      res.status(400).json({ error: 'Mova ou exclua os produtos desta categoria antes de removê-la.' });
      return;
    }
    const result = db.prepare('DELETE FROM categories WHERE id = ? AND store_id = ?').run(categoryId, storeId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Categoria não encontrada nesta loja.' });
      return;
    }
    res.json({ ok: true });
  });

  // Products CRUD
  app.post('/api/stores/:storeId/products', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const { categoryId, name, description, priceCents, imageUrl, isAvailable } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      res.status(400).json({ error: 'Informe o nome do produto.' });
      return;
    }
    const parsedPrice = Number(priceCents);
    if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
      res.status(400).json({ error: 'Preço inválido (deve ser em centavos >= 0).' });
      return;
    }

    const db = getDb();
    const category = db
      .prepare('SELECT id FROM categories WHERE id = ? AND store_id = ?')
      .get(categoryId, storeId);
    if (!category) {
      res.status(400).json({ error: 'Categoria inválida para esta loja.' });
      return;
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM products WHERE store_id = ?')
      .get(storeId) as { m: number };

    db.prepare(
      `INSERT INTO products (
        id, store_id, category_id, name, description, price_cents, image_url, is_available, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      storeId,
      categoryId,
      String(name).trim(),
      String(description || '').trim(),
      parsedPrice,
      String(imageUrl || '').trim(),
      isAvailable === false ? 0 : 1,
      maxOrder.m + 1,
      nowIso,
      nowIso
    );

    const created = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(id, storeId) as Record<string, any>;
    res.status(201).json({ product: { ...created, isAvailable: Boolean(created.is_available) } });
  });

  app.patch('/api/stores/:storeId/products/:productId', requireAuth, requireStoreMembership, (req, res) => {
    const { storeId, productId } = req.params;
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM products WHERE id = ? AND store_id = ?')
      .get(productId, storeId) as Record<string, any> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
      return;
    }

    const { categoryId, name, description, priceCents, imageUrl, isAvailable } = req.body || {};

    if (categoryId !== undefined) {
      const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND store_id = ?').get(categoryId, storeId);
      if (!cat) {
        res.status(400).json({ error: 'Categoria inválida para esta loja.' });
        return;
      }
    }

    let nextPrice = existing.price_cents;
    if (priceCents !== undefined) {
      const parsed = Number(priceCents);
      if (!Number.isInteger(parsed) || parsed < 0) {
        res.status(400).json({ error: 'Preço inválido.' });
        return;
      }
      nextPrice = parsed;
    }

    db.prepare(
      `UPDATE products SET
        category_id = ?, name = ?, description = ?, price_cents = ?, image_url = ?, is_available = ?, updated_at = ?
       WHERE id = ? AND store_id = ?`
    ).run(
      categoryId !== undefined ? categoryId : existing.category_id,
      name !== undefined ? String(name).trim() : existing.name,
      description !== undefined ? String(description).trim() : existing.description,
      nextPrice,
      imageUrl !== undefined ? String(imageUrl).trim() : existing.image_url,
      isAvailable !== undefined ? (isAvailable ? 1 : 0) : existing.is_available,
      new Date().toISOString(),
      productId,
      storeId
    );

    const updated = db
      .prepare('SELECT * FROM products WHERE id = ? AND store_id = ?')
      .get(productId, storeId) as Record<string, any>;
    res.json({ product: { ...updated, isAvailable: Boolean(updated.is_available) } });
  });

  app.delete('/api/stores/:storeId/products/:productId', requireAuth, requireStoreMembership, (req, res) => {
    const { storeId, productId } = req.params;
    const db = getDb();
    const result = db.prepare('DELETE FROM products WHERE id = ? AND store_id = ?').run(productId, storeId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
      return;
    }
    res.json({ ok: true });
  });

  // Neighborhoods CRUD
  app.post('/api/stores/:storeId/neighborhoods', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const { name, feeCents } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      res.status(400).json({ error: 'Informe o nome do bairro.' });
      return;
    }
    const fee = Number(feeCents);
    if (!Number.isInteger(fee) || fee < 0) {
      res.status(400).json({ error: 'Taxa de entrega inválida.' });
      return;
    }
    const db = getDb();
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)').run(
      id,
      storeId,
      String(name).trim(),
      fee,
      1
    );
    const created = db
      .prepare('SELECT * FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
      .get(id, storeId) as Record<string, any>;
    res.status(201).json({ neighborhood: { ...created, isActive: Boolean(created.is_active) } });
  });

  app.patch('/api/stores/:storeId/neighborhoods/:neighborhoodId', requireAuth, requireStoreMembership, (req, res) => {
    const { storeId, neighborhoodId } = req.params;
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
      .get(neighborhoodId, storeId) as Record<string, any> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Bairro não encontrado nesta loja.' });
      return;
    }
    const { name, feeCents, isActive } = req.body || {};
    const fee = feeCents !== undefined ? Number(feeCents) : existing.fee_cents;
    if (!Number.isInteger(fee) || fee < 0) {
      res.status(400).json({ error: 'Taxa inválida.' });
      return;
    }
    db.prepare('UPDATE delivery_neighborhoods SET name = ?, fee_cents = ?, is_active = ? WHERE id = ? AND store_id = ?').run(
      name !== undefined ? String(name).trim() : existing.name,
      fee,
      isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
      neighborhoodId,
      storeId
    );
    const updated = db
      .prepare('SELECT * FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
      .get(neighborhoodId, storeId) as Record<string, any>;
    res.json({ neighborhood: { ...updated, isActive: Boolean(updated.is_active) } });
  });

  app.delete('/api/stores/:storeId/neighborhoods/:neighborhoodId', requireAuth, requireStoreMembership, (req, res) => {
    const { storeId, neighborhoodId } = req.params;
    const db = getDb();
    const result = db
      .prepare('DELETE FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
      .run(neighborhoodId, storeId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Bairro não encontrado nesta loja.' });
      return;
    }
    res.json({ ok: true });
  });

  // Orders private list & status update
  app.get('/api/stores/:storeId/orders', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const db = getDb();
    const orders = db
      .prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(storeId) as Array<Record<string, any>>;

    const enriched = orders.map((ord) => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(ord.id);
      return { ...ord, items };
    });

    res.json({ orders: enriched });
  });

  app.patch('/api/stores/:storeId/orders/:orderId/status', requireAuth, requireStoreMembership, (req, res) => {
    const { storeId, orderId } = req.params;
    const { status } = req.body || {};
    const allowed = ['prepared_whatsapp', 'confirmed', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Status de pedido inválido.' });
      return;
    }
    const db = getDb();
    const result = db
      .prepare('UPDATE orders SET status = ? WHERE id = ? AND store_id = ?')
      .run(status, orderId, storeId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Pedido não encontrado nesta loja.' });
      return;
    }
    res.json({ ok: true, status });
  });

  // ============================================================================
  // SUBSCRIPTION (ANNUAL ONLY) & MERCADO PAGO / SIMULATOR
  // ============================================================================
  app.get('/api/stores/:storeId/subscription', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const db = getDb();
    const subscription = getStoreSubscription(storeId);
    const paymentEvents = db
      .prepare('SELECT * FROM payment_events WHERE store_id = ? ORDER BY processed_at DESC LIMIT 30')
      .all(storeId);
    res.json({
      subscription,
      paymentEvents,
      mercadoPago: getMercadoPagoConfig(),
      annualPriceCents: getAnnualPlanPriceCents(),
    });
  });

  app.post('/api/stores/:storeId/subscription/checkout', requireAuth, requireStoreMembership, async (req: AuthenticatedRequest, res) => {
    try {
      const storeId = req.params.storeId;
      const store = getStoreFullRow(storeId);
      if (!store) {
        res.status(404).json({ error: 'Loja não encontrada.' });
        return;
      }

      const mpConfig = getMercadoPagoConfig();
      if (!mpConfig.configured) {
        res.json({
          mode: 'simulator',
          message: 'Credenciais de teste do Mercado Pago não configuradas. Use os botões do Simulador Anual abaixo.',
        });
        return;
      }

      const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const backUrl = `${appUrl}/painel/assinatura?checkout=retorno`;
      const annualPriceCents = getAnnualPlanPriceCents();

      const checkout = await createAnnualPreapprovalCheckout({
        storeId,
        storeName: store.name,
        payerEmail: req.authUser!.email,
        annualPriceCents,
        backUrl,
      });

      const db = getDb();
      db.prepare(
        'UPDATE subscriptions SET provider = ?, provider_subscription_id = ?, updated_at = ? WHERE store_id = ?'
      ).run('mercadopago', checkout.providerSubscriptionId, new Date().toISOString(), storeId);

      res.json({
        mode: 'mercadopago_test',
        checkoutUrl: checkout.checkoutUrl,
        providerSubscriptionId: checkout.providerSubscriptionId,
      });
    } catch (err: any) {
      console.error('Checkout error:', err);
      res.status(500).json({ error: err.message || 'Erro ao iniciar checkout anual.' });
    }
  });

  app.post('/api/stores/:storeId/subscription/cancel-renewal', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const db = getDb();
    const sub = getStoreSubscription(storeId);
    if (!sub) {
      res.status(404).json({ error: 'Assinatura não encontrada.' });
      return;
    }
    const nowIso = new Date().toISOString();
    db.exec('BEGIN;');
    try {
      db.prepare(
        `UPDATE subscriptions SET
          status = 'renovacao_cancelada', auto_renew = 0, next_renewal_at = NULL, cancelled_at = ?, updated_at = ?
         WHERE store_id = ?`
      ).run(nowIso, nowIso, storeId);

      db.prepare(
        `INSERT INTO payment_events (
          id, subscription_id, store_id, provider, provider_event_id, event_type, status, amount_cents, payload_json, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        sub.id,
        storeId,
        sub.provider || 'simulator',
        `cancel-${crypto.randomUUID()}`,
        'renewal_cancelled',
        'cancelled',
        0,
        JSON.stringify({ keptAccessUntil: sub.current_period_end }),
        nowIso
      );
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    res.json({
      subscription: getStoreSubscription(storeId),
      paymentEvents: db.prepare('SELECT * FROM payment_events WHERE store_id = ? ORDER BY processed_at DESC LIMIT 30').all(storeId),
    });
  });

  app.post('/api/stores/:storeId/subscription/simulate', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const { action, eventId } = req.body || {};
    const validActions = ['pending', 'activate', 'renew_12m', 'past_due', 'cancel_renewal', 'expire'];
    if (!validActions.includes(action)) {
      res.status(400).json({ error: 'Ação de simulação inválida.' });
      return;
    }

    const db = getDb();
    const sub = getStoreSubscription(storeId);
    if (!sub) {
      res.status(404).json({ error: 'Assinatura não encontrada.' });
      return;
    }

    const providerEventId = eventId ? String(eventId) : `sim-${action}-${crypto.randomUUID()}`;
    const existingEvent = db
      .prepare('SELECT id FROM payment_events WHERE provider_event_id = ?')
      .get(providerEventId);
    if (existingEvent) {
      // Idempotent guard: never apply the same event twice
      res.json({
        deduplicated: true,
        subscription: sub,
        paymentEvents: db.prepare('SELECT * FROM payment_events WHERE store_id = ? ORDER BY processed_at DESC LIMIT 30').all(storeId),
      });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const annualPriceCents = getAnnualPlanPriceCents();

    let nextStatus: SubscriptionStatus = sub.status;
    let nextAutoRenew = sub.auto_renew;
    let nextStart = sub.current_period_start || nowIso;
    let nextEnd = sub.current_period_end;
    let nextRenewal = sub.next_renewal_at;
    let nextCancelledAt = sub.cancelled_at;
    let eventStatus = 'approved';
    let amountCents = 0;

    if (action === 'pending') {
      nextStatus = 'pendente';
      nextAutoRenew = 1;
      nextStart = null;
      nextEnd = null;
      nextRenewal = null;
      nextCancelledAt = null;
      eventStatus = 'pending';
    } else if (action === 'activate') {
      const end = new Date(now);
      end.setFullYear(end.getFullYear() + 1);
      nextStatus = 'ativa';
      nextAutoRenew = 1;
      nextStart = nowIso;
      nextEnd = end.toISOString();
      nextRenewal = nextEnd;
      nextCancelledAt = null;
      amountCents = annualPriceCents;
    } else if (action === 'renew_12m') {
      const base = sub.current_period_end ? new Date(sub.current_period_end) : new Date(now);
      const baseDate = base.getTime() > now.getTime() ? base : now;
      const newStart = baseDate.toISOString();
      const newEnd = new Date(baseDate);
      newEnd.setFullYear(newEnd.getFullYear() + 1);
      nextStatus = 'ativa';
      nextAutoRenew = 1;
      nextStart = newStart;
      nextEnd = newEnd.toISOString();
      nextRenewal = nextEnd;
      nextCancelledAt = null;
      amountCents = annualPriceCents;
    } else if (action === 'past_due') {
      nextStatus = 'pagamento_em_atraso';
      nextAutoRenew = 1;
      eventStatus = 'payment_failed';
    } else if (action === 'cancel_renewal') {
      nextStatus = 'renovacao_cancelada';
      nextAutoRenew = 0;
      nextRenewal = null;
      nextCancelledAt = nowIso;
      eventStatus = 'cancelled';
    } else if (action === 'expire') {
      nextStatus = 'expirada';
      nextAutoRenew = 0;
      nextEnd = nowIso;
      nextRenewal = null;
      eventStatus = 'expired';
    }

    db.exec('BEGIN IMMEDIATE;');
    try {
      db.prepare(
        `UPDATE subscriptions SET
          status = ?, annual_price_cents = ?, auto_renew = ?,
          current_period_start = ?, current_period_end = ?, next_renewal_at = ?,
          cancelled_at = ?, updated_at = ?
         WHERE store_id = ?`
      ).run(
        nextStatus,
        annualPriceCents,
        nextAutoRenew,
        nextStart,
        nextEnd,
        nextRenewal,
        nextCancelledAt,
        nowIso,
        storeId
      );

      db.prepare(
        `INSERT INTO payment_events (
          id, subscription_id, store_id, provider, provider_event_id, event_type, status, amount_cents, payload_json, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        sub.id,
        storeId,
        'simulator',
        providerEventId,
        `sim_${action}`,
        eventStatus,
        amountCents,
        JSON.stringify({ action, simulatedAt: nowIso }),
        nowIso
      );

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    const updatedStore = getStoreFullRow(storeId)!;
    res.json({
      store: formatStoreSummary(updatedStore),
      subscription: getStoreSubscription(storeId),
      paymentEvents: db.prepare('SELECT * FROM payment_events WHERE store_id = ? ORDER BY processed_at DESC LIMIT 30').all(storeId),
    });
  });

  // Mercado Pago Webhook (validates HMAC signature, queries provider, idempotent event processing)
  app.post('/api/webhooks/mercadopago', async (req, res) => {
    try {
      const dataId = String(req.body?.data?.id || req.query['data.id'] || '');
      const eventId = String(req.body?.id || `${req.body?.type || 'mp'}-${dataId}`);
      const xSignature = req.header('x-signature');
      const xRequestId = req.header('x-request-id');

      if (process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()) {
        const valid = verifyMercadoPagoWebhookSignature({
          xSignatureHeader: xSignature,
          xRequestIdHeader: xRequestId,
          dataId,
        });
        if (!valid) {
          res.status(401).json({ error: 'Assinatura do webhook inválida.' });
          return;
        }
      }

      if (!dataId) {
        res.status(400).json({ error: 'Evento sem data.id.' });
        return;
      }

      const db = getDb();
      const alreadyProcessed = db
        .prepare('SELECT id FROM payment_events WHERE provider_event_id = ?')
        .get(eventId);
      if (alreadyProcessed) {
        res.status(200).json({ ok: true, deduplicated: true });
        return;
      }

      const mpConfig = getMercadoPagoConfig();
      if (!mpConfig.configured) {
        res.status(503).json({ error: 'Credenciais de teste do Mercado Pago não configuradas no servidor.' });
        return;
      }

      const preapproval = await fetchMercadoPagoPreapproval(dataId);
      const sub = db
        .prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ? OR store_id = ?')
        .get(preapproval.id, preapproval.externalReference || '') as Record<string, any> | undefined;

      if (!sub) {
        res.status(404).json({ error: 'Assinatura correspondente não encontrada.' });
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      let mappedStatus: SubscriptionStatus = 'pendente';
      let autoRenew = 1;
      let periodStart = sub.current_period_start;
      let periodEnd = sub.current_period_end;
      let nextRenewal = sub.next_renewal_at;

      if (preapproval.status === 'authorized') {
        mappedStatus = 'ativa';
        const end = new Date(now);
        end.setFullYear(end.getFullYear() + 1);
        periodStart = nowIso;
        periodEnd = end.toISOString();
        nextRenewal = periodEnd;
      } else if (preapproval.status === 'paused') {
        mappedStatus = 'pagamento_em_atraso';
      } else if (preapproval.status === 'cancelled') {
        mappedStatus = 'renovacao_cancelada';
        autoRenew = 0;
        nextRenewal = null;
      }

      db.exec('BEGIN IMMEDIATE;');
      try {
        db.prepare(
          `UPDATE subscriptions SET
            status = ?, auto_renew = ?, current_period_start = ?, current_period_end = ?,
            next_renewal_at = ?, updated_at = ?
           WHERE id = ?`
        ).run(mappedStatus, autoRenew, periodStart, periodEnd, nextRenewal, nowIso, sub.id);

        db.prepare(
          `INSERT INTO payment_events (
            id, subscription_id, store_id, provider, provider_event_id, event_type, status, amount_cents, payload_json, processed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          sub.id,
          sub.store_id,
          'mercadopago',
          eventId,
          String(req.body?.type || 'subscription_preapproval'),
          preapproval.status,
          preapproval.amountCents,
          JSON.stringify(req.body || {}),
          nowIso
        );
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error('Webhook error:', err);
      res.status(500).json({ error: err.message || 'Erro ao processar webhook.' });
    }
  });

  // ============================================================================
  // PUBLIC MENU & ORDER FINALIZATION (/m/:slug)
  // ============================================================================
  app.get('/api/public/stores/:slug', (req, res) => {
    const slug = sanitizeSlug(req.params.slug);
    const db = getDb();
    const store = db.prepare('SELECT * FROM stores WHERE slug = ?').get(slug) as Record<string, any> | undefined;
    if (!store) {
      res.status(404).json({ error: 'Cardápio não encontrado.' });
      return;
    }

    const opStatus = buildOperationalStatusForStore(store);
    const categories = db
      .prepare('SELECT id, name, description, sort_order FROM categories WHERE store_id = ? ORDER BY sort_order ASC, created_at ASC')
      .all(store.id);
    const products = db
      .prepare(
        'SELECT id, category_id, name, description, price_cents, image_url, sort_order FROM products WHERE store_id = ? AND is_available = 1 ORDER BY sort_order ASC, created_at ASC'
      )
      .all(store.id);
    const neighborhoods = db
      .prepare('SELECT id, name, fee_cents FROM delivery_neighborhoods WHERE store_id = ? AND is_active = 1 ORDER BY name ASC')
      .all(store.id);
    const hours = getStoreHours(store.id).map((h) => ({
      dayOfWeek: h.day_of_week,
      openTime: h.open_time,
      closeTime: h.close_time,
      isClosed: Boolean(h.is_closed),
    }));

    res.json({
      store: {
        id: store.id,
        slug: store.slug,
        name: store.name,
        description: store.description,
        logoUrl: store.logo_url,
        coverUrl: store.cover_url,
        pickupAddress: store.pickup_address,
        city: store.city,
        timezone: store.timezone,
        allowDelivery: Boolean(store.allow_delivery),
        allowPickup: Boolean(store.allow_pickup),
        hasValidWhatsapp: Boolean(store.whatsapp_e164),
        operationalStatus: opStatus,
      },
      categories,
      products,
      neighborhoods,
      hours,
    });
  });

  app.post('/api/public/stores/:slug/orders', (req, res) => {
    const slug = sanitizeSlug(req.params.slug);
    const db = getDb();
    const store = db.prepare('SELECT * FROM stores WHERE slug = ?').get(slug) as Record<string, any> | undefined;
    if (!store) {
      res.status(404).json({ error: 'Loja não encontrada.' });
      return;
    }

    const {
      idempotencyKey,
      customerName,
      fulfillmentType,
      neighborhoodId,
      deliveryAddress,
      notes,
      items,
      expectedDeliveryFeeCents,
    } = req.body || {};

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
      res.status(400).json({ error: 'Chave de idempotência do pedido inválida.' });
      return;
    }

    // 1. Check idempotency BEFORE blocking/mutating so duplicate clicks always return the original order cleanly
    const existingOrder = db
      .prepare('SELECT * FROM orders WHERE store_id = ? AND idempotency_key = ?')
      .get(store.id, idempotencyKey.trim()) as Record<string, any> | undefined;

    if (existingOrder) {
      const existingItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(existingOrder.id);
      res.status(200).json({
        deduplicated: true,
        order: { ...existingOrder, items: existingItems },
      });
      return;
    }

    // 2. Check store operational status (subscription, WhatsApp, pause, opening hours)
    const opStatus = buildOperationalStatusForStore(store);
    if (!opStatus.canAcceptOrders) {
      res.status(409).json({
        code: 'STORE_UNAVAILABLE',
        error: opStatus.reason,
        operationalStatus: opStatus,
      });
      return;
    }

    // 3. Validate customer & fulfillment fields
    if (!customerName || String(customerName).trim().length < 2) {
      res.status(400).json({ error: 'Informe seu nome para finalizar o pedido.' });
      return;
    }
    if (fulfillmentType !== 'delivery' && fulfillmentType !== 'pickup') {
      res.status(400).json({ error: 'Modalidade de atendimento inválida.' });
      return;
    }
    if (fulfillmentType === 'delivery' && !store.allow_delivery) {
      res.status(400).json({ error: 'Esta loja não está aceitando entregas no momento.' });
      return;
    }
    if (fulfillmentType === 'pickup' && !store.allow_pickup) {
      res.status(400).json({ error: 'Esta loja não está aceitando retiradas no local no momento.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Adicione pelo menos um item à sacola antes de finalizar.' });
      return;
    }

    let deliveryFeeCents = 0;
    let resolvedNeighborhoodId: string | null = null;
    let resolvedNeighborhoodName: string | null = null;
    let resolvedDeliveryAddress: string | null = null;

    const catalogChanges: string[] = [];

    if (fulfillmentType === 'delivery') {
      if (!neighborhoodId) {
        res.status(400).json({ error: 'Selecione o bairro para entrega.' });
        return;
      }
      if (!deliveryAddress || String(deliveryAddress).trim().length < 5) {
        res.status(400).json({ error: 'Informe o endereço completo para entrega (rua, número e complemento).' });
        return;
      }
      const nb = db
        .prepare('SELECT id, name, fee_cents, is_active FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
        .get(neighborhoodId, store.id) as { id: string; name: string; fee_cents: number; is_active: number } | undefined;

      if (!nb || !nb.is_active) {
        res.status(409).json({
          code: 'CATALOG_CHANGED',
          error: 'O bairro selecionado não está mais disponível. Atualize a página e revise sua sacola.',
          changes: ['Bairro de entrega indisponível ou removido.'],
        });
        return;
      }

      if (expectedDeliveryFeeCents !== undefined && Number(expectedDeliveryFeeCents) !== nb.fee_cents) {
        catalogChanges.push(
          `A taxa de entrega para ${nb.name} mudou de ${formatCentsBRL(Number(expectedDeliveryFeeCents))} para ${formatCentsBRL(nb.fee_cents)}.`
        );
      }

      deliveryFeeCents = nb.fee_cents;
      resolvedNeighborhoodId = nb.id;
      resolvedNeighborhoodName = nb.name;
      resolvedDeliveryAddress = String(deliveryAddress).trim();
    }

    // 4. Verify all items, quantities, availability, and prices against DB
    const verifiedItems: Array<{
      productId: string;
      productName: string;
      unitPriceCents: number;
      quantity: number;
      lineTotalCents: number;
    }> = [];

    for (const rawItem of items) {
      const productId = String(rawItem?.productId || '');
      const quantity = Number(rawItem?.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
        res.status(400).json({ error: 'Quantidade de item inválida na sacola.' });
        return;
      }

      const product = db
        .prepare('SELECT id, name, price_cents, is_available FROM products WHERE id = ? AND store_id = ?')
        .get(productId, store.id) as
        | { id: string; name: string; price_cents: number; is_available: number }
        | undefined;

      if (!product || !product.is_available) {
        catalogChanges.push(`Um item da sacola ficou indisponível no cardápio.`);
        continue;
      }

      if (
        rawItem?.expectedUnitPriceCents !== undefined &&
        Number(rawItem.expectedUnitPriceCents) !== product.price_cents
      ) {
        catalogChanges.push(
          `"${product.name}" mudou de ${formatCentsBRL(Number(rawItem.expectedUnitPriceCents))} para ${formatCentsBRL(product.price_cents)}.`
        );
      }

      verifiedItems.push({
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.price_cents,
        quantity,
        lineTotalCents: product.price_cents * quantity,
      });
    }

    if (catalogChanges.length > 0) {
      res.status(409).json({
        code: 'CATALOG_CHANGED',
        error: 'O cardápio foi atualizado enquanto você montava a sacola. Confira as alterações abaixo e revise o pedido.',
        changes: catalogChanges,
      });
      return;
    }

    const subtotalCents = verifiedItems.reduce((acc, it) => acc + it.lineTotalCents, 0);
    const totalCents = subtotalCents + deliveryFeeCents;
    const nowIso = new Date().toISOString();

    let createdOrderId = '';

    db.exec('BEGIN IMMEDIATE;');
    try {
      // Double-check idempotency inside write transaction to defeat concurrent double-clicks
      const raceCheck = db
        .prepare('SELECT * FROM orders WHERE store_id = ? AND idempotency_key = ?')
        .get(store.id, idempotencyKey.trim()) as Record<string, any> | undefined;

      if (raceCheck) {
        db.exec('COMMIT;');
        const raceItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(raceCheck.id);
        res.status(200).json({ deduplicated: true, order: { ...raceCheck, items: raceItems } });
        return;
      }

      const maxNumRow = db
        .prepare('SELECT COALESCE(MAX(order_number), 100) as maxNum FROM orders WHERE store_id = ?')
        .get(store.id) as { maxNum: number };
      const orderNumber = maxNumRow.maxNum + 1;
      createdOrderId = crypto.randomUUID();

      const whatsappMessage = buildWhatsAppOrderMessage({
        storeName: store.name,
        orderNumber,
        customerName: String(customerName).trim(),
        fulfillmentType,
        items: verifiedItems,
        neighborhoodName: resolvedNeighborhoodName,
        deliveryFeeCents,
        deliveryAddress: resolvedDeliveryAddress,
        pickupAddress: store.pickup_address,
        totalCents,
        notes: notes ? String(notes).trim() : '',
      });

      const whatsappUrl = buildWhatsAppUrl(store.whatsapp_e164, whatsappMessage);

      db.prepare(
        `INSERT INTO orders (
          id, order_number, store_id, idempotency_key, customer_name, fulfillment_type,
          neighborhood_id, neighborhood_name, delivery_address, notes, subtotal_cents,
          delivery_fee_cents, total_cents, status, whatsapp_message, whatsapp_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        createdOrderId,
        orderNumber,
        store.id,
        idempotencyKey.trim(),
        String(customerName).trim(),
        fulfillmentType,
        resolvedNeighborhoodId,
        resolvedNeighborhoodName,
        resolvedDeliveryAddress,
        notes ? String(notes).trim() : '',
        subtotalCents,
        deliveryFeeCents,
        totalCents,
        'prepared_whatsapp',
        whatsappMessage,
        whatsappUrl,
        nowIso
      );

      for (const item of verifiedItems) {
        db.prepare(
          `INSERT INTO order_items (
            id, order_id, product_id, product_name_snapshot, unit_price_cents, quantity, line_total_cents
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          createdOrderId,
          item.productId,
          item.productName,
          item.unitPriceCents,
          item.quantity,
          item.lineTotalCents
        );
      }

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    const savedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(createdOrderId) as Record<string, any>;
    const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(createdOrderId);

    res.status(201).json({
      deduplicated: false,
      order: { ...savedOrder, items: savedItems },
    });
  });

  return app;
}

async function startServer() {
  const app = createApiApp();
  const isProduction = process.env.NODE_ENV === 'production';
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`DigMenu SaaS rodando em http://localhost:${port}`);
  });
}

const isMainEntry =
  process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMainEntry) {
  startServer().catch((err) => {
    console.error('Erro ao iniciar servidor DigMenu:', err);
    process.exit(1);
  });
}

import http from 'http';
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
  requireStoreRoles,
  requirePlatformAdmin,
  isPlatformAdminEmail,
  createPasswordResetToken,
  consumePasswordResetToken,
  createCustomerSession,
  setCustomerSessionCookie,
  clearCustomerSessionCookie,
  destroyCustomerSessionFromRequest,
  getAuthenticatedCustomer,
  requireCustomerAuth,
  getGoogleOAuthConfig,
  signOAuthState,
  verifyOAuthState,
  exchangeGoogleAuthCode,
  type AuthenticatedRequest,
  type StoreMemberRole,
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
  isSubscriptionSimulatorEnabled,
  createAnnualPreapprovalCheckout,
  fetchMercadoPagoPreapproval,
  verifyMercadoPagoWebhookSignature,
} from './server/mercadopago.ts';
import {
  attachWebSocketServer,
  broadcastStoreEvent,
  broadcastPublicStoreEvent,
} from './server/realtime.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ProductSizeOption {
  id: string;
  name: string;
  priceCents: number;
}

export interface ProductAddonOption {
  id: string;
  name: string;
  priceCents: number;
}

function sanitizeSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseSizesJson(raw: unknown): ProductSizeOption[] {
  const arr = parseJsonSafe<unknown[]>(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s: any) => s && typeof s.name === 'string' && Number.isInteger(Number(s.priceCents)))
    .map((s: any) => ({
      id: String(s.id || crypto.randomUUID()),
      name: String(s.name).trim(),
      priceCents: Number(s.priceCents),
    }));
}

function parseAddonsJson(raw: unknown): ProductAddonOption[] {
  const arr = parseJsonSafe<unknown[]>(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((a: any) => a && typeof a.name === 'string' && Number.isInteger(Number(a.priceCents)))
    .map((a: any) => ({
      id: String(a.id || crypto.randomUUID()),
      name: String(a.name).trim(),
      priceCents: Number(a.priceCents),
    }));
}

function validateAndNormalizeVariants(
  rawSizes: unknown,
  rawAddons: unknown
): { ok: true; sizes: ProductSizeOption[]; addons: ProductAddonOption[] } | { ok: false; error: string } {
  const sizes: ProductSizeOption[] = [];
  if (rawSizes !== undefined) {
    if (!Array.isArray(rawSizes)) {
      return { ok: false, error: 'Lista de tamanhos/variações inválida.' };
    }
    for (const s of rawSizes) {
      const name = String((s as any)?.name || '').trim();
      const priceCents = Number((s as any)?.priceCents);
      if (!name || name.length < 1 || name.length > 60) {
        return { ok: false, error: 'Cada tamanho precisa de um nome entre 1 e 60 caracteres.' };
      }
      if (!Number.isInteger(priceCents) || priceCents < 0) {
        return { ok: false, error: `Preço inválido para o tamanho "${name}".` };
      }
      const id = String((s as any)?.id || `sz-${crypto.randomBytes(4).toString('hex')}`).trim();
      sizes.push({ id, name, priceCents });
    }
  }

  const addons: ProductAddonOption[] = [];
  if (rawAddons !== undefined) {
    if (!Array.isArray(rawAddons)) {
      return { ok: false, error: 'Lista de adicionais inválida.' };
    }
    for (const a of rawAddons) {
      const name = String((a as any)?.name || '').trim();
      const priceCents = Number((a as any)?.priceCents);
      if (!name || name.length < 1 || name.length > 60) {
        return { ok: false, error: 'Cada adicional precisa de um nome entre 1 e 60 caracteres.' };
      }
      if (!Number.isInteger(priceCents) || priceCents < 0) {
        return { ok: false, error: `Preço inválido para o adicional "${name}".` };
      }
      const id = String((a as any)?.id || `add-${crypto.randomBytes(4).toString('hex')}`).trim();
      addons.push({ id, name, priceCents });
    }
  }

  return { ok: true, sizes, addons };
}

function formatProductRow(row: Record<string, any>) {
  return {
    ...row,
    isAvailable: Boolean(row.is_available),
    sizes: parseSizesJson(row.sizes_json),
    addons: parseAddonsJson(row.addons_json),
  };
}

function formatOrderItemRow(row: Record<string, any>) {
  const selectedSize = parseJsonSafe<ProductSizeOption | null>(row.selected_size_json, null);
  const selectedAddons = parseJsonSafe<ProductAddonOption[]>(row.selected_addons_json, []);
  return {
    ...row,
    selectedSize,
    selectedAddons: Array.isArray(selectedAddons) ? selectedAddons : [],
  };
}

function formatOrderRow(ord: Record<string, any>, rawItems: Array<Record<string, any>>) {
  return {
    ...ord,
    items: rawItems.map(formatOrderItemRow),
  };
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
    isPlatformBlocked: Boolean(store.is_platform_blocked),
    platformBlockReason: store.platform_block_reason || '',
  });
}

function formatStoreSummary(store: Record<string, any>, myRole?: StoreMemberRole) {
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
    allowTable: store.allow_table === undefined ? true : Boolean(store.allow_table),
    allowCounter: store.allow_counter === undefined ? true : Boolean(store.allow_counter),
    isPaused: Boolean(store.is_paused),
    pauseReason: store.pause_reason,
    isPlatformBlocked: Boolean(store.is_platform_blocked),
    platformBlockReason: store.platform_block_reason || '',
    myRole: myRole || (store.my_role as StoreMemberRole | undefined) || 'owner',
    operationalStatus: opStatus,
    subscriptionStatus: sub?.status || 'pendente',
  };
}

function getOpenCashRegisterState(storeId: string) {
  const db = getDb();
  const openReg = db
    .prepare("SELECT * FROM cash_registers WHERE store_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1")
    .get(storeId) as Record<string, any> | undefined;

  const recentClosed = db
    .prepare("SELECT * FROM cash_registers WHERE store_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 12")
    .all(storeId) as Array<Record<string, any>>;

  if (!openReg) {
    return {
      openRegister: null,
      movements: [],
      expectedCashCents: 0,
      summary: {
        openingBalanceCents: 0,
        cashSalesCents: 0,
        pixSalesCents: 0,
        cardSalesCents: 0,
        suprimentoCents: 0,
        sangriaCents: 0,
        refundCents: 0,
        expectedCashCents: 0,
      },
      recentClosed,
    };
  }

  const movements = db
    .prepare('SELECT * FROM cash_movements WHERE cash_register_id = ? ORDER BY created_at DESC')
    .all(openReg.id) as Array<Record<string, any>>;

  let cashSalesCents = 0;
  let pixSalesCents = 0;
  let cardSalesCents = 0;
  let suprimentoCents = 0;
  let sangriaCents = 0;
  let refundCents = 0;

  for (const m of movements) {
    if (m.type === 'venda_dinheiro') cashSalesCents += m.amount_cents;
    else if (m.type === 'venda_pix') pixSalesCents += m.amount_cents;
    else if (m.type === 'venda_cartao') cardSalesCents += m.amount_cents;
    else if (m.type === 'suprimento') suprimentoCents += m.amount_cents;
    else if (m.type === 'sangria') sangriaCents += m.amount_cents;
    else if (m.type === 'estorno') refundCents += m.amount_cents;
  }

  const expectedCashCents =
    openReg.opening_balance_cents + cashSalesCents + suprimentoCents - sangriaCents - refundCents;

  return {
    openRegister: openReg,
    movements,
    expectedCashCents,
    summary: {
      openingBalanceCents: openReg.opening_balance_cents,
      cashSalesCents,
      pixSalesCents,
      cardSalesCents,
      suprimentoCents,
      sangriaCents,
      refundCents,
      expectedCashCents,
    },
    recentClosed,
  };
}

function recordCashSaleIfRegisterOpen(params: {
  storeId: string;
  orderId: string;
  orderNumber: number;
  amountCents: number;
  paymentMethod: string;
  userId: string;
  userName: string;
  nowIso: string;
}): void {
  const db = getDb();
  const openReg = db
    .prepare("SELECT * FROM cash_registers WHERE store_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1")
    .get(params.storeId) as Record<string, any> | undefined;

  if (!openReg) return;

  let movementType: 'venda_dinheiro' | 'venda_pix' | 'venda_cartao' = 'venda_cartao';
  if (params.paymentMethod === 'dinheiro') movementType = 'venda_dinheiro';
  else if (params.paymentMethod === 'pix') movementType = 'venda_pix';

  db.prepare(
    `INSERT INTO cash_movements (
      id, cash_register_id, store_id, type, amount_cents, payment_method, order_id, description,
      created_by_user_id, created_by_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    openReg.id,
    params.storeId,
    movementType,
    params.amountCents,
    params.paymentMethod,
    params.orderId,
    `Recebimento pedido #${params.orderNumber}`,
    params.userId,
    params.userName,
    params.nowIso
  );

  if (movementType === 'venda_dinheiro') {
    db.prepare(
      'UPDATE cash_registers SET expected_closing_cents = expected_closing_cents + ? WHERE id = ?'
    ).run(params.amountCents, openReg.id);
  }
}

export function createApiApp(): Express {
  getDb();
  seedPreviewDatabaseIfEmpty();

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // ============================================================================
  // PUBLIC PLATFORM CONFIG & DEMO STORES
  // ============================================================================
  app.get('/api/config', (_req, res) => {
    const annualPriceCents = getAnnualPlanPriceCents();
    const googleCfg = getGoogleOAuthConfig();
    res.json({
      annualPriceCents,
      annualPriceFormatted: annualPriceCents > 0 ? formatCentsBRL(annualPriceCents) : null,
      mercadoPago: getMercadoPagoConfig(),
      googleAuth: {
        configured: googleCfg.configured,
        mode: googleCfg.mode,
      },
      wsSupported: true,
      previewIsolated: true,
    });
  });

  app.get('/api/public/demo-stores', (_req, res) => {
    const db = getDb();
    const stores = db
      .prepare('SELECT * FROM stores WHERE is_platform_blocked = 0 ORDER BY created_at ASC LIMIT 6')
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
  // AUTHENTICATION, REGISTRATION & PASSWORD RESET
  // ============================================================================
  app.post('/api/auth/register', (req, res) => {
    try {
      const { userName, email, password, storeName, whatsapp, slug: rawSlug, pickupAddress, city, logoUrl } = req.body || {};

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
            pickup_address, city, timezone, allow_delivery, allow_pickup, allow_table, allow_counter,
            is_paused, pause_reason, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          storeId,
          cleanSlug,
          storeName.trim(),
          'Cardápio digital com pedidos pelo WhatsApp.',
          typeof logoUrl === 'string' ? logoUrl.trim() : '',
          '',
          waCheck.normalized,
          (pickupAddress || 'Endereço a configurar nas configurações da loja').trim(),
          (city || 'Brasil').trim(),
          'America/Sao_Paulo',
          1,
          1,
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

        for (let day = 0; day <= 6; day++) {
          db.prepare(
            'INSERT INTO store_hours (id, store_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(crypto.randomUUID(), storeId, day, '08:00', '23:59', 0);
        }

        db.prepare(
          'INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), storeId, 'Centro', 500, 1);

        for (let i = 1; i <= 2; i++) {
          const code = String(i).padStart(2, '0');
          db.prepare(
            'INSERT INTO store_tables (id, store_id, label, table_code, seats, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(crypto.randomUUID(), storeId, `Mesa ${code}`, code, 4, 1, nowIso);
        }

        db.prepare(
          'INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(categoryId, storeId, 'Pratos Principais', 'Itens do cardápio.', 1, nowIso);

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
        user: {
          id: userId,
          name: (userName || storeName).trim(),
          email: normalizedEmail,
          isPlatformAdmin: isPlatformAdminEmail(normalizedEmail),
        },
        stores: [formatStoreSummary(createdStore, 'owner')],
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
        .prepare('SELECT id, name, email, password_hash, avatar_url, auth_provider FROM users WHERE email = ?')
        .get(String(email).trim().toLowerCase()) as
        | { id: string; name: string; email: string; password_hash: string; avatar_url: string; auth_provider: string }
        | undefined;

      if (!user || !verifyPassword(String(password), user.password_hash)) {
        res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        return;
      }

      const session = createUserSession(user.id);
      setSessionCookie(res, session.token, session.expiresAt);

      const stores = db
        .prepare(
          `SELECT s.*, m.role as my_role FROM stores s
           JOIN user_store_memberships m ON m.store_id = s.id
           WHERE m.user_id = ?
           ORDER BY s.created_at ASC`
        )
        .all(user.id) as Array<Record<string, any>>;

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url || '',
          authProvider: user.auth_provider || 'password',
          isPlatformAdmin: isPlatformAdminEmail(user.email),
        },
        stores: stores.map((s) => formatStoreSummary(s, s.my_role as StoreMemberRole)),
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
        `SELECT s.*, m.role as my_role FROM stores s
         JOIN user_store_memberships m ON m.store_id = s.id
         WHERE m.user_id = ?
         ORDER BY s.created_at ASC`
      )
      .all(user.id) as Array<Record<string, any>>;

    res.json({
      user,
      stores: stores.map((s) => formatStoreSummary(s, s.my_role as StoreMemberRole)),
    });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    const db = getDb();
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email) as
      | { id: string; email: string }
      | undefined;

    if (!user) {
      res.json({
        ok: true,
        message: 'Se este e-mail estiver cadastrado, um link temporário de redefinição foi gerado.',
      });
      return;
    }

    const { token, expiresAt } = createPasswordResetToken(user.id);
    const isProd = process.env.NODE_ENV === 'production';
    res.json({
      ok: true,
      message: isProd
        ? 'Se este e-mail estiver cadastrado, um link temporário de redefinição foi enviado.'
        : 'Link de redefinição gerado para o ambiente de prévia (válido por 30 minutos).',
      ...(isProd
        ? {}
        : {
            previewResetToken: token,
            previewResetUrl: `/recuperar-senha?token=${encodeURIComponent(token)}`,
            expiresAt,
          }),
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body || {};
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Informe o token de redefinição.' });
      return;
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    const result = consumePasswordResetToken(token.trim(), newPassword);
    if (!result.ok) {
      res.status(400).json({ error: result.error || 'Token inválido.' });
      return;
    }
    res.json({ ok: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  });

  // ============================================================================
  // GOOGLE OAUTH 2.0 + PREVIEW GOOGLE LOGIN (MERCHANT & CUSTOMER)
  // ============================================================================
  app.get('/api/auth/google', (req, res) => {
    const cfg = getGoogleOAuthConfig();
    const audience = req.query.audience === 'customer' ? 'customer' : 'merchant';
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';

    if (!cfg.configured) {
      res.status(400).json({
        error: 'Credenciais do Google OAuth não configuradas. Utilize o fluxo de demonstração da prévia.',
      });
      return;
    }

    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const redirectUri = `${appUrl}/api/auth/google/callback`;
    const state = signOAuthState({ audience, returnTo });

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const code = String(req.query.code || '');
      const stateStr = String(req.query.state || '');
      const state = verifyOAuthState(stateStr);
      if (!code || !state) {
        res.redirect('/entrar?erro=google_state_invalido');
        return;
      }

      const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const redirectUri = `${appUrl}/api/auth/google/callback`;
      const profile = await exchangeGoogleAuthCode({ code, redirectUri });

      const db = getDb();
      const nowIso = new Date().toISOString();

      if (state.audience === 'customer') {
        let customer = db
          .prepare('SELECT id FROM customer_accounts WHERE google_sub = ? OR email = ?')
          .get(profile.sub, profile.email) as { id: string } | undefined;

        if (!customer) {
          const id = crypto.randomUUID();
          db.prepare(
            `INSERT INTO customer_accounts (
              id, name, email, password_hash, google_sub, avatar_url, auth_provider, created_at, updated_at
            ) VALUES (?, ?, ?, '', ?, ?, 'google', ?, ?)`
          ).run(id, profile.name, profile.email, profile.sub, profile.picture, nowIso, nowIso);
          customer = { id };
        } else {
          db.prepare(
            'UPDATE customer_accounts SET google_sub = COALESCE(google_sub, ?), avatar_url = ?, updated_at = ? WHERE id = ?'
          ).run(profile.sub, profile.picture, nowIso, customer.id);
        }

        const session = createCustomerSession(customer.id);
        setCustomerSessionCookie(res, session.token, session.expiresAt);
        const target = state.returnTo && state.returnTo.startsWith('/m/') ? state.returnTo : '/';
        res.redirect(target);
        return;
      }

      let user = db
        .prepare('SELECT id FROM users WHERE google_sub = ? OR email = ?')
        .get(profile.sub, profile.email) as { id: string } | undefined;

      if (!user) {
        const id = crypto.randomUUID();
        db.prepare(
          `INSERT INTO users (id, name, email, password_hash, google_sub, avatar_url, auth_provider, created_at)
           VALUES (?, ?, ?, '', ?, ?, 'google', ?)`
        ).run(id, profile.name, profile.email, profile.sub, profile.picture, nowIso);
        user = { id };
      } else {
        db.prepare(
          'UPDATE users SET google_sub = COALESCE(google_sub, ?), avatar_url = ? WHERE id = ?'
        ).run(profile.sub, profile.picture, user.id);
      }

      const session = createUserSession(user.id);
      setSessionCookie(res, session.token, session.expiresAt);

      const storesCount = db
        .prepare('SELECT COUNT(*) as total FROM user_store_memberships WHERE user_id = ?')
        .get(user.id) as { total: number };

      res.redirect(storesCount.total > 0 ? '/painel' : '/cadastro?google=completar-loja');
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect('/entrar?erro=google_oauth_falhou');
    }
  });

  app.post('/api/auth/google/preview', (req, res) => {
    const cfg = getGoogleOAuthConfig();
    if (cfg.configured) {
      res.status(400).json({ error: 'Use o fluxo oficial Google OAuth configurado neste ambiente.' });
      return;
    }

    const { audience, email, name } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Informe um e-mail Google válido para a simulação da prévia.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const displayName = (name && String(name).trim()) || normalizedEmail.split('@')[0];
    const simulatedSub = `google-preview-${crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 16)}`;
    const nowIso = new Date().toISOString();
    const db = getDb();

    if (audience === 'customer') {
      let customer = db
        .prepare('SELECT * FROM customer_accounts WHERE google_sub = ? OR email = ?')
        .get(simulatedSub, normalizedEmail) as Record<string, any> | undefined;

      if (!customer) {
        const id = crypto.randomUUID();
        db.prepare(
          `INSERT INTO customer_accounts (
            id, name, email, password_hash, google_sub, avatar_url, auth_provider, created_at, updated_at
          ) VALUES (?, ?, ?, '', ?, '', 'google_preview', ?, ?)`
        ).run(id, displayName, normalizedEmail, simulatedSub, nowIso, nowIso);
        customer = db.prepare('SELECT * FROM customer_accounts WHERE id = ?').get(id) as Record<string, any>;
      }

      const session = createCustomerSession(customer.id);
      setCustomerSessionCookie(res, session.token, session.expiresAt);
      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phoneE164: customer.phone_e164 || '',
          defaultAddress: customer.default_address || '',
          avatarUrl: customer.avatar_url || '',
          authProvider: customer.auth_provider || 'google_preview',
        },
      });
      return;
    }

    let user = db
      .prepare('SELECT id, name, email, avatar_url, auth_provider FROM users WHERE google_sub = ? OR email = ?')
      .get(simulatedSub, normalizedEmail) as
      | { id: string; name: string; email: string; avatar_url: string; auth_provider: string }
      | undefined;

    if (!user) {
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, google_sub, avatar_url, auth_provider, created_at)
         VALUES (?, ?, ?, '', ?, '', 'google_preview', ?)`
      ).run(id, displayName, normalizedEmail, simulatedSub, nowIso);
      user = {
        id,
        name: displayName,
        email: normalizedEmail,
        avatar_url: '',
        auth_provider: 'google_preview',
      };
    }

    const session = createUserSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);

    const stores = db
      .prepare(
        `SELECT s.*, m.role as my_role FROM stores s
         JOIN user_store_memberships m ON m.store_id = s.id
         WHERE m.user_id = ?
         ORDER BY s.created_at ASC`
      )
      .all(user.id) as Array<Record<string, any>>;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url || '',
        authProvider: user.auth_provider || 'google_preview',
        isPlatformAdmin: isPlatformAdminEmail(user.email),
      },
      stores: stores.map((s) => formatStoreSummary(s, s.my_role as StoreMemberRole)),
      needsStoreSetup: stores.length === 0,
    });
  });

  app.post('/api/auth/complete-google-store', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const { storeName, whatsapp, slug: rawSlug, pickupAddress, city, logoUrl } = req.body || {};

      if (!storeName || typeof storeName !== 'string' || storeName.trim().length < 2) {
        res.status(400).json({ error: 'Informe o nome do restaurante (mínimo 2 caracteres).' });
        return;
      }

      const waCheck = normalizeBrazilianWhatsApp(whatsapp || '');
      if (!waCheck.valid || !waCheck.normalized) {
        res.status(400).json({ error: waCheck.error });
        return;
      }

      const cleanSlug = sanitizeSlug(rawSlug || storeName);
      if (!cleanSlug || cleanSlug.length < 3) {
        res.status(400).json({ error: 'Endereço público do cardápio inválido (mínimo 3 caracteres).' });
        return;
      }

      const db = getDb();
      const existingSlug = db.prepare('SELECT id FROM stores WHERE slug = ?').get(cleanSlug);
      if (existingSlug) {
        res.status(409).json({
          error: `O endereço "/m/${cleanSlug}" já está em uso. Escolha outro identificador.`,
        });
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const oneYearLater = new Date(now);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      const periodEnd = oneYearLater.toISOString();

      const storeId = crypto.randomUUID();
      const categoryId = crypto.randomUUID();
      const subId = crypto.randomUUID();
      const annualPriceCents = getAnnualPlanPriceCents();

      db.exec('BEGIN;');
      try {
        db.prepare(
          `INSERT INTO stores (
            id, slug, name, description, logo_url, cover_url, whatsapp_e164,
            pickup_address, city, timezone, allow_delivery, allow_pickup, allow_table, allow_counter,
            is_paused, pause_reason, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          storeId,
          cleanSlug,
          storeName.trim(),
          'Cardápio digital com pedidos pelo WhatsApp.',
          typeof logoUrl === 'string' ? logoUrl.trim() : '',
          '',
          waCheck.normalized,
          (pickupAddress || 'Endereço a configurar nas configurações da loja').trim(),
          (city || 'Brasil').trim(),
          'America/Sao_Paulo',
          1,
          1,
          1,
          1,
          0,
          '',
          nowIso,
          nowIso
        );

        db.prepare(
          'INSERT INTO user_store_memberships (id, user_id, store_id, role, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), user.id, storeId, 'owner', nowIso);

        for (let day = 0; day <= 6; day++) {
          db.prepare(
            'INSERT INTO store_hours (id, store_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(crypto.randomUUID(), storeId, day, '08:00', '23:59', 0);
        }

        db.prepare(
          'INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), storeId, 'Centro', 500, 1);

        for (let i = 1; i <= 2; i++) {
          const code = String(i).padStart(2, '0');
          db.prepare(
            'INSERT INTO store_tables (id, store_id, label, table_code, seats, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(crypto.randomUUID(), storeId, `Mesa ${code}`, code, 4, 1, nowIso);
        }

        db.prepare(
          'INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(categoryId, storeId, 'Pratos Principais', 'Itens do cardápio.', 1, nowIso);

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

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const stores = db
        .prepare(
          `SELECT s.*, m.role as my_role FROM stores s
           JOIN user_store_memberships m ON m.store_id = s.id
           WHERE m.user_id = ?
           ORDER BY s.created_at ASC`
        )
        .all(user.id) as Array<Record<string, any>>;

      res.status(201).json({
        user,
        stores: stores.map((s) => formatStoreSummary(s, s.my_role as StoreMemberRole)),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao concluir cadastro da loja.' });
    }
  });

  // ============================================================================
  // PLATFORM SUPER-ADMIN (/admin — RESTRICTED VIA PLATFORM_ADMIN_EMAILS)
  // ============================================================================
  app.get('/api/admin/stores', requireAuth, requirePlatformAdmin, (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT
          s.*,
          sub.status as sub_status,
          sub.current_period_end as sub_period_end,
          (SELECT u.email FROM user_store_memberships m JOIN users u ON u.id = m.user_id WHERE m.store_id = s.id AND m.role = 'owner' LIMIT 1) as owner_email,
          (SELECT u.name FROM user_store_memberships m JOIN users u ON u.id = m.user_id WHERE m.store_id = s.id AND m.role = 'owner' LIMIT 1) as owner_name,
          (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) as orders_count,
          (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o WHERE o.store_id = s.id AND o.status != 'cancelado') as gmv_cents
        FROM stores s
        LEFT JOIN subscriptions sub ON sub.store_id = s.id
        ORDER BY s.created_at DESC`
      )
      .all() as Array<Record<string, any>>;

    const stores = rows.map((row) => ({
      ...formatStoreSummary(row),
      ownerEmail: row.owner_email || '',
      ownerName: row.owner_name || '',
      subscriptionStatus: row.sub_status || 'pendente',
      subscriptionPeriodEnd: row.sub_period_end || null,
      ordersCount: Number(row.orders_count || 0),
      gmvCents: Number(row.gmv_cents || 0),
      createdAt: row.created_at,
    }));

    res.json({ stores });
  });

  app.patch('/api/admin/stores/:storeId/status', requireAuth, requirePlatformAdmin, (req, res) => {
    const { storeId } = req.params;
    const { isPlatformBlocked, platformBlockReason } = req.body || {};
    const db = getDb();
    const store = getStoreFullRow(storeId);
    if (!store) {
      res.status(404).json({ error: 'Loja não encontrada.' });
      return;
    }

    const blockedInt = isPlatformBlocked ? 1 : 0;
    const reason = blockedInt ? String(platformBlockReason || 'Suspenso pela administração da plataforma.').trim() : '';

    db.prepare(
      'UPDATE stores SET is_platform_blocked = ?, platform_block_reason = ?, updated_at = ? WHERE id = ?'
    ).run(blockedInt, reason, new Date().toISOString(), storeId);

    const updated = getStoreFullRow(storeId)!;
    broadcastStoreEvent(storeId, 'store:updated', { storeId });
    broadcastPublicStoreEvent(updated.slug, 'store:updated', { slug: updated.slug });
    res.json({ store: formatStoreSummary(updated) });
  });

  // ============================================================================
  // INDIVIDUAL CUSTOMER ACCOUNTS (SEPARATED FROM MERCHANT STORES)
  // ============================================================================
  app.post('/api/customer/register', (req, res) => {
    try {
      const { name, email, password, phone, defaultAddress } = req.body || {};
      if (!name || String(name).trim().length < 2) {
        res.status(400).json({ error: 'Informe seu nome completo.' });
        return;
      }
      if (!email || !String(email).includes('@')) {
        res.status(400).json({ error: 'Informe um e-mail válido.' });
        return;
      }
      if (!password || String(password).length < 6) {
        res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        return;
      }

      let phoneE164 = '';
      if (phone && String(phone).trim()) {
        const wa = normalizeBrazilianWhatsApp(String(phone));
        if (!wa.valid || !wa.normalized) {
          res.status(400).json({ error: wa.error });
          return;
        }
        phoneE164 = wa.normalized;
      }

      const db = getDb();
      const normalizedEmail = String(email).trim().toLowerCase();
      const existing = db.prepare('SELECT id FROM customer_accounts WHERE email = ?').get(normalizedEmail);
      if (existing) {
        res.status(409).json({ error: 'Já existe uma conta de cliente com este e-mail.' });
        return;
      }

      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      db.prepare(
        `INSERT INTO customer_accounts (
          id, name, email, password_hash, phone_e164, default_address, auth_provider, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'password', ?, ?)`
      ).run(
        id,
        String(name).trim(),
        normalizedEmail,
        hashPassword(String(password)),
        phoneE164,
        String(defaultAddress || '').trim(),
        nowIso,
        nowIso
      );

      const session = createCustomerSession(id);
      setCustomerSessionCookie(res, session.token, session.expiresAt);

      res.status(201).json({
        customer: {
          id,
          name: String(name).trim(),
          email: normalizedEmail,
          phoneE164,
          defaultAddress: String(defaultAddress || '').trim(),
          avatarUrl: '',
          authProvider: 'password',
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao criar conta de cliente.' });
    }
  });

  app.post('/api/customer/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Informe e-mail e senha.' });
      return;
    }

    const db = getDb();
    const customer = db
      .prepare('SELECT * FROM customer_accounts WHERE email = ?')
      .get(String(email).trim().toLowerCase()) as Record<string, any> | undefined;

    if (!customer || !verifyPassword(String(password), customer.password_hash)) {
      res.status(401).json({ error: 'E-mail ou senha inválidos.' });
      return;
    }

    const session = createCustomerSession(customer.id);
    setCustomerSessionCookie(res, session.token, session.expiresAt);

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phoneE164: customer.phone_e164 || '',
        defaultAddress: customer.default_address || '',
        avatarUrl: customer.avatar_url || '',
        authProvider: customer.auth_provider || 'password',
      },
    });
  });

  app.post('/api/customer/logout', (req, res) => {
    destroyCustomerSessionFromRequest(req);
    clearCustomerSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/customer/me', (req, res) => {
    const customer = getAuthenticatedCustomer(req);
    if (!customer) {
      res.status(401).json({ error: 'Cliente não autenticado.' });
      return;
    }
    res.json({ customer });
  });

  app.patch('/api/customer/profile', requireCustomerAuth, (req: AuthenticatedRequest, res) => {
    const customer = req.authCustomer!;
    const { name, phone, defaultAddress } = req.body || {};
    let nextPhone = customer.phoneE164;
    if (phone !== undefined) {
      if (String(phone).trim() === '') {
        nextPhone = '';
      } else {
        const wa = normalizeBrazilianWhatsApp(String(phone));
        if (!wa.valid || !wa.normalized) {
          res.status(400).json({ error: wa.error });
          return;
        }
        nextPhone = wa.normalized;
      }
    }

    const db = getDb();
    db.prepare(
      'UPDATE customer_accounts SET name = ?, phone_e164 = ?, default_address = ?, updated_at = ? WHERE id = ?'
    ).run(
      name !== undefined ? String(name).trim() : customer.name,
      nextPhone,
      defaultAddress !== undefined ? String(defaultAddress).trim() : customer.defaultAddress,
      new Date().toISOString(),
      customer.id
    );

    const updated = getAuthenticatedCustomer(req);
    res.json({ customer: updated });
  });

  app.get('/api/customer/orders', requireCustomerAuth, (req: AuthenticatedRequest, res) => {
    const customer = req.authCustomer!;
    const storeSlug = typeof req.query.storeSlug === 'string' ? sanitizeSlug(req.query.storeSlug) : '';
    const db = getDb();

    const rows = storeSlug
      ? (db
          .prepare(
            `SELECT o.*, s.name as store_name, s.slug as store_slug
             FROM orders o
             JOIN stores s ON s.id = o.store_id
             WHERE o.customer_id = ? AND s.slug = ?
             ORDER BY o.created_at DESC LIMIT 50`
          )
          .all(customer.id, storeSlug) as Array<Record<string, any>>)
      : (db
          .prepare(
            `SELECT o.*, s.name as store_name, s.slug as store_slug
             FROM orders o
             JOIN stores s ON s.id = o.store_id
             WHERE o.customer_id = ?
             ORDER BY o.created_at DESC LIMIT 50`
          )
          .all(customer.id) as Array<Record<string, any>>);

    const orders = rows.map((ord) => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(ord.id) as Array<Record<string, any>>;
      return formatOrderRow(ord, items);
    });

    res.json({ orders });
  });

  // ============================================================================
  // PRIVATE MERCHANT ENDPOINTS (ISOLATED BY storeId + MEMBERSHIP + ROLE CHECK)
  // ============================================================================
  app.get('/api/stores/:storeId/overview', requireAuth, requireStoreMembership, (req: AuthenticatedRequest, res) => {
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
    const tables = db
      .prepare('SELECT * FROM store_tables WHERE store_id = ? ORDER BY table_code ASC, created_at ASC')
      .all(storeId) as Array<Record<string, any>>;
    const subscription = getStoreSubscription(storeId);
    const paymentEvents = db
      .prepare('SELECT * FROM payment_events WHERE store_id = ? ORDER BY processed_at DESC LIMIT 20')
      .all(storeId);

    const recentOrders = db
      .prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(storeId) as Array<Record<string, any>>;

    const ordersWithItems = recentOrders.map((ord) => {
      const items = db
        .prepare('SELECT * FROM order_items WHERE order_id = ?')
        .all(ord.id) as Array<Record<string, any>>;
      return formatOrderRow(ord, items);
    });

    const cashRegisterState = getOpenCashRegisterState(storeId);

    res.json({
      store: formatStoreSummary(store, req.storeRole),
      categories,
      products: products.map(formatProductRow),
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
      tables: tables.map((t) => ({
        ...t,
        isActive: Boolean(t.is_active),
      })),
      cashRegister: cashRegisterState,
      subscription,
      paymentEvents,
      orders: ordersWithItems,
    });
  });

  app.patch(
    '/api/stores/:storeId/settings',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req: AuthenticatedRequest, res) => {
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
        allowTable,
        allowCounter,
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
      const nextAllowTable =
        allowTable !== undefined
          ? allowTable
            ? 1
            : 0
          : current.allow_table === undefined
          ? 1
          : current.allow_table;
      const nextAllowCounter =
        allowCounter !== undefined
          ? allowCounter
            ? 1
            : 0
          : current.allow_counter === undefined
          ? 1
          : current.allow_counter;

      if (nextAllowDelivery === 0 && nextAllowPickup === 0 && nextAllowTable === 0 && nextAllowCounter === 0) {
        res.status(400).json({
          error: 'Mantenha pelo menos uma modalidade ativa (Entrega, Retirada, Mesa ou Balcão).',
        });
        return;
      }

      db.prepare(
        `UPDATE stores SET
          slug = ?, name = ?, description = ?, logo_url = ?, cover_url = ?,
          whatsapp_e164 = ?, pickup_address = ?, city = ?, timezone = ?,
          allow_delivery = ?, allow_pickup = ?, allow_table = ?, allow_counter = ?,
          is_paused = ?, pause_reason = ?, updated_at = ?
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
        nextAllowTable,
        nextAllowCounter,
        isPaused !== undefined ? (isPaused ? 1 : 0) : current.is_paused,
        pauseReason !== undefined ? String(pauseReason).trim() : current.pause_reason,
        new Date().toISOString(),
        storeId
      );

      const updated = getStoreFullRow(storeId)!;
      broadcastStoreEvent(storeId, 'store:updated', { storeId });
      broadcastPublicStoreEvent(updated.slug, 'store:updated', { slug: updated.slug });
      res.json({ store: formatStoreSummary(updated, req.storeRole) });
    }
  );

  app.put(
    '/api/stores/:storeId/hours',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req: AuthenticatedRequest, res) => {
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
      broadcastPublicStoreEvent(updated.slug, 'store:updated', { slug: updated.slug });
      res.json({
        store: formatStoreSummary(updated, req.storeRole),
        hours: getStoreHours(storeId).map((h) => ({
          dayOfWeek: h.day_of_week,
          openTime: h.open_time,
          closeTime: h.close_time,
          isClosed: Boolean(h.is_closed),
        })),
      });
    }
  );

  // Categories CRUD
  app.post(
    '/api/stores/:storeId/categories',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
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

      const store = getStoreFullRow(storeId);
      if (store) broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });

      const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND store_id = ?').get(id, storeId);
      res.status(201).json({ category: cat });
    }
  );

  app.patch(
    '/api/stores/:storeId/categories/:categoryId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
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
      const store = getStoreFullRow(storeId);
      if (store) broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });

      const updated = db.prepare('SELECT * FROM categories WHERE id = ? AND store_id = ?').get(categoryId, storeId);
      res.json({ category: updated });
    }
  );

  app.delete(
    '/api/stores/:storeId/categories/:categoryId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
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
      const store = getStoreFullRow(storeId);
      if (store) broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });
      res.json({ ok: true });
    }
  );

  // Products CRUD (with sizes/variations and addons)
  app.post(
    '/api/stores/:storeId/products',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const storeId = req.params.storeId;
      const { categoryId, name, description, priceCents, imageUrl, isAvailable, sizes, addons } = req.body || {};
      if (!name || String(name).trim().length < 2) {
        res.status(400).json({ error: 'Informe o nome do produto.' });
        return;
      }
      const parsedPrice = Number(priceCents);
      if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
        res.status(400).json({ error: 'Preço inválido (deve ser em centavos >= 0).' });
        return;
      }

      const variantCheck = validateAndNormalizeVariants(sizes ?? [], addons ?? []);
      if (!variantCheck.ok) {
        res.status(400).json({ error: (variantCheck as { ok: false; error: string }).error });
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
          id, store_id, category_id, name, description, price_cents, sizes_json, addons_json,
          image_url, is_available, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        storeId,
        categoryId,
        String(name).trim(),
        String(description || '').trim(),
        parsedPrice,
        JSON.stringify(variantCheck.sizes),
        JSON.stringify(variantCheck.addons),
        String(imageUrl || '').trim(),
        isAvailable === false ? 0 : 1,
        maxOrder.m + 1,
        nowIso,
        nowIso
      );

      const store = getStoreFullRow(storeId);
      if (store) {
        broadcastStoreEvent(storeId, 'menu:updated', { storeId });
        broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });
      }

      const created = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(id, storeId) as Record<string, any>;
      res.status(201).json({ product: formatProductRow(created) });
    }
  );

  app.patch(
    '/api/stores/:storeId/products/:productId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const { storeId, productId } = req.params;
      const db = getDb();
      const existing = db
        .prepare('SELECT * FROM products WHERE id = ? AND store_id = ?')
        .get(productId, storeId) as Record<string, any> | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
        return;
      }

      const { categoryId, name, description, priceCents, imageUrl, isAvailable, sizes, addons } = req.body || {};

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

      let nextSizesJson = existing.sizes_json || '[]';
      let nextAddonsJson = existing.addons_json || '[]';
      if (sizes !== undefined || addons !== undefined) {
        const currentSizes = parseSizesJson(existing.sizes_json);
        const currentAddons = parseAddonsJson(existing.addons_json);
        const variantCheck = validateAndNormalizeVariants(
          sizes !== undefined ? sizes : currentSizes,
          addons !== undefined ? addons : currentAddons
        );
        if (!variantCheck.ok) {
          res.status(400).json({ error: (variantCheck as { ok: false; error: string }).error });
          return;
        }
        nextSizesJson = JSON.stringify(variantCheck.sizes);
        nextAddonsJson = JSON.stringify(variantCheck.addons);
      }

      db.prepare(
        `UPDATE products SET
          category_id = ?, name = ?, description = ?, price_cents = ?,
          sizes_json = ?, addons_json = ?, image_url = ?, is_available = ?, updated_at = ?
         WHERE id = ? AND store_id = ?`
      ).run(
        categoryId !== undefined ? categoryId : existing.category_id,
        name !== undefined ? String(name).trim() : existing.name,
        description !== undefined ? String(description).trim() : existing.description,
        nextPrice,
        nextSizesJson,
        nextAddonsJson,
        imageUrl !== undefined ? String(imageUrl).trim() : existing.image_url,
        isAvailable !== undefined ? (isAvailable ? 1 : 0) : existing.is_available,
        new Date().toISOString(),
        productId,
        storeId
      );

      const store = getStoreFullRow(storeId);
      if (store) {
        broadcastStoreEvent(storeId, 'menu:updated', { storeId });
        broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });
      }

      const updated = db
        .prepare('SELECT * FROM products WHERE id = ? AND store_id = ?')
        .get(productId, storeId) as Record<string, any>;
      res.json({ product: formatProductRow(updated) });
    }
  );

  app.delete(
    '/api/stores/:storeId/products/:productId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const { storeId, productId } = req.params;
      const db = getDb();
      const result = db.prepare('DELETE FROM products WHERE id = ? AND store_id = ?').run(productId, storeId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Produto não encontrado nesta loja.' });
        return;
      }
      const store = getStoreFullRow(storeId);
      if (store) {
        broadcastStoreEvent(storeId, 'menu:updated', { storeId });
        broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });
      }
      res.json({ ok: true });
    }
  );

  // Neighborhoods CRUD
  app.post(
    '/api/stores/:storeId/neighborhoods',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
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
      const store = getStoreFullRow(storeId);
      if (store) broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });
      const created = db
        .prepare('SELECT * FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
        .get(id, storeId) as Record<string, any>;
      res.status(201).json({ neighborhood: { ...created, isActive: Boolean(created.is_active) } });
    }
  );

  app.patch(
    '/api/stores/:storeId/neighborhoods/:neighborhoodId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
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
      const store = getStoreFullRow(storeId);
      if (store) broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });
      const updated = db
        .prepare('SELECT * FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
        .get(neighborhoodId, storeId) as Record<string, any>;
      res.json({ neighborhood: { ...updated, isActive: Boolean(updated.is_active) } });
    }
  );

  app.delete(
    '/api/stores/:storeId/neighborhoods/:neighborhoodId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const { storeId, neighborhoodId } = req.params;
      const db = getDb();
      const result = db
        .prepare('DELETE FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
        .run(neighborhoodId, storeId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Bairro não encontrado nesta loja.' });
        return;
      }
      const store = getStoreFullRow(storeId);
      if (store) broadcastPublicStoreEvent(store.slug, 'menu:updated', { storeId });
      res.json({ ok: true });
    }
  );

  // ============================================================================
  // TABLES / COMANDAS & PER-TABLE QR CODES
  // ============================================================================
  app.get('/api/stores/:storeId/tables', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const db = getDb();
    const tables = db
      .prepare('SELECT * FROM store_tables WHERE store_id = ? ORDER BY table_code ASC, created_at ASC')
      .all(storeId) as Array<Record<string, any>>;
    res.json({ tables: tables.map((t) => ({ ...t, isActive: Boolean(t.is_active) })) });
  });

  app.post(
    '/api/stores/:storeId/tables',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const storeId = req.params.storeId;
      const { label, tableCode, seats } = req.body || {};
      const cleanLabel = String(label || '').trim();
      if (!cleanLabel || cleanLabel.length < 1) {
        res.status(400).json({ error: 'Informe a identificação da mesa (ex: Mesa 05).' });
        return;
      }
      const rawCode = String(tableCode || cleanLabel).trim();
      const cleanCode = sanitizeSlug(rawCode).slice(0, 20) || crypto.randomBytes(3).toString('hex');
      const parsedSeats = seats !== undefined ? Number(seats) : 4;
      if (!Number.isInteger(parsedSeats) || parsedSeats < 1 || parsedSeats > 40) {
        res.status(400).json({ error: 'Quantidade de lugares inválida (1 a 40).' });
        return;
      }

      const db = getDb();
      const duplicate = db
        .prepare('SELECT id FROM store_tables WHERE store_id = ? AND table_code = ?')
        .get(storeId, cleanCode);
      if (duplicate) {
        res.status(409).json({ error: `Já existe uma mesa com código "${cleanCode}".` });
        return;
      }

      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      db.prepare(
        'INSERT INTO store_tables (id, store_id, label, table_code, seats, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, storeId, cleanLabel, cleanCode, parsedSeats, 1, nowIso);

      const created = db.prepare('SELECT * FROM store_tables WHERE id = ?').get(id) as Record<string, any>;
      res.status(201).json({ table: { ...created, isActive: Boolean(created.is_active) } });
    }
  );

  app.patch(
    '/api/stores/:storeId/tables/:tableId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const { storeId, tableId } = req.params;
      const db = getDb();
      const existing = db
        .prepare('SELECT * FROM store_tables WHERE id = ? AND store_id = ?')
        .get(tableId, storeId) as Record<string, any> | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Mesa não encontrada nesta loja.' });
        return;
      }

      const { label, tableCode, seats, isActive } = req.body || {};
      const nextCode = tableCode !== undefined ? sanitizeSlug(String(tableCode)).slice(0, 20) : existing.table_code;
      if (!nextCode) {
        res.status(400).json({ error: 'Código da mesa inválido.' });
        return;
      }
      if (nextCode !== existing.table_code) {
        const conflict = db
          .prepare('SELECT id FROM store_tables WHERE store_id = ? AND table_code = ? AND id != ?')
          .get(storeId, nextCode, tableId);
        if (conflict) {
          res.status(409).json({ error: `Código "${nextCode}" já está em uso por outra mesa.` });
          return;
        }
      }

      const nextSeats = seats !== undefined ? Number(seats) : existing.seats;
      if (!Number.isInteger(nextSeats) || nextSeats < 1 || nextSeats > 40) {
        res.status(400).json({ error: 'Quantidade de lugares inválida.' });
        return;
      }

      db.prepare(
        'UPDATE store_tables SET label = ?, table_code = ?, seats = ?, is_active = ? WHERE id = ? AND store_id = ?'
      ).run(
        label !== undefined ? String(label).trim() : existing.label,
        nextCode,
        nextSeats,
        isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
        tableId,
        storeId
      );

      const updated = db.prepare('SELECT * FROM store_tables WHERE id = ?').get(tableId) as Record<string, any>;
      res.json({ table: { ...updated, isActive: Boolean(updated.is_active) } });
    }
  );

  app.delete(
    '/api/stores/:storeId/tables/:tableId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const { storeId, tableId } = req.params;
      const db = getDb();
      const result = db.prepare('DELETE FROM store_tables WHERE id = ? AND store_id = ?').run(tableId, storeId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Mesa não encontrada nesta loja.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  // ============================================================================
  // STORE TEAM / STAFF MEMBERS (RBAC ISOLATED PER STORE)
  // ============================================================================
  app.get(
    '/api/stores/:storeId/team',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const storeId = req.params.storeId;
      const db = getDb();
      const members = db
        .prepare(
          `SELECT m.id, m.user_id, m.role, m.created_at, u.name, u.email
           FROM user_store_memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.store_id = ?
           ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, m.created_at ASC`
        )
        .all(storeId);
      res.json({ members });
    }
  );

  app.post(
    '/api/stores/:storeId/team',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const storeId = req.params.storeId;
      const { name, email, password, role } = req.body || {};
      const allowedRoles: StoreMemberRole[] = ['manager', 'kitchen', 'waiter', 'cashier'];
      if (!allowedRoles.includes(role)) {
        res.status(400).json({ error: 'Perfil inválido. Escolha gerente, cozinha, garçom ou caixa.' });
        return;
      }
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        res.status(400).json({ error: 'Informe um e-mail válido para o colaborador.' });
        return;
      }

      const db = getDb();
      const nowIso = new Date().toISOString();
      let user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(cleanEmail) as
        | { id: string; name: string; email: string }
        | undefined;

      if (!user) {
        const cleanName = String(name || '').trim();
        if (cleanName.length < 2) {
          res.status(400).json({ error: 'Informe o nome do colaborador (mínimo 2 caracteres).' });
          return;
        }
        if (!password || String(password).length < 6) {
          res.status(400).json({ error: 'Defina uma senha inicial de pelo menos 6 caracteres.' });
          return;
        }
        const newUserId = crypto.randomUUID();
        db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
          newUserId,
          cleanName,
          cleanEmail,
          hashPassword(String(password)),
          nowIso
        );
        user = { id: newUserId, name: cleanName, email: cleanEmail };
      }

      const existingMembership = db
        .prepare('SELECT id FROM user_store_memberships WHERE user_id = ? AND store_id = ?')
        .get(user.id, storeId);
      if (existingMembership) {
        res.status(409).json({ error: 'Este usuário já faz parte da equipe desta loja.' });
        return;
      }

      const membershipId = crypto.randomUUID();
      db.prepare('INSERT INTO user_store_memberships (id, user_id, store_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
        membershipId,
        user.id,
        storeId,
        role,
        nowIso
      );

      res.status(201).json({
        member: {
          id: membershipId,
          user_id: user.id,
          role,
          created_at: nowIso,
          name: user.name,
          email: user.email,
        },
      });
    }
  );

  app.delete(
    '/api/stores/:storeId/team/:userId',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
      const { storeId, userId } = req.params;
      const db = getDb();
      const target = db
        .prepare('SELECT role FROM user_store_memberships WHERE user_id = ? AND store_id = ?')
        .get(userId, storeId) as { role: string } | undefined;
      if (!target) {
        res.status(404).json({ error: 'Colaborador não encontrado nesta loja.' });
        return;
      }
      if (target.role === 'owner') {
        res.status(400).json({ error: 'Não é possível remover o proprietário principal da loja.' });
        return;
      }
      db.prepare('DELETE FROM user_store_memberships WHERE user_id = ? AND store_id = ?').run(userId, storeId);
      res.json({ ok: true });
    }
  );

  // ============================================================================
  // ORDERS, KDS, WAITER & POS SETTLEMENT
  // ============================================================================
  app.get('/api/stores/:storeId/orders', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const db = getDb();
    const orders = statusFilter
      ? (db
          .prepare('SELECT * FROM orders WHERE store_id = ? AND status = ? ORDER BY created_at DESC LIMIT 120')
          .all(storeId, statusFilter) as Array<Record<string, any>>)
      : (db
          .prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 120')
          .all(storeId) as Array<Record<string, any>>);

    const enriched = orders.map((ord) => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(ord.id) as Array<Record<string, any>>;
      return formatOrderRow(ord, items);
    });

    res.json({ orders: enriched });
  });

  app.post(
    '/api/stores/:storeId/orders',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager', 'waiter', 'cashier']),
    (req: AuthenticatedRequest, res) => {
      const storeId = req.params.storeId;
      const db = getDb();
      const store = getStoreFullRow(storeId);
      if (!store) {
        res.status(404).json({ error: 'Loja não encontrada.' });
        return;
      }

      const {
        idempotencyKey,
        customerName,
        fulfillmentType,
        source,
        tableId,
        tableCode,
        neighborhoodId,
        deliveryAddress,
        notes,
        items,
        paymentMethod,
        markPaid,
        paidCents,
        changeForCents,
        initialStatus,
      } = req.body || {};

      const cleanIdem = idempotencyKey && String(idempotencyKey).trim().length >= 8
        ? String(idempotencyKey).trim()
        : `staff-${crypto.randomUUID()}`;

      const existingOrder = db
        .prepare('SELECT * FROM orders WHERE store_id = ? AND idempotency_key = ?')
        .get(storeId, cleanIdem) as Record<string, any> | undefined;
      if (existingOrder) {
        const existingItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(existingOrder.id) as Array<Record<string, any>>;
        res.status(200).json({ deduplicated: true, order: formatOrderRow(existingOrder, existingItems) });
        return;
      }

      const cleanSource = source === 'pos' ? 'pos' : 'waiter';
      if (!['table', 'counter', 'pickup', 'delivery'].includes(fulfillmentType)) {
        res.status(400).json({ error: 'Modalidade de pedido inválida.' });
        return;
      }
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Adicione pelo menos um item ao pedido.' });
        return;
      }

      let resolvedTableId: string | null = null;
      let resolvedTableLabel: string | null = null;
      if (fulfillmentType === 'table') {
        const tbl = tableId
          ? (db.prepare('SELECT * FROM store_tables WHERE id = ? AND store_id = ?').get(tableId, storeId) as Record<string, any> | undefined)
          : tableCode
          ? (db.prepare('SELECT * FROM store_tables WHERE table_code = ? AND store_id = ?').get(String(tableCode), storeId) as Record<string, any> | undefined)
          : undefined;
        if (!tbl) {
          res.status(400).json({ error: 'Selecione uma mesa válida desta loja.' });
          return;
        }
        resolvedTableId = tbl.id;
        resolvedTableLabel = tbl.label;
      }

      let deliveryFeeCents = 0;
      let resolvedNeighborhoodId: string | null = null;
      let resolvedNeighborhoodName: string | null = null;
      let resolvedDeliveryAddress: string | null = null;

      if (fulfillmentType === 'delivery') {
        if (!neighborhoodId) {
          res.status(400).json({ error: 'Selecione o bairro para entrega.' });
          return;
        }
        const nb = db
          .prepare('SELECT id, name, fee_cents, is_active FROM delivery_neighborhoods WHERE id = ? AND store_id = ?')
          .get(neighborhoodId, storeId) as { id: string; name: string; fee_cents: number; is_active: number } | undefined;
        if (!nb) {
          res.status(400).json({ error: 'Bairro inválido para esta loja.' });
          return;
        }
        deliveryFeeCents = nb.fee_cents;
        resolvedNeighborhoodId = nb.id;
        resolvedNeighborhoodName = nb.name;
        resolvedDeliveryAddress = String(deliveryAddress || '').trim();
      }

      const verifiedItems: Array<{
        productId: string;
        productName: string;
        selectedSize: ProductSizeOption | null;
        selectedAddons: ProductAddonOption[];
        variantKey: string;
        unitPriceCents: number;
        quantity: number;
        lineTotalCents: number;
      }> = [];

      for (const rawItem of items) {
        const productId = String(rawItem?.productId || '');
        const quantity = Number(rawItem?.quantity);
        if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
          res.status(400).json({ error: 'Item ou quantidade inválida.' });
          return;
        }
        const product = db
          .prepare('SELECT id, name, price_cents, sizes_json, addons_json, is_available FROM products WHERE id = ? AND store_id = ?')
          .get(productId, storeId) as Record<string, any> | undefined;

        if (!product || !product.is_available) {
          res.status(400).json({ error: 'Um dos produtos selecionados não está disponível.' });
          return;
        }

        const availableSizes = parseSizesJson(product.sizes_json);
        const availableAddons = parseAddonsJson(product.addons_json);

        let chosenSize: ProductSizeOption | null = null;
        let basePriceCents = product.price_cents;
        if (availableSizes.length > 0) {
          const wantedSizeId = rawItem?.selectedSizeId ? String(rawItem.selectedSizeId) : availableSizes[0].id;
          const matchedSize = availableSizes.find((s) => s.id === wantedSizeId);
          if (!matchedSize) {
            res.status(400).json({ error: `Tamanho inválido para "${product.name}".` });
            return;
          }
          chosenSize = matchedSize;
          basePriceCents = matchedSize.priceCents;
        }

        const chosenAddons: ProductAddonOption[] = [];
        const rawAddonIds = Array.isArray(rawItem?.selectedAddonIds) ? rawItem.selectedAddonIds : [];
        for (const addonId of rawAddonIds) {
          const matchedAddon = availableAddons.find((a) => a.id === String(addonId));
          if (!matchedAddon) {
            res.status(400).json({ error: `Adicional inválido para "${product.name}".` });
            return;
          }
          chosenAddons.push(matchedAddon);
        }

        const addonsTotal = chosenAddons.reduce((acc, a) => acc + a.priceCents, 0);
        const unitPriceCents = basePriceCents + addonsTotal;
        const variantKey = `${product.id}::${chosenSize?.id || ''}::${chosenAddons
          .map((a) => a.id)
          .sort()
          .join(',')}`;

        verifiedItems.push({
          productId: product.id,
          productName: product.name,
          selectedSize: chosenSize,
          selectedAddons: chosenAddons,
          variantKey,
          unitPriceCents,
          quantity,
          lineTotalCents: unitPriceCents * quantity,
        });
      }

      const subtotalCents = verifiedItems.reduce((acc, it) => acc + it.lineTotalCents, 0);
      const totalCents = subtotalCents + deliveryFeeCents;
      const nowIso = new Date().toISOString();

      const validPayMethods = ['whatsapp', 'pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outro'];
      const chosenPaymentMethod = validPayMethods.includes(paymentMethod)
        ? paymentMethod
        : cleanSource === 'pos'
        ? 'dinheiro'
        : 'outro';
      const isPaid = Boolean(markPaid);
      const effectiveStatus =
        initialStatus && ['novo', 'aceito', 'concluido'].includes(initialStatus) ? initialStatus : 'novo';
      const resolvedCustomerName =
        String(customerName || '').trim() ||
        resolvedTableLabel ||
        (fulfillmentType === 'counter' ? 'Cliente Balcão' : 'Cliente Salão');

      const createdOrderId = crypto.randomUUID();
      let orderNumber = 101;

      db.exec('BEGIN IMMEDIATE;');
      try {
        const maxNumRow = db
          .prepare('SELECT COALESCE(MAX(order_number), 100) as maxNum FROM orders WHERE store_id = ?')
          .get(storeId) as { maxNum: number };
        orderNumber = maxNumRow.maxNum + 1;

        const whatsappMessage = buildWhatsAppOrderMessage({
          storeName: store.name,
          orderNumber,
          customerName: resolvedCustomerName,
          fulfillmentType,
          tableLabel: resolvedTableLabel,
          items: verifiedItems.map((it) => ({
            quantity: it.quantity,
            productName: it.productName,
            sizeName: it.selectedSize?.name || null,
            addonNames: it.selectedAddons.map((a) => a.name),
            lineTotalCents: it.lineTotalCents,
          })),
          neighborhoodName: resolvedNeighborhoodName,
          subtotalCents,
          deliveryFeeCents,
          deliveryAddress: resolvedDeliveryAddress,
          pickupAddress: store.pickup_address,
          totalCents,
          notes: notes ? String(notes).trim() : '',
        });

        db.prepare(
          `INSERT INTO orders (
            id, order_number, store_id, customer_id, idempotency_key, customer_name,
            fulfillment_type, source, table_id, table_label,
            neighborhood_id, neighborhood_name, delivery_address, notes,
            subtotal_cents, delivery_fee_cents, total_cents,
            status, payment_method, payment_status, paid_cents, change_for_cents,
            created_by_user_id, whatsapp_message, whatsapp_url,
            accepted_at, completed_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          createdOrderId,
          orderNumber,
          storeId,
          null,
          cleanIdem,
          resolvedCustomerName,
          fulfillmentType,
          cleanSource,
          resolvedTableId,
          resolvedTableLabel,
          resolvedNeighborhoodId,
          resolvedNeighborhoodName,
          resolvedDeliveryAddress,
          notes ? String(notes).trim() : '',
          subtotalCents,
          deliveryFeeCents,
          totalCents,
          effectiveStatus,
          chosenPaymentMethod,
          isPaid ? 'paid' : 'pending',
          isPaid ? Number(paidCents ?? totalCents) : 0,
          Number(changeForCents || 0),
          req.authUser!.id,
          whatsappMessage,
          store.whatsapp_e164 ? buildWhatsAppUrl(store.whatsapp_e164, whatsappMessage) : '',
          effectiveStatus === 'aceito' || effectiveStatus === 'concluido' ? nowIso : null,
          effectiveStatus === 'concluido' ? nowIso : null,
          nowIso
        );

        for (const item of verifiedItems) {
          db.prepare(
            `INSERT INTO order_items (
              id, order_id, product_id, product_name_snapshot,
              selected_size_json, selected_addons_json, variant_key,
              unit_price_cents, quantity, line_total_cents
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            createdOrderId,
            item.productId,
            item.productName,
            item.selectedSize ? JSON.stringify(item.selectedSize) : '',
            JSON.stringify(item.selectedAddons),
            item.variantKey,
            item.unitPriceCents,
            item.quantity,
            item.lineTotalCents
          );
        }

        if (isPaid) {
          recordCashSaleIfRegisterOpen({
            storeId,
            orderId: createdOrderId,
            orderNumber,
            amountCents: totalCents,
            paymentMethod: chosenPaymentMethod,
            userId: req.authUser!.id,
            userName: req.authUser!.name,
            nowIso,
          });
        }

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const savedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(createdOrderId) as Record<string, any>;
      const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(createdOrderId) as Array<Record<string, any>>;
      const enriched = formatOrderRow(savedOrder, savedItems);

      broadcastStoreEvent(storeId, 'order:created', { order: enriched });
      if (isPaid) {
        broadcastStoreEvent(storeId, 'cash:updated', { storeId });
      }
      res.status(201).json({ deduplicated: false, order: enriched });
    }
  );

  app.patch('/api/stores/:storeId/orders/:orderId/status', requireAuth, requireStoreMembership, (req, res) => {
    const { storeId, orderId } = req.params;
    const { status } = req.body || {};
    const allowed = ['novo', 'aceito', 'em_preparo', 'pronto', 'concluido', 'cancelado'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Status de pedido inválido.' });
      return;
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as
      | Record<string, any>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Pedido não encontrado nesta loja.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const acceptedAt = existing.accepted_at || (status === 'aceito' ? nowIso : null);
    const preparingAt = existing.preparing_at || (status === 'em_preparo' ? nowIso : null);
    const readyAt = existing.ready_at || (status === 'pronto' ? nowIso : null);
    const completedAt = existing.completed_at || (status === 'concluido' ? nowIso : null);
    const cancelledAt = existing.cancelled_at || (status === 'cancelado' ? nowIso : null);

    db.prepare(
      `UPDATE orders SET
        status = ?, accepted_at = ?, preparing_at = ?, ready_at = ?, completed_at = ?, cancelled_at = ?
       WHERE id = ? AND store_id = ?`
    ).run(status, acceptedAt, preparingAt, readyAt, completedAt, cancelledAt, orderId, storeId);

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, any>;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as Array<Record<string, any>>;
    const enriched = formatOrderRow(updated, items);

    broadcastStoreEvent(storeId, 'order:updated', { order: enriched });
    res.json({ ok: true, status, order: enriched });
  });

  app.post(
    '/api/stores/:storeId/orders/:orderId/pay',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager', 'cashier', 'waiter']),
    (req: AuthenticatedRequest, res) => {
      const { storeId, orderId } = req.params;
      const { paymentMethod, paidCents, changeForCents, completeOrder } = req.body || {};
      const validPayMethods = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'outro'];
      if (!validPayMethods.includes(paymentMethod)) {
        res.status(400).json({ error: 'Forma de pagamento inválida.' });
        return;
      }

      const db = getDb();
      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(orderId, storeId) as
        | Record<string, any>
        | undefined;
      if (!order) {
        res.status(404).json({ error: 'Pedido não encontrado nesta loja.' });
        return;
      }
      if (order.status === 'cancelado') {
        res.status(400).json({ error: 'Não é possível receber pagamento de um pedido cancelado.' });
        return;
      }
      if (order.payment_status === 'paid') {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as Array<Record<string, any>>;
        res.status(200).json({ alreadyPaid: true, order: formatOrderRow(order, items) });
        return;
      }

      const nowIso = new Date().toISOString();
      const resolvedPaid = paidCents !== undefined ? Number(paidCents) : order.total_cents;
      if (!Number.isInteger(resolvedPaid) || resolvedPaid < order.total_cents) {
        res.status(400).json({ error: 'Valor recebido não pode ser menor que o total do pedido.' });
        return;
      }

      const nextStatus = completeOrder ? 'concluido' : order.status;
      const completedAt = completeOrder ? order.completed_at || nowIso : order.completed_at;

      db.exec('BEGIN IMMEDIATE;');
      try {
        db.prepare(
          `UPDATE orders SET
            payment_method = ?, payment_status = 'paid', paid_cents = ?, change_for_cents = ?,
            status = ?, completed_at = ?
           WHERE id = ? AND store_id = ?`
        ).run(
          paymentMethod,
          resolvedPaid,
          Number(changeForCents || 0),
          nextStatus,
          completedAt,
          orderId,
          storeId
        );

        recordCashSaleIfRegisterOpen({
          storeId,
          orderId,
          orderNumber: order.order_number,
          amountCents: order.total_cents,
          paymentMethod,
          userId: req.authUser!.id,
          userName: req.authUser!.name,
          nowIso,
        });

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, any>;
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as Array<Record<string, any>>;
      const enriched = formatOrderRow(updated, items);

      broadcastStoreEvent(storeId, 'order:updated', { order: enriched });
      broadcastStoreEvent(storeId, 'cash:updated', { storeId });
      res.json({ ok: true, order: enriched });
    }
  );

  // ============================================================================
  // CASH REGISTER (PDV / CAIXA)
  // ============================================================================
  app.get('/api/stores/:storeId/cash-register', requireAuth, requireStoreMembership, (req, res) => {
    const storeId = req.params.storeId;
    res.json(getOpenCashRegisterState(storeId));
  });

  app.post(
    '/api/stores/:storeId/cash-register/open',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager', 'cashier']),
    (req: AuthenticatedRequest, res) => {
      const storeId = req.params.storeId;
      const { openingBalanceCents, notes } = req.body || {};
      const parsedOpening = Number(openingBalanceCents ?? 0);
      if (!Number.isInteger(parsedOpening) || parsedOpening < 0) {
        res.status(400).json({ error: 'Saldo inicial inválido (centavos >= 0).' });
        return;
      }

      const db = getDb();
      const existingOpen = db
        .prepare("SELECT id FROM cash_registers WHERE store_id = ? AND status = 'open'")
        .get(storeId);
      if (existingOpen) {
        res.status(409).json({ error: 'Já existe um caixa aberto para esta loja. Feche-o antes de abrir outro.' });
        return;
      }

      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      db.prepare(
        `INSERT INTO cash_registers (
          id, store_id, opened_by_user_id, opened_by_name, status,
          opening_balance_cents, expected_closing_cents, notes, opened_at
        ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)`
      ).run(
        id,
        storeId,
        req.authUser!.id,
        req.authUser!.name,
        parsedOpening,
        parsedOpening,
        String(notes || '').trim(),
        nowIso
      );

      broadcastStoreEvent(storeId, 'cash:updated', { storeId });
      res.status(201).json(getOpenCashRegisterState(storeId));
    }
  );

  app.post(
    '/api/stores/:storeId/cash-register/movement',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager', 'cashier']),
    (req: AuthenticatedRequest, res) => {
      const storeId = req.params.storeId;
      const { type, amountCents, description } = req.body || {};
      if (type !== 'suprimento' && type !== 'sangria') {
        res.status(400).json({ error: 'Tipo de movimentação inválido (use suprimento ou sangria).' });
        return;
      }
      const amount = Number(amountCents);
      if (!Number.isInteger(amount) || amount <= 0) {
        res.status(400).json({ error: 'Informe um valor maior que zero.' });
        return;
      }

      const db = getDb();
      const openReg = db
        .prepare("SELECT * FROM cash_registers WHERE store_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1")
        .get(storeId) as Record<string, any> | undefined;
      if (!openReg) {
        res.status(409).json({ error: 'Nenhum caixa aberto no momento.' });
        return;
      }

      const delta = type === 'suprimento' ? amount : -amount;
      const nowIso = new Date().toISOString();

      db.exec('BEGIN IMMEDIATE;');
      try {
        db.prepare(
          `INSERT INTO cash_movements (
            id, cash_register_id, store_id, type, amount_cents, payment_method, order_id, description,
            created_by_user_id, created_by_name, created_at
          ) VALUES (?, ?, ?, ?, ?, 'dinheiro', NULL, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          openReg.id,
          storeId,
          type,
          amount,
          String(description || (type === 'suprimento' ? 'Reforço de troco' : 'Retirada de caixa')).trim(),
          req.authUser!.id,
          req.authUser!.name,
          nowIso
        );

        db.prepare(
          'UPDATE cash_registers SET expected_closing_cents = expected_closing_cents + ? WHERE id = ?'
        ).run(delta, openReg.id);

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      broadcastStoreEvent(storeId, 'cash:updated', { storeId });
      res.status(201).json(getOpenCashRegisterState(storeId));
    }
  );

  app.post(
    '/api/stores/:storeId/cash-register/close',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager', 'cashier']),
    (req: AuthenticatedRequest, res) => {
      const storeId = req.params.storeId;
      const { actualClosingCents, notes } = req.body || {};
      const actual = Number(actualClosingCents);
      if (!Number.isInteger(actual) || actual < 0) {
        res.status(400).json({ error: 'Informe o valor contado em dinheiro no fechamento.' });
        return;
      }

      const state = getOpenCashRegisterState(storeId);
      if (!state.openRegister) {
        res.status(409).json({ error: 'Nenhum caixa aberto para fechar.' });
        return;
      }

      const expected = state.expectedCashCents;
      const difference = actual - expected;
      const nowIso = new Date().toISOString();
      const db = getDb();

      db.prepare(
        `UPDATE cash_registers SET
          status = 'closed',
          closed_by_user_id = ?,
          closed_by_name = ?,
          expected_closing_cents = ?,
          actual_closing_cents = ?,
          difference_cents = ?,
          notes = CASE WHEN ? != '' THEN ? ELSE notes END,
          closed_at = ?
         WHERE id = ? AND store_id = ?`
      ).run(
        req.authUser!.id,
        req.authUser!.name,
        expected,
        actual,
        difference,
        String(notes || '').trim(),
        String(notes || '').trim(),
        nowIso,
        state.openRegister.id,
        storeId
      );

      broadcastStoreEvent(storeId, 'cash:updated', { storeId });
      res.json(getOpenCashRegisterState(storeId));
    }
  );

  // ============================================================================
  // REAL REPORTS (100% COMPUTED FROM SQLITE DATA)
  // ============================================================================
  app.get(
    '/api/stores/:storeId/reports',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager', 'cashier']),
    (req, res) => {
      const storeId = req.params.storeId;
      const daysRaw = Number(req.query.days || 30);
      const days = [7, 30, 90, 365].includes(daysRaw) ? daysRaw : 30;
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const db = getDb();
      const orders = db
        .prepare('SELECT * FROM orders WHERE store_id = ? AND created_at >= ? ORDER BY created_at ASC')
        .all(storeId, cutoffDate) as Array<Record<string, any>>;

      let totalOrders = orders.length;
      let validOrders = 0;
      let cancelledOrders = 0;
      let grossRevenueCents = 0;
      let paidRevenueCents = 0;
      let pendingPaymentCents = 0;

      const byStatusMap = new Map<string, { status: string; count: number; revenueCents: number }>();
      const byFulfillmentMap = new Map<string, { fulfillmentType: string; count: number; revenueCents: number }>();
      const byPaymentMap = new Map<string, { paymentMethod: string; count: number; revenueCents: number }>();
      const dailyMap = new Map<string, { date: string; orderCount: number; revenueCents: number }>();

      for (const o of orders) {
        const stRow = byStatusMap.get(o.status) || { status: o.status, count: 0, revenueCents: 0 };
        stRow.count += 1;
        stRow.revenueCents += o.total_cents;
        byStatusMap.set(o.status, stRow);

        if (o.status === 'cancelado') {
          cancelledOrders += 1;
          continue;
        }

        validOrders += 1;
        grossRevenueCents += o.total_cents;
        if (o.payment_status === 'paid') {
          paidRevenueCents += o.total_cents;
        } else {
          pendingPaymentCents += o.total_cents;
        }

        const fRow = byFulfillmentMap.get(o.fulfillment_type) || {
          fulfillmentType: o.fulfillment_type,
          count: 0,
          revenueCents: 0,
        };
        fRow.count += 1;
        fRow.revenueCents += o.total_cents;
        byFulfillmentMap.set(o.fulfillment_type, fRow);

        const pMethod = o.payment_method || 'whatsapp';
        const pRow = byPaymentMap.get(pMethod) || { paymentMethod: pMethod, count: 0, revenueCents: 0 };
        pRow.count += 1;
        pRow.revenueCents += o.total_cents;
        byPaymentMap.set(pMethod, pRow);

        const dayKey = String(o.created_at).slice(0, 10);
        const dRow = dailyMap.get(dayKey) || { date: dayKey, orderCount: 0, revenueCents: 0 };
        dRow.orderCount += 1;
        dRow.revenueCents += o.total_cents;
        dailyMap.set(dayKey, dRow);
      }

      const topProducts = db
        .prepare(
          `SELECT
            oi.product_name_snapshot as name,
            SUM(oi.quantity) as quantitySold,
            SUM(oi.line_total_cents) as revenueCents
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.store_id = ? AND o.created_at >= ? AND o.status != 'cancelado'
           GROUP BY oi.product_name_snapshot
           ORDER BY quantitySold DESC, revenueCents DESC
           LIMIT 10`
        )
        .all(storeId, cutoffDate) as Array<{ name: string; quantitySold: number; revenueCents: number }>;

      const movements = db
        .prepare('SELECT type, amount_cents FROM cash_movements WHERE store_id = ? AND created_at >= ?')
        .all(storeId, cutoffDate) as Array<{ type: string; amount_cents: number }>;

      let suprimentoCents = 0;
      let sangriaCents = 0;
      let cashSalesCents = 0;
      let pixSalesCents = 0;
      let cardSalesCents = 0;
      for (const m of movements) {
        if (m.type === 'suprimento') suprimentoCents += m.amount_cents;
        else if (m.type === 'sangria') sangriaCents += m.amount_cents;
        else if (m.type === 'venda_dinheiro') cashSalesCents += m.amount_cents;
        else if (m.type === 'venda_pix') pixSalesCents += m.amount_cents;
        else if (m.type === 'venda_cartao') cardSalesCents += m.amount_cents;
      }

      const closedCountRow = db
        .prepare("SELECT COUNT(*) as total FROM cash_registers WHERE store_id = ? AND status = 'closed' AND opened_at >= ?")
        .get(storeId, cutoffDate) as { total: number };

      res.json({
        periodDays: days,
        totalOrders,
        validOrders,
        cancelledOrders,
        grossRevenueCents,
        paidRevenueCents,
        pendingPaymentCents,
        averageTicketCents: validOrders > 0 ? Math.round(grossRevenueCents / validOrders) : 0,
        byStatus: Array.from(byStatusMap.values()),
        byFulfillment: Array.from(byFulfillmentMap.values()),
        byPaymentMethod: Array.from(byPaymentMap.values()),
        topProducts: topProducts.map((p) => ({
          name: p.name,
          quantitySold: Number(p.quantitySold || 0),
          revenueCents: Number(p.revenueCents || 0),
        })),
        dailySeries: Array.from(dailyMap.values()),
        cashSummary: {
          suprimentoCents,
          sangriaCents,
          cashSalesCents,
          pixSalesCents,
          cardSalesCents,
          registersClosedCount: Number(closedCountRow.total || 0),
        },
      });
    }
  );

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

  app.post(
    '/api/stores/:storeId/subscription/checkout',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const storeId = req.params.storeId;
        const store = getStoreFullRow(storeId);
        if (!store) {
          res.status(404).json({ error: 'Loja não encontrada.' });
          return;
        }

        const mpConfig = getMercadoPagoConfig();
        if (!mpConfig.configured) {
          res.status(400).json({
            code: 'MERCADOPAGO_UNCONFIGURED',
            mode: 'unconfigured',
            missingEnvVars: mpConfig.missingEnvVars,
            error:
              mpConfig.warning ||
              'Integração com Mercado Pago pendente de configuração no servidor (verifique as variáveis de ambiente).',
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
          mode: mpConfig.mode,
          checkoutUrl: checkout.checkoutUrl,
          providerSubscriptionId: checkout.providerSubscriptionId,
        });
      } catch (err: any) {
        console.error('Checkout error:', err);
        res.status(500).json({ error: err.message || 'Erro ao iniciar checkout anual.' });
      }
    }
  );

  app.post(
    '/api/stores/:storeId/subscription/cancel-renewal',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req, res) => {
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
    }
  );

  app.post(
    '/api/stores/:storeId/subscription/simulate',
    requireAuth,
    requireStoreMembership,
    requireStoreRoles(['owner', 'manager']),
    (req: AuthenticatedRequest, res) => {
      if (!isSubscriptionSimulatorEnabled()) {
        res.status(403).json({
          error: 'O simulador de assinatura está desativado neste ambiente.',
        });
        return;
      }

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
        store: formatStoreSummary(updatedStore, req.storeRole),
        subscription: getStoreSubscription(storeId),
        paymentEvents: db.prepare('SELECT * FROM payment_events WHERE store_id = ? ORDER BY processed_at DESC LIMIT 30').all(storeId),
      });
    }
  );

  // Mercado Pago Webhook (validates HMAC signature, queries provider, idempotent event processing)
  app.post('/api/webhooks/mercadopago', async (req, res) => {
    try {
      const dataId = String(req.body?.data?.id || req.query['data.id'] || '');
      const eventId = String(req.body?.id || `${req.body?.type || 'mp'}-${dataId}`);
      const xSignature = req.header('x-signature');
      const xRequestId = req.header('x-request-id');

      const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || '';
      if (process.env.NODE_ENV === 'production' && !webhookSecret) {
        res.status(503).json({ error: 'MERCADOPAGO_WEBHOOK_SECRET é obrigatório em produção.' });
        return;
      }

      if (webhookSecret) {
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
        res.status(503).json({ error: 'Credenciais do Mercado Pago não configuradas no servidor.' });
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
        'SELECT id, category_id, name, description, price_cents, sizes_json, addons_json, image_url, is_available, sort_order FROM products WHERE store_id = ? AND is_available = 1 ORDER BY sort_order ASC, created_at ASC'
      )
      .all(store.id) as Array<Record<string, any>>;
    const neighborhoods = db
      .prepare('SELECT id, name, fee_cents FROM delivery_neighborhoods WHERE store_id = ? AND is_active = 1 ORDER BY name ASC')
      .all(store.id);
    const tables = db
      .prepare('SELECT id, label, table_code, seats FROM store_tables WHERE store_id = ? AND is_active = 1 ORDER BY table_code ASC')
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
        allowTable: store.allow_table === undefined ? true : Boolean(store.allow_table),
        allowCounter: store.allow_counter === undefined ? true : Boolean(store.allow_counter),
        hasValidWhatsapp: Boolean(store.whatsapp_e164),
        operationalStatus: opStatus,
      },
      categories,
      products: products.map(formatProductRow),
      neighborhoods,
      tables,
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
      tableId,
      tableCode,
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
      const existingItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(existingOrder.id) as Array<Record<string, any>>;
      res.status(200).json({
        deduplicated: true,
        order: formatOrderRow(existingOrder, existingItems),
      });
      return;
    }

    // 2. Check store operational status
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
    if (!['delivery', 'pickup', 'table', 'counter'].includes(fulfillmentType)) {
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
    const allowTable = store.allow_table === undefined ? true : Boolean(store.allow_table);
    const allowCounter = store.allow_counter === undefined ? true : Boolean(store.allow_counter);
    if (fulfillmentType === 'table' && !allowTable) {
      res.status(400).json({ error: 'Pedidos na mesa não estão ativos nesta loja.' });
      return;
    }
    if (fulfillmentType === 'counter' && !allowCounter) {
      res.status(400).json({ error: 'Pedidos para retirada rápida no balcão não estão ativos nesta loja.' });
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
    let resolvedTableId: string | null = null;
    let resolvedTableLabel: string | null = null;

    const catalogChanges: string[] = [];

    if (fulfillmentType === 'table') {
      const tbl = tableId
        ? (db.prepare('SELECT id, label, is_active FROM store_tables WHERE id = ? AND store_id = ?').get(tableId, store.id) as
            | { id: string; label: string; is_active: number }
            | undefined)
        : tableCode
        ? (db.prepare('SELECT id, label, is_active FROM store_tables WHERE table_code = ? AND store_id = ?').get(String(tableCode), store.id) as
            | { id: string; label: string; is_active: number }
            | undefined)
        : undefined;
      if (!tbl || !tbl.is_active) {
        res.status(400).json({ error: 'Selecione uma mesa ativa para fazer o pedido na mesa.' });
        return;
      }
      resolvedTableId = tbl.id;
      resolvedTableLabel = tbl.label;
    }

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

    // 4. Verify all items, sizes, addons, quantities, availability, and prices against DB
    const verifiedItems: Array<{
      productId: string;
      productName: string;
      selectedSize: ProductSizeOption | null;
      selectedAddons: ProductAddonOption[];
      variantKey: string;
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
        .prepare('SELECT id, name, price_cents, sizes_json, addons_json, is_available FROM products WHERE id = ? AND store_id = ?')
        .get(productId, store.id) as Record<string, any> | undefined;

      if (!product || !product.is_available) {
        catalogChanges.push('Um item da sacola ficou indisponível no cardápio.');
        continue;
      }

      const availableSizes = parseSizesJson(product.sizes_json);
      const availableAddons = parseAddonsJson(product.addons_json);

      let chosenSize: ProductSizeOption | null = null;
      let basePriceCents = product.price_cents;

      if (availableSizes.length > 0) {
        const wantedSizeId = rawItem?.selectedSizeId ? String(rawItem.selectedSizeId) : availableSizes[0].id;
        const matchedSize = availableSizes.find((s) => s.id === wantedSizeId);
        if (!matchedSize) {
          catalogChanges.push(`Uma variação/tamanho de "${product.name}" foi alterada no cardápio.`);
          continue;
        }
        chosenSize = matchedSize;
        basePriceCents = matchedSize.priceCents;
      }

      const chosenAddons: ProductAddonOption[] = [];
      const rawAddonIds = Array.isArray(rawItem?.selectedAddonIds) ? rawItem.selectedAddonIds : [];
      let missingAddon = false;
      for (const addonId of rawAddonIds) {
        const matchedAddon = availableAddons.find((a) => a.id === String(addonId));
        if (!matchedAddon) {
          missingAddon = true;
          break;
        }
        chosenAddons.push(matchedAddon);
      }
      if (missingAddon) {
        catalogChanges.push(`Um adicional de "${product.name}" foi removido ou alterado no cardápio.`);
        continue;
      }

      const addonsTotal = chosenAddons.reduce((acc, a) => acc + a.priceCents, 0);
      const unitPriceCents = basePriceCents + addonsTotal;

      if (
        rawItem?.expectedUnitPriceCents !== undefined &&
        Number(rawItem.expectedUnitPriceCents) !== unitPriceCents
      ) {
        catalogChanges.push(
          `"${product.name}" mudou de ${formatCentsBRL(Number(rawItem.expectedUnitPriceCents))} para ${formatCentsBRL(unitPriceCents)}.`
        );
      }

      const variantKey = `${product.id}::${chosenSize?.id || ''}::${chosenAddons
        .map((a) => a.id)
        .sort()
        .join(',')}`;

      verifiedItems.push({
        productId: product.id,
        productName: product.name,
        selectedSize: chosenSize,
        selectedAddons: chosenAddons,
        variantKey,
        unitPriceCents,
        quantity,
        lineTotalCents: unitPriceCents * quantity,
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
      const raceCheck = db
        .prepare('SELECT * FROM orders WHERE store_id = ? AND idempotency_key = ?')
        .get(store.id, idempotencyKey.trim()) as Record<string, any> | undefined;

      if (raceCheck) {
        db.exec('COMMIT;');
        const raceItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(raceCheck.id) as Array<Record<string, any>>;
        res.status(200).json({ deduplicated: true, order: formatOrderRow(raceCheck, raceItems) });
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
        tableLabel: resolvedTableLabel,
        items: verifiedItems.map((it) => ({
          quantity: it.quantity,
          productName: it.productName,
          sizeName: it.selectedSize?.name || null,
          addonNames: it.selectedAddons.map((a) => a.name),
          lineTotalCents: it.lineTotalCents,
        })),
        neighborhoodName: resolvedNeighborhoodName,
        subtotalCents,
        deliveryFeeCents,
        deliveryAddress: resolvedDeliveryAddress,
        pickupAddress: store.pickup_address,
        totalCents,
        notes: notes ? String(notes).trim() : '',
      });

      const whatsappUrl = buildWhatsAppUrl(store.whatsapp_e164, whatsappMessage);

      const authCustomer = getAuthenticatedCustomer(req);
      if (authCustomer && resolvedDeliveryAddress && !authCustomer.defaultAddress) {
        db.prepare('UPDATE customer_accounts SET default_address = ?, updated_at = ? WHERE id = ?').run(
          resolvedDeliveryAddress,
          nowIso,
          authCustomer.id
        );
      }

      db.prepare(
        `INSERT INTO orders (
          id, order_number, store_id, customer_id, idempotency_key, customer_name,
          fulfillment_type, source, table_id, table_label,
          neighborhood_id, neighborhood_name, delivery_address, notes,
          subtotal_cents, delivery_fee_cents, total_cents,
          status, payment_method, payment_status, paid_cents, change_for_cents,
          whatsapp_message, whatsapp_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'public_menu', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', 'whatsapp', 'pending', 0, 0, ?, ?, ?)`
      ).run(
        createdOrderId,
        orderNumber,
        store.id,
        authCustomer ? authCustomer.id : null,
        idempotencyKey.trim(),
        String(customerName).trim(),
        fulfillmentType,
        resolvedTableId,
        resolvedTableLabel,
        resolvedNeighborhoodId,
        resolvedNeighborhoodName,
        resolvedDeliveryAddress,
        notes ? String(notes).trim() : '',
        subtotalCents,
        deliveryFeeCents,
        totalCents,
        whatsappMessage,
        whatsappUrl,
        nowIso
      );

      for (const item of verifiedItems) {
        db.prepare(
          `INSERT INTO order_items (
            id, order_id, product_id, product_name_snapshot,
            selected_size_json, selected_addons_json, variant_key,
            unit_price_cents, quantity, line_total_cents
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          createdOrderId,
          item.productId,
          item.productName,
          item.selectedSize ? JSON.stringify(item.selectedSize) : '',
          JSON.stringify(item.selectedAddons),
          item.variantKey,
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
    const savedItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(createdOrderId) as Array<Record<string, any>>;
    const enriched = formatOrderRow(savedOrder, savedItems);

    broadcastStoreEvent(store.id, 'order:created', { order: enriched });

    res.status(201).json({
      deduplicated: false,
      order: enriched,
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

  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer);

  httpServer.listen(port, '0.0.0.0', () => {
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

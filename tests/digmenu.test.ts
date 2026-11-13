import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const testDbPath = path.join(os.tmpdir(), `digmenu_test_${Date.now()}.db`);
process.env.DATABASE_PATH = testDbPath;
process.env.ANNUAL_PLAN_PRICE_CENTS = '49900';
process.env.PLATFORM_ADMIN_EMAILS = 'admin.plataforma@digmenu.test';

import { createApiApp } from '../server.ts';
import { attachWebSocketServer } from '../server/realtime.ts';
import { normalizeBrazilianWhatsApp } from '../server/whatsapp.ts';
import { evaluateStoreOperationalStatus } from '../server/storeStatus.ts';

let server: http.Server;
let baseUrl = '';
let wsBaseUrl = '';

async function req(
  pathname: string,
  options: { method?: string; body?: unknown; cookie?: string } = {}
): Promise<{ status: number; data: any; setCookie?: string }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.cookie) headers['Cookie'] = options.cookie;

  const resp = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await resp.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  const rawSetCookie = resp.headers.get('set-cookie');
  const cookiePair = rawSetCookie ? rawSetCookie.split(';')[0] : undefined;

  return { status: resp.status, data, setCookie: cookiePair };
}

test.before(async () => {
  const app = createApiApp();
  server = http.createServer(app);
  attachWebSocketServer(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      wsBaseUrl = `ws://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const suffix of ['', '-wal', '-shm']) {
    const f = `${testDbPath}${suffix}`;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

test('WhatsApp normalization handles Brazilian DDD formats and rejects invalid numbers', () => {
  assert.equal(normalizeBrazilianWhatsApp('(11) 99988-7766').normalized, '5511999887766');
  assert.equal(normalizeBrazilianWhatsApp('+55 21 98877-6655').normalized, '5521988776655');
  assert.equal(normalizeBrazilianWhatsApp('011999887766').normalized, '5511999887766');
  assert.equal(normalizeBrazilianWhatsApp('1133445566').normalized, '551133445566');
  assert.equal(normalizeBrazilianWhatsApp('05999887766').valid, false);
  assert.equal(normalizeBrazilianWhatsApp('12345').valid, false);
});

test('Store opening hours supports cross-midnight shifts (18:00 -> 02:00)', () => {
  const sunday0115Br = new Date('2026-11-15T04:15:00.000Z');
  const hours = [
    { day_of_week: 0, open_time: '18:00', close_time: '23:00', is_closed: 0 },
    { day_of_week: 6, open_time: '18:00', close_time: '02:00', is_closed: 0 },
  ];
  const openRes = evaluateStoreOperationalStatus({
    timezone: 'America/Sao_Paulo',
    hours,
    isPaused: false,
    whatsappE164: '5511999887766',
    subscriptionStatus: 'ativa',
    now: sunday0115Br,
  });
  assert.equal(openRes.canAcceptOrders, true);
  assert.equal(openRes.badgeLabel, 'Aberto');

  const sunday0300Br = new Date('2026-11-15T06:00:00.000Z');
  const closedRes = evaluateStoreOperationalStatus({
    timezone: 'America/Sao_Paulo',
    hours,
    isPaused: false,
    whatsappE164: '5511999887766',
    subscriptionStatus: 'ativa',
    now: sunday0300Br,
  });
  assert.equal(closedRes.canAcceptOrders, false);
  assert.equal(closedRes.badgeLabel, 'Fechado');
});

test('Multi-tenant isolation, sizes/addons tampering guard, WhatsApp idempotency, KDS status, POS/cash register, reports & WS auth across 2 stores', async () => {
  // 1. Register Store A and Store B
  const regA = await req('/api/auth/register', {
    method: 'POST',
    body: {
      userName: 'Ana Teste',
      storeName: 'Bistrô da Ana',
      slug: 'bistro-da-ana',
      whatsapp: '(11) 99111-2233',
      pickupAddress: 'Rua das Acácias, 100',
      city: 'São Paulo - SP',
      email: 'ana@bistro.test',
      password: 'password123',
    },
  });
  assert.equal(regA.status, 201);
  assert.ok(regA.setCookie);
  const storeAId = regA.data.stores[0].id;
  const cookieA = regA.setCookie!;

  const regB = await req('/api/auth/register', {
    method: 'POST',
    body: {
      userName: 'Bruno Teste',
      storeName: 'Espetinho do Bruno',
      slug: 'espetinho-bruno',
      whatsapp: '(21) 99222-3344',
      pickupAddress: 'Av. Brasil, 200',
      city: 'Rio de Janeiro - RJ',
      email: 'bruno@espetinho.test',
      password: 'password123',
    },
  });
  assert.equal(regB.status, 201);
  const storeBId = regB.data.stores[0].id;
  const cookieB = regB.setCookie!;

  // 2. Cross-tenant isolation
  const crossOverview = await req(`/api/stores/${storeBId}/overview`, { cookie: cookieA });
  assert.equal(crossOverview.status, 403);

  const crossSettings = await req(`/api/stores/${storeBId}/settings`, {
    method: 'PATCH',
    cookie: cookieA,
    body: { name: 'Hackeado' },
  });
  assert.equal(crossSettings.status, 403);

  // Logout & Login back in for User A
  await req('/api/auth/logout', { method: 'POST', cookie: cookieA });
  const unauthOverview = await req(`/api/stores/${storeAId}/overview`, { cookie: cookieA });
  assert.equal(unauthOverview.status, 401);

  const loginA = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@bistro.test', password: 'password123' },
  });
  assert.equal(loginA.status, 200);
  const freshCookieA = loginA.setCookie!;

  // 3. Ensure Store A is open 24h for deterministic order tests
  const allOpenHours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '00:00',
    closeTime: '23:59',
    isClosed: false,
  }));
  const hoursRes = await req(`/api/stores/${storeAId}/hours`, {
    method: 'PUT',
    cookie: freshCookieA,
    body: { hours: allOpenHours },
  });
  assert.equal(hoursRes.status, 200);

  const ovA = await req(`/api/stores/${storeAId}/overview`, { cookie: freshCookieA });
  assert.equal(ovA.status, 200);
  const catId = ovA.data.categories[0].id;
  const nbId = ovA.data.neighborhoods[0].id; // Centro, 500 cents
  assert.ok(ovA.data.tables.length >= 2);

  // 4. Create product with sizes & addons + simple product
  const prod1 = await req(`/api/stores/${storeAId}/products`, {
    method: 'POST',
    cookie: freshCookieA,
    body: {
      categoryId: catId,
      name: 'Parmegiana da Casa',
      description: 'Arroz, fritas e molho artesanal.',
      priceCents: 3290,
      sizes: [
        { id: 'sz-ind', name: 'Individual', priceCents: 3290 },
        { id: 'sz-fam', name: 'Família', priceCents: 6490 },
      ],
      addons: [{ id: 'ad-queijo', name: 'Gratinado Extra', priceCents: 600 }],
      isAvailable: true,
    },
  });
  assert.equal(prod1.status, 201);
  assert.equal(prod1.data.product.sizes.length, 2);
  assert.equal(prod1.data.product.addons.length, 1);

  const prod2 = await req(`/api/stores/${storeAId}/products`, {
    method: 'POST',
    cookie: freshCookieA,
    body: {
      categoryId: catId,
      name: 'Suco de Laranja 400ml',
      description: 'Natural feito na hora.',
      priceCents: 900,
      isAvailable: true,
    },
  });
  assert.equal(prod2.status, 201);

  // 5. Price-change tampering guard (409 CATALOG_CHANGED)
  const stalePriceRes = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: {
      idempotencyKey: crypto.randomUUID(),
      customerName: 'Cliente Teste',
      fulfillmentType: 'delivery',
      neighborhoodId: nbId,
      deliveryAddress: 'Rua Nova, 50',
      expectedDeliveryFeeCents: 500,
      items: [
        {
          productId: prod1.data.product.id,
          quantity: 1,
          selectedSizeId: 'sz-fam',
          selectedAddonIds: ['ad-queijo'],
          expectedUnitPriceCents: 1990, // tampered! real is 6490 + 600 = 7090
        },
      ],
    },
  });
  assert.equal(stalePriceRes.status, 409);
  assert.equal(stalePriceRes.data.code, 'CATALOG_CHANGED');

  // 6. WebSocket security & real-time order:created broadcast
  // Cross-store WS connection must be rejected
  await assert.rejects(
    () =>
      new Promise<void>((resolve, reject) => {
        const badWs = new WebSocket(`${wsBaseUrl}/ws?storeId=${storeBId}`, {
          headers: { Cookie: freshCookieA },
        });
        badWs.on('open', () => {
          badWs.close();
          resolve();
        });
        badWs.on('unexpected-response', (_req, res) => {
          assert.equal(res.statusCode, 403);
          reject(new Error('Rejected 403'));
        });
        badWs.on('error', reject);
      })
  );

  // Authorized WS receives order:created event
  const wsEvents: any[] = [];
  const wsClient = await new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws?storeId=${storeAId}`, {
      headers: { Cookie: freshCookieA },
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
  wsClient.on('message', (raw) => {
    wsEvents.push(JSON.parse(raw.toString()));
  });

  // 7. Delivery order with size + addon + idempotency double-click protection
  const idemKey = crypto.randomUUID();
  const orderPayload = {
    idempotencyKey: idemKey,
    customerName: 'Maria Clara',
    fulfillmentType: 'delivery',
    neighborhoodId: nbId,
    deliveryAddress: 'Rua das Flores, 45',
    notes: 'Sem cebola',
    expectedDeliveryFeeCents: 500,
    items: [
      {
        productId: prod1.data.product.id,
        quantity: 2,
        selectedSizeId: 'sz-ind',
        selectedAddonIds: ['ad-queijo'],
        expectedUnitPriceCents: 3890, // 3290 + 600
      },
      { productId: prod2.data.product.id, quantity: 1, expectedUnitPriceCents: 900 },
    ],
  };

  const firstAttempt = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: orderPayload,
  });
  assert.equal(firstAttempt.status, 201);
  assert.equal(firstAttempt.data.deduplicated, false);
  assert.equal(firstAttempt.data.order.status, 'novo');
  assert.equal(firstAttempt.data.order.subtotal_cents, 8680); // 2*3890 + 900
  assert.equal(firstAttempt.data.order.delivery_fee_cents, 500);
  assert.equal(firstAttempt.data.order.total_cents, 9180);
  assert.ok(firstAttempt.data.order.whatsapp_message.includes('(Individual)'));
  assert.ok(firstAttempt.data.order.whatsapp_message.includes('Gratinado Extra'));
  assert.ok(firstAttempt.data.order.whatsapp_url.startsWith('https://wa.me/5511991112233?text='));

  // Wait briefly for WS event
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(wsEvents.some((e) => e.type === 'order:created' && e.payload?.order?.id === firstAttempt.data.order.id));
  wsClient.close();

  // Duplicate attempt deduplicated
  const duplicateAttempt = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: orderPayload,
  });
  assert.equal(duplicateAttempt.status, 200);
  assert.equal(duplicateAttempt.data.deduplicated, true);

  // 8. Table QR public order
  const table01 = ovA.data.tables[0];
  const tableOrder = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: {
      idempotencyKey: crypto.randomUUID(),
      customerName: 'Mesa 01 Cliente',
      fulfillmentType: 'table',
      tableCode: table01.table_code,
      items: [{ productId: prod2.data.product.id, quantity: 2, expectedUnitPriceCents: 900 }],
    },
  });
  assert.equal(tableOrder.status, 201);
  assert.equal(tableOrder.data.order.fulfillment_type, 'table');
  assert.equal(tableOrder.data.order.table_label, table01.label);
  assert.equal(tableOrder.data.order.total_cents, 1800);

  // 9. KDS status transitions (novo -> aceito -> em_preparo -> pronto)
  const kdsAdvance = await req(`/api/stores/${storeAId}/orders/${tableOrder.data.order.id}/status`, {
    method: 'PATCH',
    cookie: freshCookieA,
    body: { status: 'em_preparo' },
  });
  assert.equal(kdsAdvance.status, 200);
  assert.equal(kdsAdvance.data.order.status, 'em_preparo');

  // 10. Cash register open -> suprimento -> settle order -> close -> real reports
  const openCash = await req(`/api/stores/${storeAId}/cash-register/open`, {
    method: 'POST',
    cookie: freshCookieA,
    body: { openingBalanceCents: 10000, notes: 'Abertura teste' },
  });
  assert.equal(openCash.status, 201);
  assert.equal(openCash.data.expectedCashCents, 10000);

  const supCash = await req(`/api/stores/${storeAId}/cash-register/movement`, {
    method: 'POST',
    cookie: freshCookieA,
    body: { type: 'suprimento', amountCents: 2000, description: 'Troco' },
  });
  assert.equal(supCash.status, 201);
  assert.equal(supCash.data.expectedCashCents, 12000);

  const payTable = await req(`/api/stores/${storeAId}/orders/${tableOrder.data.order.id}/pay`, {
    method: 'POST',
    cookie: freshCookieA,
    body: { paymentMethod: 'dinheiro', paidCents: 2000, changeForCents: 2000, completeOrder: true },
  });
  assert.equal(payTable.status, 200);
  assert.equal(payTable.data.order.payment_status, 'paid');
  assert.equal(payTable.data.order.status, 'concluido');

  const cashAfterPay = await req(`/api/stores/${storeAId}/cash-register`, { cookie: freshCookieA });
  assert.equal(cashAfterPay.data.expectedCashCents, 13800); // 10000 + 2000 + 1800

  const closeCash = await req(`/api/stores/${storeAId}/cash-register/close`, {
    method: 'POST',
    cookie: freshCookieA,
    body: { actualClosingCents: 13800, notes: 'Conferido' },
  });
  assert.equal(closeCash.status, 200);
  assert.equal(closeCash.data.openRegister, null);
  assert.equal(closeCash.data.recentClosed[0].difference_cents, 0);

  // Real Reports verification (Store A vs Store B)
  const reportA = await req(`/api/stores/${storeAId}/reports?days=30`, { cookie: freshCookieA });
  assert.equal(reportA.status, 200);
  assert.equal(reportA.data.validOrders, 2);
  assert.equal(reportA.data.grossRevenueCents, 9180 + 1800);
  assert.equal(reportA.data.paidRevenueCents, 1800);
  assert.equal(reportA.data.cashSummary.registersClosedCount, 1);

  const reportB = await req(`/api/stores/${storeBId}/reports?days=30`, { cookie: cookieB });
  assert.equal(reportB.status, 200);
  assert.equal(reportB.data.validOrders, 0);
  assert.equal(reportB.data.grossRevenueCents, 0);

  // 11. Store Team RBAC (kitchen role can update KDS status, CANNOT edit settings)
  const addKitchen = await req(`/api/stores/${storeAId}/team`, {
    method: 'POST',
    cookie: freshCookieA,
    body: {
      name: 'Cozinheiro João',
      email: 'joao.cozinha@bistro.test',
      password: 'password123',
      role: 'kitchen',
    },
  });
  assert.equal(addKitchen.status, 201);

  const loginKitchen = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'joao.cozinha@bistro.test', password: 'password123' },
  });
  assert.equal(loginKitchen.status, 200);
  const kitchenCookie = loginKitchen.setCookie!;

  const kitchenBlockedSettings = await req(`/api/stores/${storeAId}/settings`, {
    method: 'PATCH',
    cookie: kitchenCookie,
    body: { name: 'Alterado pela cozinha' },
  });
  assert.equal(kitchenBlockedSettings.status, 403);

  // 12. Annual subscription lifecycle
  const simRenew = await req(`/api/stores/${storeAId}/subscription/simulate`, {
    method: 'POST',
    cookie: freshCookieA,
    body: { action: 'renew_12m', eventId: 'evt-renew-unique-1' },
  });
  assert.equal(simRenew.status, 200);
  assert.equal(simRenew.data.subscription.status, 'ativa');

  const simCancel = await req(`/api/stores/${storeAId}/subscription/cancel-renewal`, {
    method: 'POST',
    cookie: freshCookieA,
  });
  assert.equal(simCancel.data.subscription.status, 'renovacao_cancelada');

  const simExpire = await req(`/api/stores/${storeAId}/subscription/simulate`, {
    method: 'POST',
    cookie: freshCookieA,
    body: { action: 'expire' },
  });
  assert.equal(simExpire.data.subscription.status, 'expirada');

  const expiredOrderRes = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: {
      idempotencyKey: crypto.randomUUID(),
      customerName: 'Tentativa Expirada',
      fulfillmentType: 'pickup',
      items: [{ productId: prod2.data.product.id, quantity: 1, expectedUnitPriceCents: 900 }],
    },
  });
  assert.equal(expiredOrderRes.status, 409);

  // 13. Password reset flow & Platform Admin guard
  const forgotRes = await req('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'ana@bistro.test' },
  });
  assert.equal(forgotRes.status, 200);
  assert.ok(forgotRes.data.previewResetToken);

  const resetRes = await req('/api/auth/reset-password', {
    method: 'POST',
    body: { token: forgotRes.data.previewResetToken, newPassword: 'newpassword123' },
  });
  assert.equal(resetRes.status, 200);

  const loginNewPass = await req('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@bistro.test', password: 'newpassword123' },
  });
  assert.equal(loginNewPass.status, 200);

  // Old session was revoked on password reset (401)
  const revokedRes = await req('/api/admin/stores', { cookie: freshCookieA });
  assert.equal(revokedRes.status, 401);

  // Non-admin merchant with valid session receives 403 on /api/admin/stores
  const nonAdminRes = await req('/api/admin/stores', { cookie: loginNewPass.setCookie! });
  assert.equal(nonAdminRes.status, 403);

  // Waiter order creation straight to KDS
  const waiterOrderRes = await req(`/api/stores/${storeAId}/orders`, {
    method: 'POST',
    cookie: loginNewPass.setCookie!,
    body: {
      source: 'waiter',
      fulfillmentType: 'table',
      tableId: table01.id,
      customerName: 'Mesa 01 Garçom',
      items: [{ productId: prod2.data.product.id, quantity: 1 }],
    },
  });
  assert.equal(waiterOrderRes.status, 201);
  assert.equal(waiterOrderRes.data.order.source, 'waiter');

  // Platform admin email can access /api/admin/stores and block/unblock store
  const regAdmin = await req('/api/auth/register', {
    method: 'POST',
    body: {
      userName: 'Super Admin',
      storeName: 'Loja Admin',
      slug: 'loja-admin-teste',
      whatsapp: '(11) 99000-1111',
      email: 'admin.plataforma@digmenu.test',
      password: 'password123',
    },
  });
  assert.equal(regAdmin.status, 201);
  assert.equal(regAdmin.data.user.isPlatformAdmin, true);

  const adminStores = await req('/api/admin/stores', { cookie: regAdmin.setCookie! });
  assert.equal(adminStores.status, 200);
  assert.ok(adminStores.data.stores.length >= 3);

  const blockB = await req(`/api/admin/stores/${storeBId}/status`, {
    method: 'PATCH',
    cookie: regAdmin.setCookie!,
    body: { isPlatformBlocked: true, platformBlockReason: 'Teste suspensão' },
  });
  assert.equal(blockB.status, 200);
  assert.equal(blockB.data.store.operationalStatus.badgeLabel, 'Loja bloqueada');
});

test('Google preview login and strict separation between stores and individual customer accounts', async () => {
  const gMerchant = await req('/api/auth/google/preview', {
    method: 'POST',
    body: {
      audience: 'merchant',
      email: 'chef.google@restaurante.test',
      name: 'Chef Google',
    },
  });
  assert.equal(gMerchant.status, 200);
  assert.equal(gMerchant.data.needsStoreSetup, true);
  const merchantCookie = gMerchant.setCookie!;

  const completeStore = await req('/api/auth/complete-google-store', {
    method: 'POST',
    cookie: merchantCookie,
    body: {
      storeName: 'Cantina do Chef',
      slug: 'cantina-do-chef',
      whatsapp: '(11) 97777-8888',
      pickupAddress: 'Rua Oscar Freire, 500',
      city: 'São Paulo - SP',
    },
  });
  assert.equal(completeStore.status, 201);
  const storeId = completeStore.data.stores[0].id;

  const cust1 = await req('/api/customer/register', {
    method: 'POST',
    body: {
      name: 'Julia Cliente',
      email: 'julia@cliente.test',
      password: 'password123',
      phone: '(11) 96666-5555',
      defaultAddress: 'Av. Paulista, 1000',
    },
  });
  assert.equal(cust1.status, 201);
  const cust1Cookie = cust1.setCookie!;

  // Customer session CANNOT access merchant store endpoints
  const custToMerchant = await req(`/api/stores/${storeId}/overview`, { cookie: cust1Cookie });
  assert.equal(custToMerchant.status, 401);

  // Merchant session CANNOT leak into customer /api/customer/me endpoint
  const merchantToCustomer = await req('/api/customer/me', { cookie: merchantCookie });
  assert.equal(merchantToCustomer.status, 401);

  const pubMenu = await req('/api/public/stores/forno-napolitano');
  assert.equal(pubMenu.status, 200);
  const pizza = pubMenu.data.products[0];
  const firstSize = pizza.sizes?.[0];

  const orderRes = await req('/api/public/stores/forno-napolitano/orders', {
    method: 'POST',
    cookie: cust1Cookie,
    body: {
      idempotencyKey: crypto.randomUUID(),
      customerName: 'Julia Cliente',
      fulfillmentType: 'pickup',
      items: [
        {
          productId: pizza.id,
          quantity: 1,
          selectedSizeId: firstSize?.id,
          expectedUnitPriceCents: firstSize ? firstSize.priceCents : pizza.price_cents,
        },
      ],
    },
  });
  assert.equal(orderRes.status, 201);
  assert.equal(orderRes.data.order.customer_id, cust1.data.customer.id);

  const cust1Orders = await req('/api/customer/orders', { cookie: cust1Cookie });
  assert.equal(cust1Orders.status, 200);
  assert.equal(cust1Orders.data.orders.length, 1);

  const gCustomer2 = await req('/api/auth/google/preview', {
    method: 'POST',
    body: {
      audience: 'customer',
      email: 'outro.cliente@gmail.com',
      name: 'Outro Cliente',
    },
  });
  assert.equal(gCustomer2.status, 200);
  const cust2Orders = await req('/api/customer/orders', { cookie: gCustomer2.setCookie! });
  assert.equal(cust2Orders.status, 200);
  assert.equal(cust2Orders.data.orders.length, 0);
});

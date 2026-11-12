import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';

const testDbPath = path.join(os.tmpdir(), `digmenu_test_${Date.now()}.db`);
process.env.DATABASE_PATH = testDbPath;
process.env.ANNUAL_PLAN_PRICE_CENTS = '49900';

import { createApiApp } from '../server.ts';
import { normalizeBrazilianWhatsApp } from '../server/whatsapp.ts';
import { evaluateStoreOperationalStatus } from '../server/storeStatus.ts';

let server: http.Server;
let baseUrl = '';

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
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
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
  // Saturday 18:00 -> 02:00, test Sunday 01:15 America/Sao_Paulo (UTC-3 => 04:15 UTC)
  // 2026-11-15 is a Sunday
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

  // Test Sunday 03:00 America/Sao_Paulo (06:00 UTC) -> should be closed
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

test('Multi-tenant isolation, catalog visibility, WhatsApp order idempotency, price validation, pause & annual subscription lifecycle', async () => {
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

  // 2. Verify cross-tenant isolation: User A cannot view or mutate Store B
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

  // Get Store A overview to find default category & neighborhood
  const ovA = await req(`/api/stores/${storeAId}/overview`, { cookie: freshCookieA });
  assert.equal(ovA.status, 200);
  const catId = ovA.data.categories[0].id;
  const nbId = ovA.data.neighborhoods[0].id; // Centro, R$ 5,00 (500 cents)

  // 4. Create 2 products in Store A, hide one and reactivate
  const prod1 = await req(`/api/stores/${storeAId}/products`, {
    method: 'POST',
    cookie: freshCookieA,
    body: {
      categoryId: catId,
      name: 'Parmegiana Executiva',
      description: 'Arroz, fritas e molho artesanal.',
      priceCents: 3290,
      isAvailable: true,
    },
  });
  assert.equal(prod1.status, 201);

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

  // Hide prod2 -> verify public menu hides it
  await req(`/api/stores/${storeAId}/products/${prod2.data.product.id}`, {
    method: 'PATCH',
    cookie: freshCookieA,
    body: { isAvailable: false },
  });
  const pubHidden = await req('/api/public/stores/bistro-da-ana');
  assert.equal(pubHidden.status, 200);
  assert.equal(pubHidden.data.products.length, 1);

  // Reactivate prod2 -> verify public menu shows both
  await req(`/api/stores/${storeAId}/products/${prod2.data.product.id}`, {
    method: 'PATCH',
    cookie: freshCookieA,
    body: { isAvailable: true },
  });
  const pubBoth = await req('/api/public/stores/bistro-da-ana');
  assert.equal(pubBoth.data.products.length, 2);

  // 5. Price-change detection test (409 CATALOG_CHANGED)
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
          quantity: 2,
          expectedUnitPriceCents: 1990, // stale! actual is 3290
        },
      ],
    },
  });
  assert.equal(stalePriceRes.status, 409);
  assert.equal(stalePriceRes.data.code, 'CATALOG_CHANGED');

  // 6. Delivery order with 2 items + idempotency double-click protection
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
      { productId: prod1.data.product.id, quantity: 2, expectedUnitPriceCents: 3290 },
      { productId: prod2.data.product.id, quantity: 1, expectedUnitPriceCents: 900 },
    ],
  };

  const firstAttempt = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: orderPayload,
  });
  assert.equal(firstAttempt.status, 201);
  assert.equal(firstAttempt.data.deduplicated, false);
  assert.equal(firstAttempt.data.order.subtotal_cents, 7480); // 2*3290 + 900
  assert.equal(firstAttempt.data.order.delivery_fee_cents, 500);
  assert.equal(firstAttempt.data.order.total_cents, 7980);
  assert.ok(firstAttempt.data.order.whatsapp_message.includes('Olá, Bistrô da Ana! Quero confirmar o pedido #'));
  assert.ok(firstAttempt.data.order.whatsapp_message.includes('• 2× Parmegiana Executiva — R$ 65,80'));
  assert.ok(firstAttempt.data.order.whatsapp_message.includes('🛵 Entrega em Centro — R$ 5,00'));
  assert.ok(firstAttempt.data.order.whatsapp_message.includes('💰 Total — R$ 79,80'));
  assert.ok(firstAttempt.data.order.whatsapp_url.startsWith('https://wa.me/5511991112233?text='));

  // Repeat same request -> deduplicated: true, same order ID!
  const duplicateAttempt = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: orderPayload,
  });
  assert.equal(duplicateAttempt.status, 200);
  assert.equal(duplicateAttempt.data.deduplicated, true);
  assert.equal(duplicateAttempt.data.order.id, firstAttempt.data.order.id);

  // Verify snapshot persists even if product price changes later
  await req(`/api/stores/${storeAId}/products/${prod1.data.product.id}`, {
    method: 'PATCH',
    cookie: freshCookieA,
    body: { priceCents: 4500 },
  });
  const ordersA = await req(`/api/stores/${storeAId}/orders`, { cookie: freshCookieA });
  assert.equal(ordersA.data.orders.length, 1);
  assert.equal(ordersA.data.orders[0].items[0].unit_price_cents, 3290);

  // 7. Pickup order test
  const pickupRes = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: {
      idempotencyKey: crypto.randomUUID(),
      customerName: 'Pedro Retirada',
      fulfillmentType: 'pickup',
      items: [{ productId: prod2.data.product.id, quantity: 2, expectedUnitPriceCents: 900 }],
    },
  });
  assert.equal(pickupRes.status, 201);
  assert.equal(pickupRes.data.order.delivery_fee_cents, 0);
  assert.equal(pickupRes.data.order.total_cents, 1800);

  // 8. Manual pause blocks public orders
  await req(`/api/stores/${storeAId}/settings`, {
    method: 'PATCH',
    cookie: freshCookieA,
    body: { isPaused: true, pauseReason: 'Cozinha em manutenção rápida' },
  });
  const pausedOrderRes = await req('/api/public/stores/bistro-da-ana/orders', {
    method: 'POST',
    body: {
      idempotencyKey: crypto.randomUUID(),
      customerName: 'Tentativa Pausada',
      fulfillmentType: 'pickup',
      items: [{ productId: prod2.data.product.id, quantity: 1, expectedUnitPriceCents: 900 }],
    },
  });
  assert.equal(pausedOrderRes.status, 409);

  // Unpause
  await req(`/api/stores/${storeAId}/settings`, {
    method: 'PATCH',
    cookie: freshCookieA,
    body: { isPaused: false },
  });

  // 9. Annual subscription lifecycle simulation (activate -> renew_12m -> past_due -> cancel_renewal -> expire)
  const simRenew = await req(`/api/stores/${storeAId}/subscription/simulate`, {
    method: 'POST',
    cookie: freshCookieA,
    body: { action: 'renew_12m', eventId: 'evt-renew-unique-1' },
  });
  assert.equal(simRenew.status, 200);
  assert.equal(simRenew.data.subscription.status, 'ativa');

  // Repeating same eventId is idempotent
  const simRenewDup = await req(`/api/stores/${storeAId}/subscription/simulate`, {
    method: 'POST',
    cookie: freshCookieA,
    body: { action: 'renew_12m', eventId: 'evt-renew-unique-1' },
  });
  assert.equal(simRenewDup.data.deduplicated, true);

  // Cancel renewal keeps access until end of period
  const simCancel = await req(`/api/stores/${storeAId}/subscription/cancel-renewal`, {
    method: 'POST',
    cookie: freshCookieA,
  });
  assert.equal(simCancel.data.subscription.status, 'renovacao_cancelada');
  assert.equal(simCancel.data.subscription.auto_renew, 0);

  // Expire blocks public orders while preserving catalog & orders in dashboard
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

  const preservedOv = await req(`/api/stores/${storeAId}/overview`, { cookie: freshCookieA });
  assert.equal(preservedOv.status, 200);
  assert.equal(preservedOv.data.products.length, 2);
  assert.equal(preservedOv.data.orders.length, 2);

  // Confirm Store B was untouched
  const ovB = await req(`/api/stores/${storeBId}/overview`, { cookie: cookieB });
  assert.equal(ovB.status, 200);
  assert.equal(ovB.data.orders.length, 0);
});

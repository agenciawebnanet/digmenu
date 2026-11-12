import crypto from 'crypto';
import { getDb, getAnnualPlanPriceCents } from './db.ts';
import { hashPassword } from './auth.ts';
import { buildWhatsAppOrderMessage, buildWhatsAppUrl } from './whatsapp.ts';

export function seedPreviewDatabaseIfEmpty(): void {
  const db = getDb();
  const countRow = db.prepare('SELECT COUNT(*) as total FROM stores').get() as { total: number };
  if (countRow.total > 0) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const periodStart = nowIso;
  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  const periodEnd = oneYearLater.toISOString();
  const annualPriceCents = getAnnualPlanPriceCents();

  db.exec('BEGIN;');
  try {
    // Usuário 1 -> Loja 1 (Forno Napolitano)
    const user1Id = 'usr-demo-1';
    const store1Id = 'store-forno-napolitano';
    db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
      user1Id,
      'Marco Bellini',
      'marco@fornonapolitano.demo',
      hashPassword('demo1234'),
      nowIso
    );

    db.prepare(
      `INSERT INTO stores (
        id, slug, name, description, logo_url, cover_url, whatsapp_e164,
        pickup_address, city, timezone, allow_delivery, allow_pickup, is_paused, pause_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      store1Id,
      'forno-napolitano',
      'Forno Napolitano',
      'Pizzas artesanais de fermentação natural assadas em forno a lenha.',
      '/images/dish_pizza_margherita.jpg',
      '/images/rest_pizzaria_cover.jpg',
      '5511999887766',
      'Rua Augusta, 1420 — Consolação',
      'São Paulo - SP',
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
    ).run(crypto.randomUUID(), user1Id, store1Id, 'owner', nowIso);

    // Horários Loja 1 (aberta todos os dias até 02:00 para demonstrar virada de meia-noite)
    for (let day = 0; day <= 6; day++) {
      db.prepare(
        'INSERT INTO store_hours (id, store_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), store1Id, day, '00:00', '23:59', 0);
    }

    // Bairros Loja 1
    const b1Id = 'nb-forno-consolacao';
    const b2Id = 'nb-forno-jardins';
    const b3Id = 'nb-forno-pinheiros';
    db.prepare('INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)').run(
      b1Id, store1Id, 'Consolação', 500, 1
    );
    db.prepare('INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)').run(
      b2Id, store1Id, 'Jardins', 800, 1
    );
    db.prepare('INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)').run(
      b3Id, store1Id, 'Pinheiros', 1000, 1
    );

    // Categorias & Produtos Loja 1
    const cat1Id = 'cat-forno-pizzas';
    const cat2Id = 'cat-forno-bebidas';
    db.prepare('INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      cat1Id, store1Id, 'Pizzas Artesanais', 'Massa maturada 48 horas em formato individual ou grande.', 1, nowIso
    );
    db.prepare('INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      cat2Id, store1Id, 'Bebidas', 'Refrigerantes, sucos naturais e águas.', 2, nowIso
    );

    const p1Id = 'prod-forno-margherita';
    const p2Id = 'prod-forno-calabresa';
    const p3Id = 'prod-forno-guarana';
    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      p1Id,
      store1Id,
      cat1Id,
      'Pizza Margherita Clássica',
      'Molho de tomate pelati italiano, muçarela de búfala fresca, manjericão e azeite extravirgem.',
      3290,
      '/images/dish_pizza_margherita.jpg',
      1,
      1,
      nowIso,
      nowIso
    );
    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      p2Id,
      store1Id,
      cat1Id,
      'Pizza Calabresa Defumada',
      'Calabresa artesanal fatiada, cebola roxa marinada, azeitonas pretas e orégano fresco.',
      3890,
      '/images/dish_pizza_calabresa.jpg',
      1,
      2,
      nowIso,
      nowIso
    );
    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      p3Id,
      store1Id,
      cat2Id,
      'Guaraná Natural 500ml',
      'Servido bem gelado com gelo e limão.',
      950,
      '',
      1,
      3,
      nowIso,
      nowIso
    );

    // Assinatura Anual Loja 1
    const sub1Id = 'sub-forno';
    db.prepare(
      `INSERT INTO subscriptions (
        id, store_id, provider, provider_subscription_id, status, annual_price_cents,
        auto_renew, current_period_start, current_period_end, next_renewal_at, cancelled_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sub1Id,
      store1Id,
      'simulator',
      'SIM-ANNUAL-FORNO-001',
      'ativa',
      annualPriceCents,
      1,
      periodStart,
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
      sub1Id,
      store1Id,
      'simulator',
      'seed-evt-forno-1',
      'annual_activation',
      'approved',
      annualPriceCents,
      JSON.stringify({ source: 'seed', cycleMonths: 12 }),
      nowIso
    );

    // Pedido exemplo Loja 1
    const ord1Id = 'ord-forno-101';
    const msg1 = buildWhatsAppOrderMessage({
      storeName: 'Forno Napolitano',
      orderNumber: 101,
      customerName: 'Camila Ferreira',
      fulfillmentType: 'delivery',
      items: [{ quantity: 2, productName: 'Pizza Margherita Clássica', lineTotalCents: 6580 }],
      neighborhoodName: 'Consolação',
      deliveryFeeCents: 500,
      deliveryAddress: 'Rua Bela Cintra, 890 - Apto 41',
      totalCents: 7080,
      notes: 'Sem cebola, por favor.',
    });
    db.prepare(
      `INSERT INTO orders (
        id, order_number, store_id, idempotency_key, customer_name, fulfillment_type,
        neighborhood_id, neighborhood_name, delivery_address, notes, subtotal_cents,
        delivery_fee_cents, total_cents, status, whatsapp_message, whatsapp_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ord1Id,
      101,
      store1Id,
      'seed-idem-forno-101',
      'Camila Ferreira',
      'delivery',
      b1Id,
      'Consolação',
      'Rua Bela Cintra, 890 - Apto 41',
      'Sem cebola, por favor.',
      6580,
      500,
      7080,
      'prepared_whatsapp',
      msg1,
      buildWhatsAppUrl('5511999887766', msg1),
      nowIso
    );
    db.prepare(
      'INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, unit_price_cents, quantity, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), ord1Id, p1Id, 'Pizza Margherita Clássica', 3290, 2, 6580);

    // ========================================================
    // Usuário 2 -> Loja 2 (Praça Smash Burger)
    // ========================================================
    const user2Id = 'usr-demo-2';
    const store2Id = 'store-praca-smash';
    db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
      user2Id,
      'Lucas Andrade',
      'lucas@pracasmash.demo',
      hashPassword('demo1234'),
      nowIso
    );

    db.prepare(
      `INSERT INTO stores (
        id, slug, name, description, logo_url, cover_url, whatsapp_e164,
        pickup_address, city, timezone, allow_delivery, allow_pickup, is_paused, pause_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      store2Id,
      'praca-smash',
      'Praça Smash Burger',
      'Smash burgers na chapa quente, pão brioche e batata rústica.',
      '/images/dish_smash_burger.jpg',
      '/images/rest_burger_cover.jpg',
      '5521988776655',
      'Rua Voluntários da Pátria, 310 — Botafogo',
      'Rio de Janeiro - RJ',
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
    ).run(crypto.randomUUID(), user2Id, store2Id, 'owner', nowIso);

    for (let day = 0; day <= 6; day++) {
      db.prepare(
        'INSERT INTO store_hours (id, store_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), store2Id, day, '00:00', '23:59', 0);
    }

    const nbBotafogo = 'nb-smash-botafogo';
    const nbFlamengo = 'nb-smash-flamengo';
    db.prepare('INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)').run(
      nbBotafogo, store2Id, 'Botafogo', 600, 1
    );
    db.prepare('INSERT INTO delivery_neighborhoods (id, store_id, name, fee_cents, is_active) VALUES (?, ?, ?, ?, ?)').run(
      nbFlamengo, store2Id, 'Flamengo', 850, 1
    );

    const catSmashId = 'cat-smash-burgers';
    const catSidesId = 'cat-smash-sides';
    db.prepare('INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      catSmashId, store2Id, 'Smash Burgers', 'Dois discos prensados na chapa e queijo derretido.', 1, nowIso
    );
    db.prepare('INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      catSidesId, store2Id, 'Acompanhamentos', 'Porções crocantes para completar o combo.', 2, nowIso
    );

    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'prod-smash-duplo',
      store2Id,
      catSmashId,
      'Duplo Smash Cheddar & Bacon',
      '2× 90g de blend bovino, cheddar cremoso, bacon crocante e molho da casa no pão brioche.',
      3490,
      '/images/dish_smash_burger.jpg',
      1,
      1,
      nowIso,
      nowIso
    );

    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'prod-smash-batata',
      store2Id,
      catSidesId,
      'Batata Rústica com Alecrim',
      'Porção de 250g com páprica defumada e maionese da casa.',
      1890,
      '',
      1,
      2,
      nowIso,
      nowIso
    );

    const sub2Id = 'sub-smash';
    db.prepare(
      `INSERT INTO subscriptions (
        id, store_id, provider, provider_subscription_id, status, annual_price_cents,
        auto_renew, current_period_start, current_period_end, next_renewal_at, cancelled_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sub2Id,
      store2Id,
      'simulator',
      'SIM-ANNUAL-SMASH-001',
      'ativa',
      annualPriceCents,
      1,
      periodStart,
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
}

// Allow running directly via `tsx server/seed.ts`
const isDirectRun = process.argv[1]?.endsWith('seed.ts');
if (isDirectRun) {
  seedPreviewDatabaseIfEmpty();
  console.log('Seed concluído com sucesso no banco de prévia.');
}

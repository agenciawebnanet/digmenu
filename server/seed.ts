import crypto from 'crypto';
import { getDb, getAnnualPlanPriceCents } from './db.ts';
import { hashPassword } from './auth.ts';
import { buildWhatsAppOrderMessage, buildWhatsAppUrl } from './whatsapp.ts';

const DEMO_MARGHERITA_SIZES = JSON.stringify([
  { id: 'sz-brotinho', name: 'Brotinho (4 fatias)', priceCents: 3290 },
  { id: 'sz-grande', name: 'Grande (8 fatias)', priceCents: 5490 },
]);

const DEMO_CALABRESA_SIZES = JSON.stringify([
  { id: 'sz-brotinho', name: 'Brotinho (4 fatias)', priceCents: 3890 },
  { id: 'sz-grande', name: 'Grande (8 fatias)', priceCents: 5990 },
]);

const DEMO_PIZZA_ADDONS = JSON.stringify([
  { id: 'add-catupiry', name: 'Borda recheada Catupiry', priceCents: 900 },
  { id: 'add-manjericao', name: 'Manjericão extra fresco', priceCents: 400 },
  { id: 'add-bufala', name: 'Muçarela de búfala extra', priceCents: 1100 },
]);

const DEMO_BURGER_SIZES = JSON.stringify([
  { id: 'sz-duplo', name: 'Duplo (180g)', priceCents: 3490 },
  { id: 'sz-triplo', name: 'Triplo (270g)', priceCents: 4490 },
]);

const DEMO_BURGER_ADDONS = JSON.stringify([
  { id: 'add-bacon', name: 'Bacon crocante extra', priceCents: 600 },
  { id: 'add-cheddar', name: 'Cheddar cremoso extra', priceCents: 500 },
  { id: 'add-ovo', name: 'Ovo na chapa', priceCents: 350 },
]);

function ensureDemoCustomersSeeded(nowIso: string): void {
  const db = getDb();
  const custCount = db.prepare('SELECT COUNT(*) as total FROM customer_accounts').get() as { total: number };
  if (custCount.total === 0) {
    const cust1Id = 'cust-demo-1';
    const cust2Id = 'cust-demo-2';
    db.prepare(
      `INSERT OR IGNORE INTO customer_accounts (
        id, name, email, password_hash, phone_e164, default_address, auth_provider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      cust1Id,
      'Camila Ferreira',
      'camila@cliente.demo',
      hashPassword('demo1234'),
      '5511977665544',
      'Rua Bela Cintra, 890 - Apto 41',
      'password',
      nowIso,
      nowIso
    );
    db.prepare(
      `INSERT OR IGNORE INTO customer_accounts (
        id, name, email, password_hash, phone_e164, default_address, auth_provider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      cust2Id,
      'Rafael Mendes',
      'rafael@cliente.demo',
      hashPassword('demo1234'),
      '5521988554433',
      'Rua das Laranjeiras, 120 - Bloco B',
      'password',
      nowIso,
      nowIso
    );

    db.prepare("UPDATE orders SET customer_id = ? WHERE id = 'ord-forno-101' AND customer_id IS NULL").run(cust1Id);
  }
}

function ensureDemoV3Enrichment(nowIso: string): void {
  const db = getDb();
  // Enrich demo products with sizes/addons if empty
  db.prepare(
    "UPDATE products SET sizes_json = ?, addons_json = ? WHERE id = 'prod-forno-margherita' AND (sizes_json = '[]' OR sizes_json = '')"
  ).run(DEMO_MARGHERITA_SIZES, DEMO_PIZZA_ADDONS);
  db.prepare(
    "UPDATE products SET sizes_json = ?, addons_json = ? WHERE id = 'prod-forno-calabresa' AND (sizes_json = '[]' OR sizes_json = '')"
  ).run(DEMO_CALABRESA_SIZES, DEMO_PIZZA_ADDONS);
  db.prepare(
    "UPDATE products SET sizes_json = ?, addons_json = ? WHERE id = 'prod-smash-duplo' AND (sizes_json = '[]' OR sizes_json = '')"
  ).run(DEMO_BURGER_SIZES, DEMO_BURGER_ADDONS);

  // Seed demo tables for Store 1 and Store 2 if missing
  const fornoExists = db.prepare("SELECT id FROM stores WHERE id = 'store-forno-napolitano'").get();
  if (fornoExists) {
    const tCount = db.prepare("SELECT COUNT(*) as total FROM store_tables WHERE store_id = 'store-forno-napolitano'").get() as { total: number };
    if (tCount.total === 0) {
      for (let i = 1; i <= 4; i++) {
        const code = String(i).padStart(2, '0');
        db.prepare(
          'INSERT OR IGNORE INTO store_tables (id, store_id, label, table_code, seats, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(`tbl-forno-${code}`, 'store-forno-napolitano', `Mesa ${code}`, code, i <= 2 ? 2 : 4, 1, nowIso);
      }
    }
  }

  const smashExists = db.prepare("SELECT id FROM stores WHERE id = 'store-praca-smash'").get();
  if (smashExists) {
    const tCount = db.prepare("SELECT COUNT(*) as total FROM store_tables WHERE store_id = 'store-praca-smash'").get() as { total: number };
    if (tCount.total === 0) {
      for (let i = 1; i <= 3; i++) {
        const code = String(i).padStart(2, '0');
        db.prepare(
          'INSERT OR IGNORE INTO store_tables (id, store_id, label, table_code, seats, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(`tbl-smash-${code}`, 'store-praca-smash', `Mesa ${code}`, code, 4, 1, nowIso);
      }
    }
  }
}

export function seedPreviewDatabaseIfEmpty(): void {
  const db = getDb();
  const countRow = db.prepare('SELECT COUNT(*) as total FROM stores').get() as { total: number };
  if (countRow.total > 0) {
    const nowIso = new Date().toISOString();
    ensureDemoCustomersSeeded(nowIso);
    ensureDemoV3Enrichment(nowIso);
    return;
  }

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
        pickup_address, city, timezone, allow_delivery, allow_pickup, allow_table, allow_counter,
        is_paused, pause_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

    for (let day = 0; day <= 6; day++) {
      db.prepare(
        'INSERT INTO store_hours (id, store_id, day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), store1Id, day, '00:00', '23:59', 0);
    }

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

    for (let i = 1; i <= 4; i++) {
      const code = String(i).padStart(2, '0');
      db.prepare(
        'INSERT INTO store_tables (id, store_id, label, table_code, seats, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(`tbl-forno-${code}`, store1Id, `Mesa ${code}`, code, i <= 2 ? 2 : 4, 1, nowIso);
    }

    const cat1Id = 'cat-forno-pizzas';
    const cat2Id = 'cat-forno-bebidas';
    db.prepare('INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      cat1Id, store1Id, 'Pizzas Artesanais', 'Massa maturada 48 horas em formato brotinho ou grande.', 1, nowIso
    );
    db.prepare('INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      cat2Id, store1Id, 'Bebidas', 'Refrigerantes, sucos naturais e águas.', 2, nowIso
    );

    const p1Id = 'prod-forno-margherita';
    const p2Id = 'prod-forno-calabresa';
    const p3Id = 'prod-forno-guarana';
    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, sizes_json, addons_json, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      p1Id,
      store1Id,
      cat1Id,
      'Pizza Margherita Clássica',
      'Molho de tomate pelati italiano, muçarela de búfala fresca, manjericão e azeite extravirgem.',
      3290,
      DEMO_MARGHERITA_SIZES,
      DEMO_PIZZA_ADDONS,
      '/images/dish_pizza_margherita.jpg',
      1,
      1,
      nowIso,
      nowIso
    );
    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, sizes_json, addons_json, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      p2Id,
      store1Id,
      cat1Id,
      'Pizza Calabresa Defumada',
      'Calabresa artesanal fatiada, cebola roxa marinada, azeitonas pretas e orégano fresco.',
      3890,
      DEMO_CALABRESA_SIZES,
      DEMO_PIZZA_ADDONS,
      '/images/dish_pizza_calabresa.jpg',
      1,
      2,
      nowIso,
      nowIso
    );
    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, sizes_json, addons_json, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      p3Id,
      store1Id,
      cat2Id,
      'Guaraná Natural 500ml',
      'Servido bem gelado com gelo e limão.',
      950,
      '[]',
      '[]',
      '',
      1,
      3,
      nowIso,
      nowIso
    );

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

    // Conta de Cliente Individual 1 e 2
    const cust1Id = 'cust-demo-1';
    const cust2Id = 'cust-demo-2';
    db.prepare(
      `INSERT INTO customer_accounts (
        id, name, email, password_hash, phone_e164, default_address, auth_provider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      cust1Id,
      'Camila Ferreira',
      'camila@cliente.demo',
      hashPassword('demo1234'),
      '5511977665544',
      'Rua Bela Cintra, 890 - Apto 41',
      'password',
      nowIso,
      nowIso
    );
    db.prepare(
      `INSERT INTO customer_accounts (
        id, name, email, password_hash, phone_e164, default_address, auth_provider, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      cust2Id,
      'Rafael Mendes',
      'rafael@cliente.demo',
      hashPassword('demo1234'),
      '5521988554433',
      'Rua das Laranjeiras, 120 - Bloco B',
      'password',
      nowIso,
      nowIso
    );

    // Pedido exemplo Loja 1
    const ord1Id = 'ord-forno-101';
    const msg1 = buildWhatsAppOrderMessage({
      storeName: 'Forno Napolitano',
      orderNumber: 101,
      customerName: 'Camila Ferreira',
      fulfillmentType: 'delivery',
      items: [
        {
          quantity: 2,
          productName: 'Pizza Margherita Clássica',
          sizeName: 'Brotinho (4 fatias)',
          lineTotalCents: 6580,
        },
      ],
      neighborhoodName: 'Consolação',
      subtotalCents: 6580,
      deliveryFeeCents: 500,
      deliveryAddress: 'Rua Bela Cintra, 890 - Apto 41',
      totalCents: 7080,
      notes: 'Sem cebola, por favor.',
    });
    db.prepare(
      `INSERT INTO orders (
        id, order_number, store_id, customer_id, idempotency_key, customer_name, fulfillment_type, source,
        neighborhood_id, neighborhood_name, delivery_address, notes, subtotal_cents,
        delivery_fee_cents, total_cents, status, payment_method, payment_status, whatsapp_message, whatsapp_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ord1Id,
      101,
      store1Id,
      cust1Id,
      'seed-idem-forno-101',
      'Camila Ferreira',
      'delivery',
      'public_menu',
      b1Id,
      'Consolação',
      'Rua Bela Cintra, 890 - Apto 41',
      'Sem cebola, por favor.',
      6580,
      500,
      7080,
      'novo',
      'whatsapp',
      'pending',
      msg1,
      buildWhatsAppUrl('5511999887766', msg1),
      nowIso
    );
    db.prepare(
      `INSERT INTO order_items (
        id, order_id, product_id, product_name_snapshot, selected_size_json, selected_addons_json, variant_key, unit_price_cents, quantity, line_total_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      ord1Id,
      p1Id,
      'Pizza Margherita Clássica',
      JSON.stringify({ id: 'sz-brotinho', name: 'Brotinho (4 fatias)', priceCents: 3290 }),
      '[]',
      `${p1Id}::sz-brotinho::`,
      3290,
      2,
      6580
    );

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
        pickup_address, city, timezone, allow_delivery, allow_pickup, allow_table, allow_counter,
        is_paused, pause_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

    for (let i = 1; i <= 3; i++) {
      const code = String(i).padStart(2, '0');
      db.prepare(
        'INSERT INTO store_tables (id, store_id, label, table_code, seats, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(`tbl-smash-${code}`, store2Id, `Mesa ${code}`, code, 4, 1, nowIso);
    }

    const catSmashId = 'cat-smash-burgers';
    const catSidesId = 'cat-smash-sides';
    db.prepare('INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      catSmashId, store2Id, 'Smash Burgers', 'Dois ou três discos prensados na chapa e queijo derretido.', 1, nowIso
    );
    db.prepare('INSERT INTO categories (id, store_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      catSidesId, store2Id, 'Acompanhamentos', 'Porções crocantes para completar o combo.', 2, nowIso
    );

    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, sizes_json, addons_json, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'prod-smash-duplo',
      store2Id,
      catSmashId,
      'Duplo Smash Cheddar & Bacon',
      '2× 90g de blend bovino, cheddar cremoso, bacon crocante e molho da casa no pão brioche.',
      3490,
      DEMO_BURGER_SIZES,
      DEMO_BURGER_ADDONS,
      '/images/dish_smash_burger.jpg',
      1,
      1,
      nowIso,
      nowIso
    );

    db.prepare(
      'INSERT INTO products (id, store_id, category_id, name, description, price_cents, sizes_json, addons_json, image_url, is_available, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'prod-smash-batata',
      store2Id,
      catSidesId,
      'Batata Rústica com Alecrim',
      'Porção de 250g com páprica defumada e maionese da casa.',
      1890,
      '[]',
      '[]',
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

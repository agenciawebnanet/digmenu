import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'digmenu_preview.db');

export function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  if (!configured) return DEFAULT_DB_PATH;
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  runMigrations(db);
  dbInstance = db;
  return db;
}

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_multitenant_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        logo_url TEXT NOT NULL DEFAULT '',
        cover_url TEXT NOT NULL DEFAULT '',
        whatsapp_e164 TEXT NOT NULL DEFAULT '',
        pickup_address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
        allow_delivery INTEGER NOT NULL DEFAULT 1,
        allow_pickup INTEGER NOT NULL DEFAULT 1,
        is_paused INTEGER NOT NULL DEFAULT 0,
        pause_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_store_memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'manager')),
        created_at TEXT NOT NULL,
        UNIQUE(user_id, store_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_memberships_user ON user_store_memberships(user_id);
      CREATE INDEX IF NOT EXISTS idx_memberships_store ON user_store_memberships(store_id);

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_categories_store ON categories(store_id);

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
        image_url TEXT NOT NULL DEFAULT '',
        is_available INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

      CREATE TABLE IF NOT EXISTS store_hours (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
        open_time TEXT NOT NULL,
        close_time TEXT NOT NULL,
        is_closed INTEGER NOT NULL DEFAULT 0,
        UNIQUE(store_id, day_of_week),
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS delivery_neighborhoods (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        name TEXT NOT NULL,
        fee_cents INTEGER NOT NULL CHECK(fee_cents >= 0),
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_neighborhoods_store ON delivery_neighborhoods(store_id);

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number INTEGER NOT NULL,
        store_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        fulfillment_type TEXT NOT NULL CHECK(fulfillment_type IN ('delivery', 'pickup')),
        neighborhood_id TEXT,
        neighborhood_name TEXT,
        delivery_address TEXT,
        notes TEXT NOT NULL DEFAULT '',
        subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0),
        delivery_fee_cents INTEGER NOT NULL CHECK(delivery_fee_cents >= 0),
        total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
        status TEXT NOT NULL DEFAULT 'prepared_whatsapp',
        whatsapp_message TEXT NOT NULL,
        whatsapp_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(store_id, idempotency_key),
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY (neighborhood_id) REFERENCES delivery_neighborhoods(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_id TEXT,
        product_name_snapshot TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        line_total_cents INTEGER NOT NULL CHECK(line_total_cents >= 0),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT 'simulator',
        provider_subscription_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('pendente', 'ativa', 'pagamento_em_atraso', 'renovacao_cancelada', 'expirada')),
        annual_price_cents INTEGER NOT NULL DEFAULT 0,
        auto_renew INTEGER NOT NULL DEFAULT 1,
        current_period_start TEXT,
        current_period_end TEXT,
        next_renewal_at TEXT,
        cancelled_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS payment_events (
        id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        processed_at TEXT NOT NULL,
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_payment_events_sub ON payment_events(subscription_id);
    `,
  },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.version)) {
      db.exec('BEGIN;');
      try {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
          migration.version,
          migration.name,
          new Date().toISOString()
        );
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  }
}

export function getAnnualPlanPriceCents(): number {
  const raw = process.env.ANNUAL_PLAN_PRICE_CENTS?.trim();
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

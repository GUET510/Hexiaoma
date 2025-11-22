import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, 'hexiaoma.sqlite');
const db = new Database(dbFile);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS general_coupons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  amount INTEGER NOT NULL,
  min_spend INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 0,
  coupon_type TEXT NOT NULL,
  store_scope TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  issued_count INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  locked_count INTEGER NOT NULL DEFAULT 0,
  next_serial INTEGER NOT NULL DEFAULT 10000,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  template_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  face_value INTEGER NOT NULL,
  category TEXT,
  brand TEXT,
  min_spend INTEGER,
  duration_days INTEGER,
  coupon_type TEXT,
  template_base_id INTEGER,
  serial TEXT UNIQUE,
  store_scope TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);
`);

const columnExists = (table, column) => {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  return info.some((col) => col.name === column);
};

const ensureColumn = (table, column, ddl) => {
  if (!columnExists(table, column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
  }
};

ensureColumn('coupons', 'brand', 'TEXT');
ensureColumn('coupons', 'min_spend', 'INTEGER');
ensureColumn('coupons', 'duration_days', 'INTEGER');
ensureColumn('coupons', 'coupon_type', 'TEXT');
ensureColumn('coupons', 'template_base_id', 'INTEGER');
ensureColumn('coupons', 'serial', 'TEXT UNIQUE');
ensureColumn('coupons', 'store_scope', 'TEXT');
ensureColumn('general_coupons', 'store_scope', 'TEXT');

export { db };

import { ensureColumn } from './db.js';

export function runMigrations() {
  // Coupons table safety checks
  ensureColumn('coupons', 'brand', 'TEXT');
  ensureColumn('coupons', 'min_spend', 'INTEGER');
  ensureColumn('coupons', 'duration_days', 'INTEGER');
  ensureColumn('coupons', 'coupon_type', 'TEXT');
  ensureColumn('coupons', 'template_base_id', 'INTEGER');
  ensureColumn('coupons', 'serial', 'TEXT UNIQUE');
  ensureColumn('coupons', 'store_scope', 'TEXT');
  ensureColumn('coupons', 'store_id', 'INTEGER');
  ensureColumn('coupons', 'used_by_staff_id', 'INTEGER');
  ensureColumn('coupons', 'used_by_staff_name', 'TEXT');
  ensureColumn('coupons', 'used_by_staff_phone', 'TEXT');

  // Employee table safety checks
  ensureColumn('employees', 'store_id', 'INTEGER');
  ensureColumn('employees', 'staff_code', 'TEXT UNIQUE');
  ensureColumn('employees', 'password', 'TEXT');
}

// Allow manual migration run via `node src/migrate.js`
const isDirectRun = process.argv[1]?.endsWith('migrate.js');
if (isDirectRun) {
  runMigrations();
  console.log('Migration completed');
}

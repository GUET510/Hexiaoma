import bcrypt from 'bcryptjs';
import { db, ensureColumn } from './db.js';

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

  // Legacy password hashing for employees and managers
  const hashTablePasswords = (table) => {
    const rows = db.prepare(`SELECT id, password FROM ${table} WHERE password IS NOT NULL`).all();
    const needsHash = rows.filter((row) => row.password && !/^\$2[aby]\$/.test(row.password));
    needsHash.forEach((row) => {
      const hashed = bcrypt.hashSync(row.password, 10);
      db.prepare(`UPDATE ${table} SET password = ? WHERE id = ?`).run(hashed, row.id);
    });
  };

  hashTablePasswords('employees');
  hashTablePasswords('store_managers');
}

// Allow manual migration run via `node src/migrate.js`
const isDirectRun = process.argv[1]?.endsWith('migrate.js');
if (isDirectRun) {
  runMigrations();
  console.log('Migration completed');
}

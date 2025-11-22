import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import templates from './templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..', 'web')));

const findTemplate = (id) => templates.find((tpl) => tpl.id === id);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/customers', (req, res) => {
  const rows = db
    .prepare(`
      SELECT customers.id, customers.phone, customers.created_at, COUNT(coupons.id) AS coupon_count,
        SUM(CASE WHEN coupons.status = 'used' THEN 1 ELSE 0 END) AS used_count
      FROM customers
      LEFT JOIN coupons ON coupons.customer_id = customers.id
      GROUP BY customers.id
      ORDER BY customers.created_at DESC
    `)
    .all();

  const customers = rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    createdAt: row.created_at,
    couponCount: row.coupon_count || 0,
    usedCount: row.used_count || 0
  }));

  res.json({ customers });
});

app.post('/api/login', (req, res) => {
  const phone = (req.body.phone || '').toString();
  if (!phone) {
    res.status(400).json({ message: 'phone is required' });
    return;
  }
  const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  let record = existing;
  if (!existing) {
    const stmt = db.prepare('INSERT INTO customers (phone) VALUES (?)');
    const result = stmt.run(phone);
    record = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  }
  res.json({ customerId: record.id, phone: record.phone, createdAt: record.created_at });
});

app.get('/api/coupons', (req, res) => {
  const customerId = req.query.customerId;
  if (!customerId) {
    res.status(400).json({ message: 'customerId is required' });
    return;
  }
  const coupons = db.prepare('SELECT * FROM coupons WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
  res.json({ coupons: coupons.map(serializeCoupon) });
});

app.post('/api/coupons', (req, res) => {
  const { customerId, templateId } = req.body || {};
  if (!customerId || !templateId) {
    res.status(400).json({ message: 'customerId and templateId are required' });
    return;
  }
  const template = findTemplate(templateId);
  if (!template) {
    res.status(400).json({ message: 'unknown templateId' });
    return;
  }
  const timestamp = Date.now();
  const code = `HX-${template.faceValue}-${timestamp}-${nanoid(6).toUpperCase()}`;
  const stmt = db.prepare(`
    INSERT INTO coupons (customer_id, template_id, code, title, face_value, category, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `);
  stmt.run(customerId, template.id, code, template.title, template.faceValue, template.category);
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code);
  res.status(201).json({ coupon: serializeCoupon(coupon) });
});

app.post('/api/coupons/verify', (req, res) => {
  const { customerId, code } = req.body || {};
  if (!customerId || !code) {
    res.status(400).json({ message: 'customerId and code are required' });
    return;
  }
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND customer_id = ?').get(code, customerId);
  if (!coupon) {
    res.status(404).json({ success: false, message: '未找到该核销码' });
    return;
  }
  if (coupon.status === 'used') {
    res.status(400).json({ success: false, message: '该优惠券已核销' });
    return;
  }
  db.prepare("UPDATE coupons SET status = ?, used_at = datetime('now') WHERE id = ?").run('used', coupon.id);
  const updated = db.prepare('SELECT * FROM coupons WHERE id = ?').get(coupon.id);
  res.json({ success: true, coupon: serializeCoupon(updated) });
});

function serializeCoupon(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    templateId: row.template_id,
    code: row.code,
    title: row.title,
    faceValue: row.face_value,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
    usedAt: row.used_at,
    statusLabel: row.status === 'used' ? '已核销' : '未核销'
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Hexiaoma backend listening on http://localhost:${port}`);
  });
}

export default app;

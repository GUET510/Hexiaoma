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

const getGeneralCouponById = (id) =>
  db.prepare('SELECT * FROM general_coupons WHERE id = ?').get(id);

const nextGeneralCouponId = () => {
  const row = db.prepare('SELECT COALESCE(MAX(id), 99999) as maxId FROM general_coupons').get();
  return (row?.maxId || 99999) + 1;
};

const serializeGeneralCoupon = (row) => ({
  id: row.id,
  name: row.name,
  brand: row.brand,
  amount: row.amount,
  minSpend: row.min_spend,
  durationDays: row.duration_days,
  couponType: row.coupon_type,
  storeScope: row.store_scope,
  status: row.status,
  issuedCount: row.issued_count,
  usedCount: row.used_count,
  lockedCount: row.locked_count,
  nextSerial: row.next_serial,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/general-coupons', (req, res) => {
  const query = (req.query.query || '').trim();
  const rows = query
    ? db
        .prepare(
          `SELECT * FROM general_coupons WHERE name LIKE @q OR brand LIKE @q ORDER BY created_at DESC`
        )
        .all({ q: `%${query}%` })
    : db.prepare('SELECT * FROM general_coupons ORDER BY created_at DESC').all();

  res.json({ templates: rows.map(serializeGeneralCoupon) });
});

app.post('/api/general-coupons', (req, res) => {
  const { name, brand, amount, minSpend, durationDays, couponType, storeScope } = req.body || {};
  if (!name || !amount || !couponType) {
    res.status(400).json({ message: 'name, amount, couponType are required' });
    return;
  }
  const id = nextGeneralCouponId();
  const stmt = db.prepare(`
    INSERT INTO general_coupons (id, name, brand, amount, min_spend, duration_days, coupon_type, store_scope, status)
    VALUES (@id, @name, @brand, @amount, @minSpend, @durationDays, @couponType, @storeScope, 'active')
  `);
  stmt.run({
    id,
    name,
    brand: brand || '',
    amount: Number(amount),
    minSpend: Number(minSpend) || 0,
    durationDays: Number(durationDays) || 0,
    couponType,
    storeScope: storeScope || '全部门店'
  });
  const created = getGeneralCouponById(id);
  res.status(201).json({ template: serializeGeneralCoupon(created) });
});

app.put('/api/general-coupons/:id', (req, res) => {
  const id = Number(req.params.id);
  const template = getGeneralCouponById(id);
  if (!template) {
    res.status(404).json({ message: '模板不存在' });
    return;
  }
  const { name, brand, amount, minSpend, durationDays, couponType, status, storeScope } = req.body || {};
  const stmt = db.prepare(`
    UPDATE general_coupons
    SET name = @name, brand = @brand, amount = @amount, min_spend = @minSpend,
        duration_days = @durationDays, coupon_type = @couponType, store_scope = @storeScope,
        status = COALESCE(@status, status),
        updated_at = datetime('now')
    WHERE id = @id
  `);
  stmt.run({
    id,
    name: name || template.name,
    brand: brand ?? template.brand,
    amount: amount != null ? Number(amount) : template.amount,
    minSpend: minSpend != null ? Number(minSpend) : template.min_spend,
    durationDays: durationDays != null ? Number(durationDays) : template.duration_days,
    couponType: couponType || template.coupon_type,
    storeScope: storeScope ?? template.store_scope,
    status
  });
  const updated = getGeneralCouponById(id);
  res.json({ template: serializeGeneralCoupon(updated) });
});

app.post('/api/general-coupons/:id/down', (req, res) => {
  const id = Number(req.params.id);
  const template = getGeneralCouponById(id);
  if (!template) {
    res.status(404).json({ message: '模板不存在' });
    return;
  }
  db.prepare("UPDATE general_coupons SET status = 'inactive', updated_at = datetime('now') WHERE id = ?").run(id);
  const updated = getGeneralCouponById(id);
  res.json({ template: serializeGeneralCoupon(updated) });
});

app.post('/api/general-coupons/:id/duplicate', (req, res) => {
  const id = Number(req.params.id);
  const template = getGeneralCouponById(id);
  if (!template) {
    res.status(404).json({ message: '模板不存在' });
    return;
  }
  const newId = nextGeneralCouponId();
  db.prepare(
    `INSERT INTO general_coupons (id, name, brand, amount, min_spend, duration_days, coupon_type, store_scope, status)
     VALUES (@id, @name, @brand, @amount, @minSpend, @durationDays, @couponType, @storeScope, 'active')`
  ).run({
    id: newId,
    name: template.name,
    brand: template.brand,
    amount: template.amount,
    minSpend: template.min_spend,
    durationDays: template.duration_days,
    couponType: template.coupon_type,
    storeScope: template.store_scope
  });
  const created = getGeneralCouponById(newId);
  res.status(201).json({ template: serializeGeneralCoupon(created) });
});

app.get('/api/customers', (req, res) => {
  const phone = (req.query.phone || '').trim();
  const rows = phone
    ? db
        .prepare(
          `SELECT customers.id, customers.phone, customers.created_at, COUNT(coupons.id) AS coupon_count,
          SUM(CASE WHEN coupons.status = 'used' THEN 1 ELSE 0 END) AS used_count
          FROM customers
          LEFT JOIN coupons ON coupons.customer_id = customers.id
          WHERE customers.phone LIKE @phone
          GROUP BY customers.id
          ORDER BY customers.created_at DESC`
        )
        .all({ phone: `%${phone}%` })
    : db
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

app.get('/api/admin/coupons', (req, res) => {
  const query = (req.query.query || '').trim();
  const rows = query
    ? db
        .prepare(
          `SELECT coupons.*, customers.phone as customer_phone FROM coupons
           LEFT JOIN customers ON customers.id = coupons.customer_id
           WHERE coupons.serial LIKE @q OR coupons.title LIKE @q OR customers.phone LIKE @q
           ORDER BY coupons.created_at DESC`
        )
        .all({ q: `%${query}%` })
    : db
        .prepare(
          `SELECT coupons.*, customers.phone as customer_phone FROM coupons
           LEFT JOIN customers ON customers.id = coupons.customer_id
           ORDER BY coupons.created_at DESC`
        )
        .all();

  res.json({ coupons: rows.map((row) => serializeCoupon(row, true)) });
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

app.post('/api/issue-coupons', (req, res) => {
  const { customerId, phone, templateId, quantity } = req.body || {};
  const qty = Number(quantity) || 0;
  if (!templateId) {
    res.status(400).json({ message: 'templateId is required' });
    return;
  }
  if (qty <= 0) {
    res.status(400).json({ message: 'quantity must be greater than 0' });
    return;
  }

  const template = getGeneralCouponById(Number(templateId));
  if (!template) {
    res.status(404).json({ message: '模板不存在' });
    return;
  }
  if (template.status === 'inactive') {
    res.status(400).json({ message: '该模板已下架' });
    return;
  }

  let ownerId = Number(customerId) || null;
  let ownerPhone = (phone || '').trim();
  if (!ownerId) {
    if (!ownerPhone) {
      res.status(400).json({ message: 'customerId or phone is required' });
      return;
    }
    const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(ownerPhone);
    if (!existing) {
      res.status(404).json({ message: '该手机号未注册用户，请先创建用户后再发放' });
      return;
    }
    ownerId = existing.id;
    ownerPhone = existing.phone;
  } else {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(ownerId);
    if (!existing) {
      res.status(404).json({ message: '用户不存在，请检查用户ID' });
      return;
    }
    if (!ownerPhone) {
      ownerPhone = existing.phone;
    }
  }

  const inserts = db.prepare(`
    INSERT INTO coupons (customer_id, template_id, template_base_id, code, title, face_value, category, brand, min_spend, duration_days, coupon_type, serial, store_scope, status)
    VALUES (@customerId, @templateId, @templateBaseId, @code, @title, @faceValue, @category, @brand, @minSpend, @durationDays, @couponType, @serial, @storeScope, 'active')
  `);

  const issued = [];
  for (let i = 0; i < qty; i += 1) {
    const serialNo = template.next_serial + i;
    const serial = `${template.id}_${String(serialNo).padStart(5, '0')}`;
    const code = `HX-${template.id}-${serialNo}-${nanoid(6).toUpperCase()}`;
    inserts.run({
      customerId: ownerId,
      templateId: template.id,
      templateBaseId: template.id,
      code,
      title: template.name,
      faceValue: template.amount,
      category: template.brand,
      brand: template.brand,
      minSpend: template.min_spend,
      durationDays: template.duration_days,
      couponType: template.coupon_type,
      serial,
      storeScope: template.store_scope || '全部门店'
    });
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code);
    issued.push(serializeCoupon({ ...coupon, customer_phone: ownerPhone }, true));
  }

  db.prepare(
    'UPDATE general_coupons SET issued_count = issued_count + @count, next_serial = next_serial + @count, updated_at = datetime(\'now\') WHERE id = @id'
  ).run({ count: qty, id: template.id });

  res.status(201).json({ coupons: issued });
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
  if (coupon.template_base_id) {
    db.prepare('UPDATE general_coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.template_base_id);
  }
  const updated = db.prepare('SELECT * FROM coupons WHERE id = ?').get(coupon.id);
  res.json({ success: true, coupon: serializeCoupon(updated) });
});

function serializeCoupon(row, includePhone = false) {
  return {
    id: row.id,
    customerId: row.customer_id,
    templateId: row.template_id,
    code: row.code,
    serial: row.serial,
    title: row.title,
    faceValue: row.face_value,
    category: row.category,
    brand: row.brand,
    minSpend: row.min_spend,
    durationDays: row.duration_days,
    couponType: row.coupon_type,
    status: row.status,
    createdAt: row.created_at,
    usedAt: row.used_at,
    statusLabel: row.status === 'used' ? '已核销' : '未核销',
    customerPhone: includePhone ? row.customer_phone : undefined,
    storeScope: row.store_scope || '全部门店'
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

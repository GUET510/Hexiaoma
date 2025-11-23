import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import { db, columnExists } from './db.js';
import { runMigrations } from './migrate.js';
import templates from './templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

runMigrations();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..', 'web')));

const findTemplate = (id) => templates.find((tpl) => tpl.id === id);

const isValidPhone = (phone) => /^\d{11}$/.test((phone || '').toString());

const SECRET_KEY = process.env.COUPON_SECRET || 'hexiaoma-secret';
const beijingNow = () => new Date(Date.now() + 8 * 60 * 60 * 1000);
const formatDateTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
};

const signToken = (userId) => {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', SECRET_KEY).update(`${userId}.${ts}`).digest('hex');
  return `${userId}.${ts}.${sig}`;
};

const parseToken = (token) => {
  if (!token) return null;
  const [id, ts, sig] = token.split('.');
  if (!id || !ts || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET_KEY).update(`${id}.${ts}`).digest('hex');
  if (expected !== sig) return null;
  return Number(id);
};

const beijingTimestamp = () => formatDateTime(beijingNow());

const getGeneralCouponById = (id) =>
  db.prepare('SELECT * FROM general_coupons WHERE id = ?').get(id);

const getEmployeeById = (id) => db.prepare('SELECT * FROM employees WHERE id = ?').get(id);

const getEmployeeByPhone = (phone) => db.prepare('SELECT * FROM employees WHERE phone = ?').get(phone);

const getManagerByPhone = (phone) => db.prepare('SELECT * FROM store_managers WHERE phone = ?').get(phone);

const nextStoreId = () => {
  const row = db.prepare('SELECT COALESCE(MAX(id), 100) AS maxId FROM stores').get();
  return (row?.maxId || 100) + 1;
};

const nextGeneralCouponId = () => {
  const row = db.prepare('SELECT COALESCE(MAX(id), 99999) as maxId FROM general_coupons').get();
  return (row?.maxId || 99999) + 1;
};

const nextEmployeeId = () => {
  const row = db.prepare('SELECT COALESCE(MAX(id), 999) as maxId FROM employees').get();
  return (row?.maxId || 999) + 1;
};

const nextStaffCode = (storeId) => {
  const rows = db
    .prepare('SELECT staff_code FROM employees WHERE store_id = ? AND staff_code LIKE ? ORDER BY staff_code DESC')
    .all(storeId, `${storeId}_%`);
  if (!rows.length) return `${storeId}_002`;
  const latest = rows[0].staff_code || `${storeId}_002`;
  const parts = latest.split('_');
  const seq = Number(parts[1] || '1') + 1;
  return `${storeId}_${String(seq).padStart(3, '0')}`;
};

const serializeGeneralCoupon = (row) => ({
  id: row.id,
  name: row.name,
  brand: row.brand,
  amount: row.amount,
  minSpend: row.min_spend,
  durationDays: row.duration_days,
  couponType: row.coupon_type,
  status: row.status,
  issuedCount: row.issued_count,
  usedCount: row.used_count,
  lockedCount: row.locked_count,
  nextSerial: row.next_serial,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const getUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const getUserByOpenid = (openid) => db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
const getUserByPhone = (phone) => db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

const ensureCustomer = (phone) => {
  if (!phone) return null;
  let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (!customer) {
    const result = db.prepare('INSERT INTO customers (phone) VALUES (?)').run(phone);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  }
  return customer;
};

const ensureUser = ({ phone, role = 'user', openid = null, brandId = null, storeId = null }) => {
  let user = phone ? getUserByPhone(phone) : null;
  if (!user && openid) {
    user = getUserByOpenid(openid);
  }
  if (!user) {
    const result = db
      .prepare('INSERT INTO users (openid, phone, role, brand_id, store_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(openid, phone || null, role, brandId, storeId, beijingTimestamp());
    user = getUserById(result.lastInsertRowid);
  } else if (role && user.role !== role) {
    db.prepare('UPDATE users SET role = ?, brand_id = ?, store_id = ? WHERE id = ?').run(role, brandId, storeId, user.id);
    user = getUserById(user.id);
  }
  if (phone) ensureCustomer(phone);
  return user;
};

const buildTokenResponse = (user) => ({ token: signToken(user.id), user });

const requireAuth = (req, res, roles = []) => {
  const raw = req.headers.authorization || '';
  const token = raw.replace(/Bearer\s+/i, '');
  const userId = parseToken(token);
  if (!userId) {
    res.status(401).json({ message: '未登录或凭证失效' });
    return null;
  }
  const user = getUserById(userId);
  if (!user) {
    res.status(401).json({ message: '未找到用户' });
    return null;
  }
  if (roles.length && !roles.includes(user.role)) {
    res.status(403).json({ message: '无权限' });
    return null;
  }
  return user;
};

const generateCode = () => {
  const random = crypto.randomBytes(6).toString('hex');
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', SECRET_KEY).update(`${random}.${ts}`).digest('hex').slice(0, 10);
  return `${random}${sig}${ts.slice(-4)}`;
};

// Cache column support to avoid runtime SQL errors on legacy databases
const couponsHasStoreId = columnExists('coupons', 'store_id');

const seedTemplates = () => {
  const row = db.prepare('SELECT COUNT(1) as count FROM coupon_templates').get();
  if (row?.count > 0) return;
  db.prepare(
    'INSERT INTO coupon_templates (name, discount_type, value, valid_days, brand_id, created_at) VALUES (?, ?, ?, ?, ?, ?)' // prettier-ignore
  ).run('满200减50', '全场满减卷', 50, 30, 1, beijingTimestamp());
  db.prepare(
    'INSERT INTO coupon_templates (name, discount_type, value, valid_days, brand_id, created_at) VALUES (?, ?, ?, ?, ?, ?)' // prettier-ignore
  ).run('油卡券500元', '全场代金卷', 500, 60, 1, beijingTimestamp());
};

seedTemplates();

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/auth/loginByPhone', (req, res) => {
  const { phone, password, role } = req.body || {};
  if (!isValidPhone(phone)) {
    res.status(400).json({ message: '手机号必须为11位数字' });
    return;
  }

  if (role === 'staff') {
    const employee = getEmployeeByPhone(phone);
    if (!employee) {
      res.status(400).json({ message: '该手机号未登记为员工' });
      return;
    }
    if (employee.password && password && employee.password !== password) {
      res.status(401).json({ message: '密码错误' });
      return;
    }
    const user = ensureUser({ phone, role: 'staff', storeId: employee.store_id });
    res.json(buildTokenResponse(user));
    return;
  }

  const user = ensureUser({ phone, role: 'user' });
  res.json(buildTokenResponse(user));
});

app.post('/auth/loginByCode', (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    res.status(400).json({ message: 'code required' });
    return;
  }
  const openid = `code_${code}`;
  const user = ensureUser({ openid, role: 'user' });
  res.json(buildTokenResponse(user));
});

app.get('/coupon/templates', (req, res) => {
  const rows = db
    .prepare('SELECT id, name, discount_type, value, valid_days, brand_id, created_at FROM coupon_templates ORDER BY created_at DESC')
    .all();
  res.json({ templates: rows });
});

app.get('/coupon/list', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const rows = db
    .prepare(
      `SELECT ci.*, ct.name, ct.discount_type, ct.value, ct.valid_days
       FROM coupon_instances ci
       LEFT JOIN coupon_templates ct ON ci.template_id = ct.id
       WHERE ci.user_id = ?
       ORDER BY ci.created_at DESC`
    )
    .all(user.id);
  res.json({
    coupons: rows.map((row) => ({
      id: row.id,
      templateId: row.template_id,
      code: row.code,
      name: row.name,
      couponType: row.discount_type,
      value: row.value,
      validDays: row.valid_days,
      status: row.status,
      createdAt: row.created_at,
      usedAt: row.used_at
    }))
  });
});

app.post('/coupon/create', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const { templateId, phone } = req.body || {};
  if (!templateId) {
    res.status(400).json({ message: 'templateId is required' });
    return;
  }
  const tpl = db.prepare('SELECT * FROM coupon_templates WHERE id = ?').get(templateId);
  if (!tpl) {
    res.status(404).json({ message: '模板不存在' });
    return;
  }
  let targetUser = user;
  if (phone) {
    if (!isValidPhone(phone)) {
      res.status(400).json({ message: '手机号必须为11位数字' });
      return;
    }
    targetUser = ensureUser({ phone, role: 'user' });
  }
  const code = generateCode();
  const createdAt = beijingTimestamp();
  const stmt = db.prepare(
    'INSERT INTO coupon_instances (template_id, code, user_id, sales_id, store_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(tpl.id, code, targetUser.id, user.id, user.store_id || null, 'active', createdAt);
  res.status(201).json({
    coupon: {
      templateId: tpl.id,
      code,
      name: tpl.name,
      couponType: tpl.discount_type,
      value: tpl.value,
      validDays: tpl.valid_days,
      status: 'active',
      createdAt
    }
  });
});

app.post('/coupon/verify', (req, res) => {
  const operator = requireAuth(req, res, ['staff', 'manager']);
  if (!operator) return;
  const { code } = req.body || {};
  if (!code) {
    res.status(400).json({ message: 'code is required' });
    return;
  }
  const row = db
    .prepare(
      `SELECT ci.*, ct.valid_days FROM coupon_instances ci LEFT JOIN coupon_templates ct ON ct.id = ci.template_id WHERE ci.code = ?`
    )
    .get(code);
  if (!row) {
    res.status(404).json({ message: '优惠券不存在' });
    return;
  }
  if (row.status !== 'active') {
    res.status(400).json({ message: '优惠券不可核销' });
    return;
  }
  const created = row.created_at ? new Date(row.created_at.replace(/ /g, 'T')) : null;
  if (created && row.valid_days) {
    const expire = new Date(created.getTime() + Number(row.valid_days) * 24 * 60 * 60 * 1000);
    if (beijingNow() > expire) {
      res.status(400).json({ message: '优惠券已过期' });
      return;
    }
  }
  const usedAt = beijingTimestamp();
  db.prepare('UPDATE coupon_instances SET status = ?, used_at = ? WHERE id = ?').run('used', usedAt, row.id);
  db.prepare('INSERT INTO coupon_verify_logs (coupon_id, operator_id, store_id, action, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(row.id, operator.id, operator.store_id || null, 'verify', usedAt);
  res.json({ message: '核销成功', usedAt });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === 'admin' && password === 'password') {
    res.json({ role: 'super', username: 'admin' });
  } else {
    res.status(401).json({ message: '账号或密码错误' });
  }
});

app.get('/api/admin/stores', (req, res) => {
  const stores = db
    .prepare(
      `SELECT stores.*, sm.phone as manager_phone, sm.id as manager_id FROM stores
       LEFT JOIN store_managers sm ON sm.store_id = stores.id
       ORDER BY stores.id ASC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      managerPhone: row.manager_phone,
      managerId: row.manager_id
    }));
  res.json({ stores });
});

app.post('/api/admin/stores', (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    res.status(400).json({ message: '门店名称必填' });
    return;
  }
  const id = nextStoreId();
  db.prepare('INSERT INTO stores (id, name) VALUES (?, ?)').run(id, name);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  res.status(201).json({ store: { id: store.id, name: store.name, createdAt: store.created_at } });
});

app.post('/api/admin/store-managers', (req, res) => {
  const { storeId, name, phone, password } = req.body || {};
  if (!storeId || !name || !phone || !password) {
    res.status(400).json({ message: 'storeId, name, phone, password 必填' });
    return;
  }
  if (!isValidPhone(phone)) {
    res.status(400).json({ message: '手机号必须为11位数字' });
    return;
  }
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  if (!store) {
    res.status(404).json({ message: '门店不存在' });
    return;
  }
  if (getManagerByPhone(phone)) {
    res.status(400).json({ message: '该手机号已存在门店管理员' });
    return;
  }
  const managerId = `${storeId}_001`;
  const existsManager = db.prepare('SELECT * FROM store_managers WHERE id = ?').get(managerId);
  if (existsManager) {
    res.status(400).json({ message: '该门店管理员已存在' });
    return;
  }
  db.prepare('INSERT INTO store_managers (id, store_id, name, phone, password) VALUES (?, ?, ?, ?, ?)')
    .run(managerId, storeId, name, phone, password);
  const manager = db.prepare('SELECT * FROM store_managers WHERE id = ?').get(managerId);
  res.status(201).json({
    manager: {
      id: manager.id,
      storeId: manager.store_id,
      name: manager.name,
      phone: manager.phone,
      createdAt: manager.created_at
    }
  });
});

app.post('/api/manager/login', (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    res.status(400).json({ message: 'phone 和 password 必填' });
    return;
  }
  if (!isValidPhone(phone)) {
    res.status(400).json({ message: '手机号必须为11位数字' });
    return;
  }
  const manager = getManagerByPhone(phone);
  if (!manager || manager.password !== password) {
    res.status(401).json({ message: '账号或密码错误' });
    return;
  }
  res.json({ managerId: manager.id, storeId: manager.store_id, name: manager.name, phone: manager.phone });
});

app.get('/api/general-coupons', (req, res) => {
  const query = (req.query.query || '').trim();
  const rows = query
    ? db
        .prepare(`SELECT * FROM general_coupons WHERE (name LIKE @q OR brand LIKE @q) ORDER BY created_at DESC`)
        .all({ q: `%${query}%` })
    : db.prepare(`SELECT * FROM general_coupons ORDER BY created_at DESC`).all();

  res.json({ templates: rows.map(serializeGeneralCoupon) });
});

app.post('/api/general-coupons', (req, res) => {
  const { name, brand, amount, minSpend, durationDays, couponType } = req.body || {};
  const amountValue = Number(amount);
  const minSpendValue = Number(minSpend) || 0;
  const durationValue = Number(durationDays) || 0;

  if (!name || !amount || !couponType) {
    res.status(400).json({ message: 'name, amount, couponType are required' });
    return;
  }
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    res.status(400).json({ message: '金额必须为正数' });
    return;
  }

  try {
    const id = nextGeneralCouponId();
    const stmt = db.prepare(`
      INSERT INTO general_coupons (id, name, brand, amount, min_spend, duration_days, coupon_type, status)
      VALUES (@id, @name, @brand, @amount, @minSpend, @durationDays, @couponType, 'active')
    `);
    stmt.run({
      id,
      name,
      brand: brand || '',
      amount: amountValue,
      minSpend: minSpendValue,
      durationDays: durationValue,
      couponType
    });
    const created = getGeneralCouponById(id);
    res.status(201).json({ template: serializeGeneralCoupon(created) });
  } catch (err) {
    console.error('create general coupon failed', err);
    res.status(500).json({ message: '创建通用优惠券失败，请检查数据后重试' });
  }
});

app.put('/api/general-coupons/:id', (req, res) => {
  const id = Number(req.params.id);
  const template = getGeneralCouponById(id);
  if (!template) {
    res.status(404).json({ message: '模板不存在' });
    return;
  }
  const { name, brand, amount, minSpend, durationDays, couponType, status } = req.body || {};
  const stmt = db.prepare(`
    UPDATE general_coupons
    SET name = @name, brand = @brand, amount = @amount, min_spend = @minSpend,
        duration_days = @durationDays, coupon_type = @couponType,
        status = COALESCE(@status, status),
        updated_at = datetime('now','+8 hours')
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
  db.prepare("UPDATE general_coupons SET status = 'inactive', updated_at = datetime('now','+8 hours') WHERE id = ?").run(id);
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
    `INSERT INTO general_coupons (id, name, brand, amount, min_spend, duration_days, coupon_type, status)
     VALUES (@id, @name, @brand, @amount, @minSpend, @durationDays, @couponType, 'active')`
  ).run({
    id: newId,
    name: template.name,
    brand: template.brand,
    amount: template.amount,
    minSpend: template.min_spend,
    durationDays: template.duration_days,
    couponType: template.coupon_type
  });
  const created = getGeneralCouponById(newId);
  res.status(201).json({ template: serializeGeneralCoupon(created) });
});

app.get('/api/customers', (req, res) => {
  const phone = (req.query.phone || '').trim();
  const requestStoreId = req.query.storeId ? Number(req.query.storeId) : null;
  const storeId = couponsHasStoreId ? requestStoreId : null;
  const joinFilter = storeId
    ? 'LEFT JOIN coupons ON coupons.customer_id = customers.id AND coupons.store_id = @storeId'
    : 'LEFT JOIN coupons ON coupons.customer_id = customers.id';
  const rows = phone
    ? db
        .prepare(
          `SELECT customers.id, customers.phone, customers.created_at, COUNT(coupons.id) AS coupon_count,
          SUM(CASE WHEN coupons.status = 'used' THEN 1 ELSE 0 END) AS used_count
          FROM customers
          ${joinFilter}
          WHERE customers.phone LIKE @phone
          GROUP BY customers.id
          ORDER BY customers.created_at DESC`
        )
        .all({ phone: `%${phone}%`, storeId })
    : db
        .prepare(`
          SELECT customers.id, customers.phone, customers.created_at, COUNT(coupons.id) AS coupon_count,
            SUM(CASE WHEN coupons.status = 'used' THEN 1 ELSE 0 END) AS used_count
          FROM customers
          ${joinFilter}
          GROUP BY customers.id
          ORDER BY customers.created_at DESC
        `)
        .all({ storeId });

  const customers = rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    createdAt: row.created_at,
    couponCount: row.coupon_count || 0,
    usedCount: row.used_count || 0
  }));

  res.json({ customers });
});

app.get('/api/employees', (req, res) => {
  const phone = (req.query.phone || '').trim();
  const storeId = req.query.storeId ? Number(req.query.storeId) : null;
  const storeClause = storeId ? 'AND store_id = @storeId' : '';
  const rows = phone
    ? db
        .prepare(
          `SELECT * FROM employees WHERE (phone LIKE @phone OR name LIKE @phone) ${storeClause} ORDER BY created_at DESC`
        )
        .all({ phone: `%${phone}%`, storeId })
    : db
        .prepare(`SELECT * FROM employees WHERE 1=1 ${storeClause} ORDER BY created_at DESC`)
        .all({ storeId });

  res.json({
    employees: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      storeId: row.store_id,
      staffCode: row.staff_code,
      createdAt: row.created_at
    }))
  });
});

app.post('/api/employees', (req, res) => {
  const { name, phone, storeId, password } = req.body || {};
  if (!name || !phone || !storeId || !password) {
    res.status(400).json({ message: 'name, phone, storeId, password are required' });
    return;
  }
  if (!isValidPhone(phone)) {
    res.status(400).json({ message: '手机号必须为11位数字' });
    return;
  }
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  if (!store) {
    res.status(404).json({ message: '门店不存在' });
    return;
  }
  const existing = getEmployeeByPhone(phone);
  if (existing) {
    res.status(400).json({ message: '该手机号已存在员工' });
    return;
  }
  const id = nextEmployeeId();
  const staffCode = nextStaffCode(storeId);
  db.prepare('INSERT INTO employees (id, name, phone, store_id, staff_code, password) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, phone, storeId, staffCode, password || '');
  const created = getEmployeeById(id);
  res.status(201).json({
    employee: { id: created.id, name: created.name, phone: created.phone, storeId: created.store_id, staffCode }
  });
});

app.post('/api/login', (req, res) => {
  const phone = (req.body.phone || '').toString();
  if (!phone) {
    res.status(400).json({ message: 'phone is required' });
    return;
  }
  if (!isValidPhone(phone)) {
    res.status(400).json({ message: '手机号必须为11位数字' });
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

app.post('/api/staff/login', (req, res) => {
  const phone = (req.body.phone || '').toString();
  const password = (req.body.password || '').toString();
  if (!phone || !password) {
    res.status(400).json({ message: 'phone and password are required' });
    return;
  }
  if (!isValidPhone(phone)) {
    res.status(400).json({ message: '手机号必须为11位数字' });
    return;
  }
  const employee = getEmployeeByPhone(phone);
  if (!employee || (employee.password && employee.password !== password)) {
    res.status(404).json({ message: '该手机号未注册员工或密码错误' });
    return;
  }
  res.json({
    staffId: employee.staff_code || employee.id,
    id: employee.id,
    name: employee.name,
    phone: employee.phone,
    storeId: employee.store_id
  });
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
  const requestStoreId = req.query.storeId ? Number(req.query.storeId) : null;
  const storeId = couponsHasStoreId ? requestStoreId : null;
  const storeWhere = storeId ? 'AND coupons.store_id = @storeId' : '';
  const rows = query
    ? db
        .prepare(
          `SELECT coupons.*, customers.phone as customer_phone FROM coupons
           LEFT JOIN customers ON customers.id = coupons.customer_id
           WHERE (coupons.serial LIKE @q OR coupons.title LIKE @q OR customers.phone LIKE @q) ${storeWhere}
           ORDER BY coupons.created_at DESC`
        )
        .all({ q: `%${query}%`, storeId })
    : db
        .prepare(
          `SELECT coupons.*, customers.phone as customer_phone FROM coupons
           LEFT JOIN customers ON customers.id = coupons.customer_id
           WHERE 1=1 ${storeWhere}
           ORDER BY coupons.created_at DESC`
        )
        .all({ storeId });

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
  const { customerId, phone, templateId, quantity, storeId: issueStoreId } = req.body || {};
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
  if (issueStoreId) {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(issueStoreId);
    if (!store) {
      res.status(404).json({ message: '门店不存在，请检查 storeId' });
      return;
    }
  }

  let ownerId = Number(customerId) || null;
  let ownerPhone = (phone || '').trim();
  if (ownerPhone && !isValidPhone(ownerPhone)) {
    res.status(400).json({ message: '手机号必须为11位数字' });
    return;
  }
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

  const hasStoreId = columnExists('coupons', 'store_id');
  const couponFields = [
    { column: 'customer_id', key: 'customerId' },
    { column: 'template_id', key: 'templateId' },
    { column: 'template_base_id', key: 'templateBaseId' },
    { column: 'code', key: 'code' },
    { column: 'title', key: 'title' },
    { column: 'face_value', key: 'faceValue' },
    { column: 'category', key: 'category' },
    { column: 'brand', key: 'brand' },
    { column: 'min_spend', key: 'minSpend' },
    { column: 'duration_days', key: 'durationDays' },
    { column: 'coupon_type', key: 'couponType' },
    { column: 'serial', key: 'serial' },
    { column: 'store_scope', key: 'storeScope' }
  ];

  if (hasStoreId) {
    couponFields.push({ column: 'store_id', key: 'storeId' });
  }

  couponFields.push({ column: 'status', raw: "'active'" });

  const insertColumns = couponFields.map((f) => f.column).join(', ');
  const insertValues = couponFields
    .map((f) => (f.raw ? f.raw : `@${f.key}`))
    .join(', ');

  const inserts = db.prepare(
    `INSERT INTO coupons (${insertColumns}) VALUES (${insertValues})`
  );

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
      storeScope: template.store_scope || '全部门店',
      storeId: issueStoreId || null
    });
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code);
    issued.push(serializeCoupon({ ...coupon, customer_phone: ownerPhone }, true));
  }

  db.prepare(
    'UPDATE general_coupons SET issued_count = issued_count + @count, next_serial = next_serial + @count, updated_at = datetime(\'now\',\'+8 hours\') WHERE id = @id'
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
  db.prepare(
    "UPDATE coupons SET status = ?, used_at = datetime('now','+8 hours'), used_by_staff_id = NULL, used_by_staff_name = NULL, used_by_staff_phone = NULL WHERE id = ?"
  ).run('used', coupon.id);
  if (coupon.template_base_id) {
    db.prepare('UPDATE general_coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.template_base_id);
  }
  const updated = db.prepare('SELECT * FROM coupons WHERE id = ?').get(coupon.id);
  res.json({ success: true, coupon: serializeCoupon(updated) });
});

app.post('/api/staff/verify', (req, res) => {
  const { staffId, code } = req.body || {};
  const normalized = (code || '').toString().trim();
  if (!staffId || !normalized) {
    res.status(400).json({ message: 'staffId and code are required' });
    return;
  }
  const employee =
    getEmployeeById(Number(staffId)) ||
    db.prepare('SELECT * FROM employees WHERE staff_code = ?').get(staffId.toString());
  if (!employee) {
    res.status(403).json({ message: '员工不存在或未授权' });
    return;
  }
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(normalized);
  if (!coupon) {
    res.status(404).json({ success: false, message: '未找到该核销码' });
    return;
  }
  if (coupon.status === 'used') {
    res.status(400).json({ success: false, message: '该优惠券已核销' });
    return;
  }
  db.prepare(
    "UPDATE coupons SET status = ?, used_at = datetime('now','+8 hours'), used_by_staff_id = ?, used_by_staff_name = ?, used_by_staff_phone = ? WHERE id = ?"
  ).run('used', employee.id, employee.name, employee.phone, coupon.id);
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
    storeScope: row.store_scope || '全部门店',
    storeId: row.store_id,
    usedByStaffId: row.used_by_staff_id,
    usedByStaffName: row.used_by_staff_name,
    usedByStaffPhone: row.used_by_staff_phone
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

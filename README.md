# 优惠券核销小程序 + 后端

面向真实环境的微信小程序示例，包含用户侧优惠券展示、员工侧核销工具，以及 Node.js + SQLite 的后端与带通用券/发放/员工管理入口的 Web 演示页。

## 功能概览
- **用户端**：手机号授权登录后仅展示已发放的优惠券二维码/有效期/门店等信息，不再提供用户自助核销入口。
- **员工端**：从登录页底部进入员工登录，支持手机号授权/手输，校验该手机号是否为员工，登录后进入专属核销工具（扫码或手动核销）。
- **后台管理**：SQLite 持久化客户、员工、优惠券、通用券；Web 端支持通用优惠券创建/发放、员工/门店管理、查看优惠券列表等。

## 后端安全与基础设施加固
- **多数据库支持**：默认 SQLite，可通过 `DB_CLIENT=pg|mysql2` + `DB_URL` 切换到 PostgreSQL / MySQL（基于 `knex` 连接池）。
- **Redis/内存缓存**：`REDIS_URL` 配置后使用 Redis 存储会话、幂等令牌、节流计数；未配置时自动退化为内存缓存。
- **JWT + 会话**：登录返回 JWT，服务端并行缓存会话 sid，过期或被清理后自动失效，所有接口统一校验 Authorization 头。
- **权限与审计**：角色覆盖品牌/门店/销售（user/staff/manager/super），敏感操作写入 `audit_logs`（登录、发券、核销）。
- **风险控制**：接口级限流（express-rate-limit）、幂等键（发券/核销要求 idempotencyKey）与签名核销码（后端生成 code+signature+有效期校验），核销时强校验签名、有效期、一次性使用并记录核销人/时间。
- **密钥与配置**：生产环境必须设置 `COUPON_SECRET`（默认值会直接阻断启动），并配置微信 `WX_APPID/WX_SECRET` 以走真实 code2session。

## 小程序前端改造
- 页面模块化：发券、券列表、核销拆分为 `/pages/createCoupon/index`、`/pages/couponList/index`、`/pages/verify/index`，登录页下方保留员工登录入口。
- 公共组件：`components/CouponCard` 用于展示券信息，`components/StatBar` 展示剩余次数和有效期等基础统计。
- 统一请求封装：`utils/request.js` 自动注入 token、处理 loading 与错误提示，全站接口调用走该封装。
- 状态缓存：`app.js` 启动尝试 `/auth/loginByCode`，手动手机号登录走 `/auth/loginByPhone`，并把 `userInfo`/`token` 写入 `globalData` 与 Storage。
- 品牌化：`app.wxss` 定义 `--primary-color`、`--text-main` 等主题变量，可按 `brand_id` 扩展。

### 权限与角色
- **超级管理员**：账号 `admin` / 密码 `password`，可创建门店（ID 从 101 起自动递增）及对应门店管理员（账号形如 `门店ID_001`，手机号需 11 位，密码自定义）。
- **门店管理员**：使用 11 位手机号 + 密码登录 Web 端，仅查看本门店的用户、通用券、优惠券、员工列表，并可为本门店创建员工（工号形如 `门店ID_002` 递增，手机号 11 位，密码自定义）。
- **员工**：由门店管理员创建，使用手机号 + 密码在小程序“员工登录”页登录，仅进行优惠券核销。

## 启动步骤
### 1) 后端服务
```bash
cd server
npm install
npm start  # 默认 http://localhost:3000
```
- SQLite 数据库存放在 `server/data/hexiaoma.sqlite`，启动时自动创建数据目录和表。
- SQLite 数据库存放在 `server/data/hexiaoma.sqlite`，启动时自动创建数据目录和表，并自动执行字段迁移（也可单独运行 `npm run migrate`）。
- 所有时间字段（创建、更新、核销）均以北京时间（UTC+8）写入数据库，便于与业务时间一致。 
- 健康检查：`GET http://localhost:3000/health`。

### 2) 小程序
1. 打开微信开发者工具，导入本项目根目录。
2. 在 **详情 > 本地设置** 开启“使用自定义编译型 2D Canvas”。
3. 如需调用本地后端，在开发者工具的“本地设置 > 不校验合法域名”启用后即可直接访问 `http://localhost:3000`。
4. 体验流程：
   - 登录页授权手机号（真实环境会返回手机号/加密 code）。
   - 主页自动展示已发放的优惠券二维码及有效期/门店信息（无自助核销入口）。
   - 登录页底部点击“员工登录”进入员工端，校验手机号为员工后跳转核销工具（扫码/手动核销）。

### 3) Web 后台（示例）
- 启动后端后，访问 `http://localhost:3000` 即可打开管理页：
  - **用户列表**：按手机号搜索或直接浏览用户，并跳转查看/发放。
  - **员工列表**：按门店创建员工（手机号 11 位、需密码），工号形如 `门店ID_002` 起递增，可随时刷新查看员工名单。
  - **通用优惠券**：在列表页点击“创建通用优惠券”进入独立创建页，填写名称、品牌、金额、最低消费、有效期时长、类型，自动生成 6 位 ID（从 100000 起），支持下架/上架、复制、修改。
  - **优惠券发放**：按手机号检索用户并选择已存在的用户后，再选择通用券输入发放数量，生成实际优惠券，优惠券 ID 形如 `通用券ID_00000`（序号从 10000 起）；不存在的手机号会提示失败，不再自动创建用户。
  - **优惠券列表**：查看所有实际券（ID、名称、用户 ID、手机号、有效期时长、可用门店、核销时间、核销员工、状态）。

## API 摘要
- 小程序轻量接口：
  - `POST /auth/loginByCode` / `POST /auth/loginByPhone`：微信登录（支持 openid/unionid 绑定、手机号 11 位检查），返回 `{ token, user }`；员工登录需校验员工表及密码。
  - `GET /coupon/templates`：查询通用模板。
  - `POST /coupon/create`：`{ templateId, phone?, idempotencyKey? }` 生成券实例，后端返回签名后的 `{ code, signature, expiresAt }`，仅展示不在前端拼装。
  - `GET /coupon/list`：当前登录用户的券实例列表（包含签名与有效期）。
  - `POST /coupon/verify`：员工核销接口，需提供 idempotencyKey；校验权限/状态/签名/有效期，写入核销日志并记录核销人、核销时间。
- 原有通用接口（默认关闭，如需调试请设置 `ENABLE_LEGACY_API=true`）：
  - `POST /api/login`：`{ phone }` → `{ customerId, phone }`
  - `GET /api/customers[?phone=xxx]`：返回用户及已发券/已核销数量，可按手机号模糊搜索。
  - `GET /api/coupons?customerId=xxx`：返回该客户全部优惠券。
  - `POST /api/coupons`：`{ customerId, templateId }` 生成优惠券。
  - `GET /api/employees[?phone=xxx&storeId=xxx]`：查询员工列表（按姓名/手机号模糊搜索），可按门店过滤。
  - `POST /api/employees`：`{ name, phone, storeId, password }` 新增员工，工号形如 `门店ID_002` 起递增，手机号需 11 位。
  - `POST /api/staff/login`：`{ phone, password }` 校验员工手机号/密码后返回 `{ staffId, phone, name, storeId }`。
  - `POST /api/staff/verify`：`{ staffId, code }` 员工核销优惠券。
  - `POST /api/admin/login`：超级管理员登录（账号 admin / 密码 password）。
  - `POST /api/admin/stores` / `GET /api/admin/stores`：创建/查看门店（ID 从 101 起）。
  - `POST /api/admin/store-managers` / `POST /api/manager/login`：创建/登录门店管理员（手机号 + 密码）。
  - `GET /api/general-coupons[?query=xxx]`：查询通用优惠券模板。
  - `POST /api/general-coupons` / `PUT /api/general-coupons/:id`：创建或修改通用券。
  - `POST /api/general-coupons/:id/down` / `POST /api/general-coupons/:id/duplicate`：下架或复制通用券。
  - `POST /api/issue-coupons`：`{ customerId|phone, templateId, quantity }` 将通用券发放为实际优惠券，要求提供已存在的用户 ID 或手机号（不存在会返回 404）；实际券 ID 由通用券 6 位 ID 与 5 位流水号组成。

## 目录结构
- `pages/`：小程序前端页面（登录、发券、券列表、核销）。
- `components/`：`CouponCard`、`StatBar` 通用组件。
- `utils/`：`request.js` 请求封装，`qrcode.js` 二维码绘制工具。
- `server/`：Node.js + SQLite 后端与 Web 演示页。

## 最小后端数据模型（新增）
- `user(id, openid, unionid, phone, role, brand_id, store_id, created_at)`
- `coupon_template(id, name, discount_type, value, valid_days, brand_id, created_at)`
- `coupon_instance(id, template_id, code, signature, expires_at, user_id, sales_id, store_id, brand_id, status, created_at, used_at)`
- `coupon_verify_log(id, coupon_id, operator_id, store_id, action, created_at)`
- `audit_logs(id, actor_id, actor_role, action, target_type, target_id, detail, created_at)`

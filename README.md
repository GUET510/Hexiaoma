# 优惠券核销小程序 + 后端

面向真实环境的微信小程序示例，包含手机号授权登录、优惠券核销码生成/核销，以及 Node.js + SQLite 的后端与带通用券/发放入口的 Web 演示页。

## 功能概览
- 手机号授权登录，后端生成并返回 `customerId`。
- 选择优惠券模板（200 元优惠券、500 元油卡券、300 元保养券）并生成唯一核销码，前端同步绘制真实二维码图片。
- 列表展示全部优惠券状态，支持扫码或手动输入核销码后回写数据库。
- 后端使用 SQLite 持久化客户与核销码数据，并提供 Web 端查看/核销示例页：支持通用优惠券创建、发放到指定用户、查看全部券列表和状态。

## 启动步骤
### 1) 后端服务
```bash
cd server
npm install
npm start  # 默认 http://localhost:3000
```
- SQLite 数据库存放在 `server/data/hexiaoma.sqlite`，启动时自动创建数据目录和表。
- 健康检查：`GET http://localhost:3000/health`。

### 2) 小程序
1. 打开微信开发者工具，导入本项目根目录。
2. 在 **详情 > 本地设置** 开启“使用自定义编译型 2D Canvas”。
3. 如需调用本地后端，在开发者工具的“本地设置 > 不校验合法域名”启用后即可直接访问 `http://localhost:3000`。
4. 体验流程：
   - 登录页授权手机号（真实环境会返回手机号/加密 code）。
   - 主页选择优惠券模板点击“生成”，即可看到二维码图片。
   - 点击“前往核销”进入核销页，扫码或手动输入核销码完成核销。

### 3) Web 后台（示例）
- 启动后端后，访问 `http://localhost:3000` 即可打开管理页：
  - **用户列表**：按手机号搜索或直接浏览用户，并跳转查看/发放。
  - **通用优惠券**：在列表页点击“创建通用优惠券”进入独立创建页，填写名称、品牌、金额、最低消费、有效期时长、类型，自动生成 6 位 ID（从 100000 起），支持下架/上架、复制、修改。
  - **优惠券发放**：按手机号检索用户，选择通用券输入发放数量，生成实际优惠券，优惠券 ID 形如 `通用券ID_00000`（序号从 10000 起）。
  - **优惠券列表**：查看所有实际券（ID、名称、用户 ID、手机号、有效期时长、可用门店、状态）。

## API 摘要
- `POST /api/login`：`{ phone }` → `{ customerId, phone }`
- `GET /api/customers[?phone=xxx]`：返回用户及已发券/已核销数量，可按手机号模糊搜索。
- `GET /api/coupons?customerId=xxx`：返回该客户全部优惠券。
- `POST /api/coupons`：`{ customerId, templateId }` 生成优惠券。
- `POST /api/coupons/verify`：`{ customerId, code }` 核销优惠券。
- `GET /api/general-coupons[?query=xxx]`：查询通用优惠券模板。
- `POST /api/general-coupons` / `PUT /api/general-coupons/:id`：创建或修改通用券。
- `POST /api/general-coupons/:id/down` / `POST /api/general-coupons/:id/duplicate`：下架或复制通用券。
- `POST /api/issue-coupons`：`{ customerId|phone, templateId, quantity }` 将通用券发放为实际优惠券，实际券 ID 由通用券 6 位 ID 与 5 位流水号组成。

## 目录结构
- `pages/`：小程序前端页面（登录、主页、核销）。
- `utils/qrcode.js`：二维码绘制工具。
- `server/`：Node.js + SQLite 后端与 Web 演示页。

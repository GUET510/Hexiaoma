# 优惠券核销小程序 + 后端

面向真实环境的微信小程序示例，包含手机号授权登录、优惠券核销码生成/核销，以及 Node.js + SQLite 的后端与简易 Web 演示页。

## 功能概览
- 手机号授权登录，后端生成并返回 `customerId`。
- 选择优惠券模板（200 元优惠券、500 元油卡券、300 元保养券）并生成唯一核销码，前端同步绘制真实二维码图片。
- 列表展示全部优惠券状态，支持扫码或手动输入核销码后回写数据库。
- 后端使用 SQLite 持久化客户与核销码数据，并提供 Web 端查看/核销示例页。

## 启动步骤
### 1) 后端服务
```bash
cd server
npm install
npm start  # 默认 http://localhost:3000
```
- SQLite 数据库存放在 `server/data/hexiaoma.sqlite`，启动时自动创建表。
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
- 启动后端后，访问 `http://localhost:3000` 即可打开简单的管理页：
  - 填写登录返回的 `customerId`，选择模板生成优惠券。
  - 查看该客户的优惠券列表并手动核销。

## API 摘要
- `POST /api/login`：`{ phone }` → `{ customerId, phone }`
- `GET /api/coupons?customerId=xxx`：返回该客户全部优惠券。
- `POST /api/coupons`：`{ customerId, templateId }` 生成优惠券。
- `POST /api/coupons/verify`：`{ customerId, code }` 核销优惠券。

## 目录结构
- `pages/`：小程序前端页面（登录、主页、核销）。
- `utils/qrcode.js`：二维码绘制工具。
- `server/`：Node.js + SQLite 后端与 Web 演示页。

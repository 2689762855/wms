# 库存管理系统 (WMS)

全栈仓库管理系统，支持多仓库、多库位、批次管理、调拨审批、移动端扫码操作。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Ant Design 6 + Recharts + Vite 8 |
| 后端 | Express 5 + Prisma 5 + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| 移动端 | Capacitor 8 (Android) |
| 认证 | JWT 双密钥 (admin + customer) |

## 功能

### 桌面端
- **仪表盘** — 库存概览、出入库趋势、预警统计
- **仓库管理** — 多仓库、库位管理、二维码生成
- **商品管理** — SKU、分类树、安全库存、规格型号
- **入库管理** — 采购入库、生产入库、批次追踪
- **出库管理** — 销售出库、领料出库
- **调拨管理** — 仓库间调拨、审批流 (draft→pending→approved/rejected)
- **盘点管理** — 盘点任务、子任务分配、异常审核、移动端协同
- **库存预警** — 按仓库×商品维度，低于安全库存自动预警
- **统计报表** — 出入库报表、周转率分析
- **用户管理** — 三级角色 (super_admin / warehouse_admin / operator)
- **客户管理** — 客户账号、公开库存查询

### 移动端 (5 个底部 Tab)
- 入库 / 出库 / 盘点 / 库存转移 / 库存查询
- 条码 / 二维码扫码
- 库位扫码定位

### 客户查询端
- 独立登录，受限库存查询

## 快速启动

```bash
# 1. 安装依赖
cd server && npm install && npx prisma generate && cd ..
cd client && npm install && cd ..

# 2. 初始化数据库 + 种子数据
cd server
npx prisma migrate dev --name init
npx tsx src/seed.ts
cd ..

# 3. 启动后端 (端口 3001)
cd server && npm run dev &

# 4. 启动前端 (端口 5173)
cd client && npx vite --host
```

默认管理员: `admin` / `admin123`

## 生产部署

```bash
# 设置环境变量
cp server/.env.example server/.env
# 编辑 server/.env，修改 JWT 密钥

# 构建前端
cd client && npm run build

# 部署 server 目录到服务器
# Express 直接托管 client/dist 静态文件
```

详见 [CLAUDE.md](./CLAUDE.md)

## 项目结构

```
├── server/                # Express 5 后端
│   ├── prisma/            # 数据模型 + 迁移
│   ├── src/
│   │   ├── routes/        # API 路由 (17 个模块)
│   │   ├── middleware/     # 认证、权限、错误处理
│   │   ├── utils/         # 工具函数 (序号生成等)
│   │   ├── seed.ts        # 开发种子数据
│   │   └── initProd.ts     # 生产环境初始化
│   └── client/dist/       # 前端构建产物 (部署时)
├── client/                # React 18 前端
│   ├── src/
│   │   ├── pages/         # 桌面端页面 (25 个)
│   │   ├── pages/mobile/  # 移动端页面
│   │   ├── components/    # 共享组件
│   │   ├── stores/        # 状态管理
│   │   └── api/           # HTTP 客户端
│   └── android/           # Capacitor Android
├── scripts/               # 部署打包脚本
└── docs/                  # 文档
```

## API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/auth/login | 管理员登录 |
| GET | /api/auth/me | 当前用户信息 |
| GET/POST | /api/warehouses | 仓库管理 |
| GET/POST | /api/products | 商品管理 |
| GET/POST | /api/inbound | 入库单 |
| GET/POST | /api/outbound | 出库单 |
| GET/POST | /api/transfer | 调拨单 |
| PUT | /api/transfer/:id/approve | 审批调拨 |
| GET/POST | /api/check-tasks | 盘点任务 |
| GET | /api/alerts | 库存预警 |
| POST | /api/stock-move | 库位间转移 |
| GET/POST | /api/customers | 客户管理 |
| POST | /api/public/login | 客户登录 |
| GET | /api/public/inventory | 公开库存 |

## License

MIT

# 库存管理系统 (WMS)

全栈仓库管理系统，React 18 + Ant Design 6 + Express 5 + Prisma 5 + SQLite + Capacitor Android。

## 启动

```bash
# 终端1：后端
cd server
npm run dev     # → localhost:3001

# 终端2：前端
cd client
npx vite --host # → localhost:5173 (内网: 192.168.31.225:5173)
```

默认账号：`admin` / `admin123`

## 项目结构

```
├── server/              # Express 5 后端 (端口 3001)
│   ├── prisma/          # Schema + 迁移
│   ├── src/
│   │   ├── routes/      # API 路由
│   │   ├── middleware/   # auth, errorHandler
│   │   ├── utils/       # prisma 实例
│   │   ├── seed.ts      # 数据初始化
│   │   └── resetPassword.ts  # 紧急密码重置
│   └── client/dist/     # 部署时托管前端（仅 deploy 包）
├── client/              # React 18 前端 (端口 5173)
│   ├── src/
│   │   ├── pages/       # 桌面端页面
│   │   ├── pages/mobile/ # 移动端页面
│   │   ├── components/  # 共享组件
│   │   ├── stores/      # AuthContext, CustomerAuthContext
│   │   ├── api/         # axios 客户端
│   │   └── utils/       # categoryTree 等工具
│   ├── android/         # Capacitor Android 项目
│   └── capacitor.config.ts
├── deploy/              # 免安装部署包
│   ├── start.bat        # 一键启动
│   └── server/          # 后端 + 前端静态文件
└── scripts/deploy.js    # 打包脚本
```

## 双端架构

- **桌面端** `/`：完整管理（仪表盘/仓库/商品/库存/出入库/调拨/盘点/预警/报表/用户/客户管理）
- **移动端** `/m`：5 个底部 Tab（入库/出库/盘点/转移/库存）+ 各自详情页
- **客户查询** `/stock`：独立登录，受限库存查看

## 关键 API

| Method | Path | 说明 |
|--------|------|------|
| POST | /api/stock-move | 库位间库存转移 |
| GET | /api/locations/code/:code | 扫码查库位 |
| GET | /api/locations/:id/inventory | 库位库存 |
| GET/POST | /api/customers | 客户管理 |
| POST | /api/public/login | 客户登录 |
| GET | /api/public/inventory | 公开库存查询 |

## JWT 双密钥

- Admin: `JWT_ADMIN_SECRET`（env）→ `authenticate` 中间件
- Customer: `JWT_CUSTOMER_SECRET`（env）→ `customerAuth` 中间件
- 开发环境使用静态 fallback，**生产务必设置环境变量**

## 数据库

SQLite (`server/prisma/dev.db`)，通过 Prisma ORM 操作。

- `npx prisma migrate reset --force` → 重建数据库
- `npx tsx src/seed.ts` → 初始化数据
- `npx tsx src/resetPassword.ts` → 重置管理员密码

## APK 构建

```bash
cd client
npx vite build && npx cap sync android
cd android
export ANDROID_HOME="E:/android-sdk"
export JAVA_HOME="E:/java21/jdk21"
./gradlew assembleDebug
# 输出: android/app/build/outputs/apk/debug/app-debug.apk
```

APK 使用 `server.url` 加载 Vite 开发服务器实现热更新。原生扫码用 `@capacitor-community/barcode-scanner`。

## 注意事项

- Express 5 不支持 `app.get('*')`，SPA fallback 用 `app.use()`
- 前端开发服务器使用 HTTP（APK `getUserMedia` 限制）
- Vite 代理仅转发 `localhost:3001`
- 生产部署需设置环境变量 `JWT_ADMIN_SECRET`、`JWT_CUSTOMER_SECRET`

## Wiki 知识库

修改代码前，先检索 Wiki（`E:\claude\my-wiki\wiki\`）中相关的踩坑记录和决策日志，避免重复排查已记录的问题。重点关注：
- `wiki/synthesis/库存管理系统开发总结.md` — 踩坑记录
- `wiki/synthesis/技术选型决策日志.md` — 技术决策 + 可复用模式
- `wiki/Changelog.md` — 历次操作记录

**知识复利闭环**：每次解决新的 WMS 问题或做出技术决策后，同步更新 Wiki：
- 新踩坑 → 追加到 `库存管理系统开发总结.md` 的踩坑记录
- 新技术取舍 → 追加到 `技术选型决策日志.md` 的决策记录
- 所有操作 → 追加到 `Changelog.md`

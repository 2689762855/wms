# 库存管理系统 (WMS)

> React 18 + Ant Design 6 + Express 5 + Prisma 5 + SQLite。云端多租户 + 单机版 v2.3.2。

## ⚠️ 收到 WMS 任务 → 先执行这 3 步（不是可选项）

```
第 1 步：grep 知识库（找现成答案）
  grep -i "<关键词>" E:\claude\my-wiki\wiki\synthesis\WMS 踩坑速查.md
  命中 → 直接用现成方案。未命中 → 继续。

第 2 步：读代码地图（理解影响范围）
  Read E:\claude\my-wiki\wiki\synthesis\WMS 代码地图.md
  定位模块 → 看写入链路 → 看下游读取 → 看踩坑记录。

第 3 步：跑反模式检查（5 大根因）
  根据改动类型跑对应的 grep 命令（见底部「反模式自动检查」）。
```

**这 3 步做完才能开始写代码。跳过任一步 = 重复踩坑。**

## AI 行为准则

### 1. 编码前思考
**不要假设。不要隐藏困惑。呈现权衡。**

- 明确说明假设 — 如果不确定，询问而不是猜测
- 呈现多种解释 — 当存在歧义时，不要默默选择
- 适时提出异议 — 如果存在更简单的方法，说出来
- 困惑时停下来 — 指出不清楚的地方并要求澄清

### 2. 简洁优先
**用最少的代码解决问题。不要过度推测。**

- 不要添加要求之外的功能
- 不要为一次性代码创建抽象
- 不要添加未要求的"灵活性"或"可配置性"
- 不要为不可能发生的场景做错误处理
- 如果 200 行代码可以写成 50 行，重写它
- 检验标准：资深工程师会觉得这过于复杂吗？如果是，简化。

### 3. 精准修改
**只碰必须碰的。只清理自己造成的混乱。**

- 不要"改进"相邻的代码、注释或格式
- 不要重构没坏的东西
- 匹配现有风格，即使你更倾向于不同的写法
- 如果注意到无关的死代码，提一下 — 不要删除它
- 删除因你的改动而变得无用的导入/变量/函数
- 检验标准：每一行修改都应该能直接追溯到用户的请求。

### 4. 目标驱动执行
**定义成功标准。循环验证直到达成。**

- "添加验证" → "为无效输入编写测试，然后让它们通过"
- "修复 bug" → "编写重现 bug 的测试，然后让它通过"
- "重构 X" → "确保重构前后测试都能通过"
- 多步骤任务先列计划：步骤 → 验证方法

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

**每次构建前必须检查：**
1. `client/android/app/build.gradle` — `versionCode` 和 `versionName` 是否已更新
2. `server/apk/version.json` — 版本号是否与 build.gradle 一致
3. `cap sync` 不会自动更新版本号，必须手动改

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

## 编码规范

> 以下规范源自 2026-06-03 全量代码审计（6 轮、18 个 bug 的共性模式总结）。违反任一条都可能引入 bug。

### 数据查询

1. **禁止硬编码 `batchNo: null`**。批次追踪已上线，库存查询不应假设批次为空。用 `quantity: { gt: 0 }` 替代。新增库存查询时先想清楚：这个场景是否需要区分批次？
2. **所有无分页的集合查询必须设 `take` 上限**。`include: { inventories: {...} }` 不加 limit 会 OOM。前端 `pageSize: 9999` 是临时开发值，禁止写入提交。
3. **列表数据筛选和 total 计数必须用相同逻辑**。如果过滤条件涉及多表（如甩柜退回扣减），两边的查询条件要完全一致。

### 事务与日志

4. **事务内日志的 before/after 必须在数据变更前获取**。`aggregate` 放到循环外，一次算完，所有日志条目共用。循环内 aggregate 会读到中间状态。
5. **批量数据操作必须用 `$transaction`**。deleteMany/updateMany 逐个执行中途失败不留半清空状态。
6. **upsert 必须有有效唯一键**。没有唯一键时用 `findFirst` → 不存在则 `create`。禁止 `where: { id: -1 }` 这种 hack。

### 级联与清理

7. **新增关联表后检查清理脚本是否遗漏**。`cleanup.ts`、`seed.ts`、`migrateTenants.ts` 三个脚本的删除列表要和新表保持同步。外键约束不会报错提醒你——它只会静默阻止删除。
8. **脚本通配符用最宽匹配**。`backup.sh` 的 `gzip wms-*.db` 漏掉了手动备份。清理/备份脚本的路径匹配宁可多匹不可漏匹。

### 安全

9. **raw SQL 的参数部分永远用 `?` 占位符**。即使是来自 JWT 的"可信"值，也不要用 `${}` 模板拼接。
10. **创建和查询必须用相同的归属条件**。`createdById: null` 创建、`createdById: req.userId` 查询 → 条件不匹配导致限制失效。

### 错误提示

11. **错误信息要能定位问题**。`'库存不足'` 不能区分"真的缺货"还是"批次被锁定"。出错时把关键状态（被跳过的批次号、剩余需求量、当前库存量）带出来。

---

## 注意事项

- Express 5 不支持 `app.get('*')`，SPA fallback 用 `app.use()`
- 前端开发服务器使用 HTTP（APK `getUserMedia` 限制）
- Vite 代理仅转发 `localhost:3001`
- 生产部署需设置环境变量 `JWT_ADMIN_SECRET`、`JWT_CUSTOMER_SECRET`

## 反模式自动检查

> 每次修改 WMS 代码前，用以下命令扫描目标文件。覆盖 5 大根因。

```bash
# === 根因 1：假设不验证 ===
# 1. batchNo: null 硬编码（已出现 4 次）
grep -n "batchNo: null\|batchNo:null" <目标文件>

# 2. findUnique/upsert 对照 schema（已出现 3 次）
grep -n "findUnique\|upsert" <目标文件>

# 3. super_admin 遗漏 warehouse_admin（已出现 3 次）
grep -n "super_admin" <目标文件>
# → 每处确认是否需要加 || req.userRole === 'warehouse_admin'

# 4. 可选链后方法调用（?.filter().map() 模式）
grep -n "?\.filter\|?\.map\|?\.reduce" <目标文件>

# 5. aggregate 在 update 之后
grep -n "aggregate" <目标文件>
# → 确认 aggregate 是否在 update/decrement/increment 之前

# === 根因 2：错误静默吞掉 ===
# 6. catch 块是否只吞不报（排除测试文件）
grep -n "catch\s*{" <目标文件> | grep -v "\.test\."
# → 每个 catch 至少要打一行 console.error，不能只写注释

# 7. mutation 缺 onError（前端）
grep -n "useMutation" <目标文件>
# → 确认有 onError: (err) => message.error(err?.response?.data?.error)

# === 根因 3：改一半，链不全 ===
# 8. 新增 Schema 字段后检查全链路
# → JWT sign → middleware 解析 → 前端 AuthContext → 路由守卫 → UI 组件

# === 根因 4：编码/平台差异 ===
# 9. ESM 下 require/__dirname
grep -n "require\|__dirname" <目标文件>
# → ESM 项目必须用 createRequire + import.meta.url

# === 根因 5：测试滞后 ===
# → 改完后跑: npx vitest run（关键路径必须有 API 级集成测试）
```

## ⚠️ 单机版修改规则（每次必读）

> 单机版和云端版有 4 个核心文件完全不同。**禁止整文件复制**。每次改单机版前：1) 先读 `WMS-Package-v2.3/CLAUDE.md` 2) 读目标原版文件 3) 匹配风格，只插入逻辑。

## 部署前检查（单机版）

每次打包单机版前，逐项确认：

- [ ] `start.bat` 编码为 GBK（`file` 命令显示 ISO-8859，非 UTF-8）
- [ ] `nodejs/` 目录包含便携 Node.js v18（与 better-sqlite3 ABI 匹配）
- [ ] `VITE_STANDALONE=true` 构建（禁用 SW、隐藏云端菜单）
- [ ] `client/dist/sw.js` 已删除（单机版不需要 Service Worker）
- [ ] `client/dist/landing.html` 指向最新版本号和正确的 zip 文件名
- [ ] 版本号已更新：`v2.3.x · 约 113MB`（落地页两处）

## Wiki 知识库

改代码前检索 Wiki（`E:\claude\my-wiki\wiki\`），改后更新。核心三页：
- `wiki/synthesis/WMS 踩坑速查.md` — **先看这个**，32 条，按操作类型索引
- `wiki/synthesis/WMS 代码地图.md` — 功能模块定位 + 数据链路 + grep 命令
- `wiki/concepts/WMS 反模式清单.md` — 7 个高频反模式 + 排查命令
- `wiki/synthesis/技术选型决策日志.md` — 25 条可复用模式

**知识复利闭环**：改代码前先查 → 改后归因更新：
- 新踩坑 → 追加到 `WMS 踩坑速查.md`，归入 5 大根因之一
- 新反模式 → 追加到 `WMS 反模式清单.md`（含 grep 命令）
- 代码链路变化 → 更新 `WMS 代码地图.md`
- Changelog 只记一周内的操作，旧的自动归档

## Git 工作流

- 私有仓库：`git@gitee.com:fjm_grkj_kyzz/wms-platform.git`（remote: `platform`）
- **大修改前必须先存档**：`git add -A && git commit -m "改xxx之前的存档" && git push platform master`
- 改坏回退：`git reset --hard <commit-hash>`
- 服务器部署：本地改源码 → `scp` 到 `root@69.165.75.127:/opt/wms/server/`
- APK 更新：构建后 cp 到 `server/apk/`，更新 `version.json`，scp 到服务器

## 营销落地页

- `server/landing.html` 是根路径 `/` 的静态营销页，独立于 React 应用
- 部署时需手动复制：`cp server/landing.html client/dist/landing.html`
- 手机端显示 APK 下载入口（JS 检测非 Capacitor + 屏幕 ≤640px）

#!/bin/bash
set -e

echo
echo "  ╔══════════════════════════════════╗"
echo "  ║     库存管理系统 (WMS)            ║"
echo "  ║     v1.0 - 一键启动              ║"
echo "  ╚══════════════════════════════════╝"
echo

cd "$(dirname "$0")/server"

# 检查 Node.js
if ! command -v node &>/dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js 18+"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    exit 1
fi

echo "[信息] Node.js 版本: $(node -v)"

# 生产环境密钥（持久化到 .env 文件）
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo "[信息] 首次运行，生成安全密钥..."
    cat > "$ENV_FILE" << ENVEOF
NODE_ENV=production
JWT_ADMIN_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_CUSTOMER_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENVEOF
    chmod 600 "$ENV_FILE"
    echo "[信息] 密钥已保存到 $ENV_FILE"
fi

# 加载环境变量
export $(grep -v '^#' "$ENV_FILE" | xargs)

# 安装依赖（首次运行）
if [ ! -d "node_modules" ]; then
    echo "[信息] 首次运行，正在安装依赖..."
    npm install --omit=dev
fi

# 生成 Prisma + 迁移
echo "[信息] 初始化数据库..."

# 清理上次异常关机遗留的 WAL/SHM 文件
# 删除后 SQLite 会自动创建干净的 WAL，恢复为上一次 checkpoint 的稳定状态
if [ -f "prisma/dev.db-wal" ]; then
    echo "[信息] 检测到上次异常关机，正在自动修复..."
    rm -f prisma/dev.db-wal
fi
rm -f prisma/dev.db-shm

# 检查是否首次运行
FIRST_RUN=false
if [ ! -f "prisma/dev.db" ]; then
    FIRST_RUN=true
fi

npx -y prisma generate
npx -y prisma migrate deploy

# 首次运行：初始化管理员账号
if [ "$FIRST_RUN" = true ]; then
    echo "[信息] 首次运行，初始化管理员账号..."
    npx -y tsx src/initProd.ts || echo "[警告] 初始化失败，可手动运行: npx -y tsx src/initProd.ts"
fi

echo
echo "  ╔══════════════════════════════════╗"
echo "  ║     启动成功！                    ║"
echo "  ╚══════════════════════════════════╝"
echo
echo "  网页端: http://localhost:3001"
echo "  移动端: http://你的IP:3001"
echo
echo "  按 Ctrl+C 停止服务"
echo

exec npx -y tsx src/app.ts

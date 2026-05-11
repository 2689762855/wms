// 打包部署脚本：将前端和后端打包到 WMS-Package/ 目录
// 用法: node scripts/deploy.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const deployDirName = 'WMS-Package';
const deployDir = path.join(root, deployDirName);
const serverDir = path.join(deployDir, 'server');

console.log('=== 库存管理系统 - 部署打包 ===\n');

// 1. 构建前端
console.log('[1/4] 构建前端...');
execSync('npx vite build', { cwd: path.join(root, 'client'), stdio: 'inherit' });

// 2. 清理并创建部署目录
console.log('[2/4] 准备部署目录...');
if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true, force: true });
}
fs.mkdirSync(deployDir, { recursive: true });

const copyDir = (src, dest, exclude = []) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

// 3. 复制服务端代码
console.log('[3/4] 复制服务端...');
copyDir(path.join(root, 'server'), serverDir, ['node_modules', 'dist', '.git', '.prisma', 'dev.db']);
// 复制 apk 目录到部署包
const apkSrc = path.join(root, 'server', 'apk');
if (fs.existsSync(apkSrc)) {
  copyDir(apkSrc, path.join(serverDir, 'apk'));
}
// 复制前端构建产物到 server/client/dist
const clientDist = path.join(serverDir, 'client', 'dist');
fs.mkdirSync(clientDist, { recursive: true });
copyDir(path.join(root, 'client', 'dist'), clientDist);

// 4. 服务端 type=module（tsx 需要）
const pkgPath = path.join(serverDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
pkg.type = 'module';
delete pkg.devDependencies; // 部署包不需要 dev 依赖
delete pkg.scripts;
pkg.scripts = { start: 'npx tsx src/app.ts', postinstall: 'npx prisma generate' };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

// 5. 创建启动和卸载脚本
console.log('[4/4] 创建脚本和文档...');

// 创建 start.bat
const startBat = `@echo off
title 库存管理系统

echo.
echo  ============================================
echo      库存管理系统 (WMS)
echo      v1.0 - 一键启动
echo  ============================================
echo.

cd /d "%~dp0server"

:: 检查并清理占用 3001 端口的旧进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo [信息] 发现旧进程 PID: %%a，正在清理...
    taskkill /F /PID %%a >nul 2>nul
)

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [信息] Node.js 版本: %NODE_VERSION%

:: 安装依赖（首次运行）
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        echo.
        pause
        exit /b 1
    )
    echo [信息] 依赖安装完成
)

:: 生产环境密钥（首次运行自动生成）
if not exist ".env" (
    echo [信息] 首次运行，生成安全密钥...
    (
        echo NODE_ENV=production
        echo JWT_ADMIN_SECRET=%random%%random%%random%%random%%random%%random%
        echo JWT_CUSTOMER_SECRET=%random%%random%%random%%random%%random%%random%
    ) > .env
    echo [信息] 密钥已保存到 .env
)

:: 加载环境变量
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "%%a=%%b"
)

:: 生成 Prisma Client
echo [信息] 初始化数据库...

:: 检查是否首次运行（数据库文件不存在）
set "FIRST_RUN="
if not exist "prisma\\dev.db" set "FIRST_RUN=1"

call npx prisma generate
if %errorlevel% neq 0 (
    echo [错误] Prisma 生成失败
    echo.
    pause
    exit /b 1
)

call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo [错误] 数据库迁移失败
    echo.
    pause
    exit /b 1
)

:: 首次运行：初始化管理员账号
if defined FIRST_RUN (
    echo [信息] 首次运行，初始化管理员账号...
    call npx tsx src/initProd.ts
    if %errorlevel% neq 0 (
        echo [警告] 初始化失败，可手动运行: npx tsx src/initProd.ts
    )
)

:: 启动服务
echo.
echo  ============================================
echo      启动成功！
echo  ============================================
echo.
echo  网页端: http://localhost:3001
echo  移动端: http://你的IP:3001
echo.
echo  按 Ctrl+C 停止服务
echo.

npx tsx src/app.ts

echo.
echo  服务已停止
pause
`;

// 创建 start.sh
const startSh = `#!/bin/bash
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

# 检查是否首次运行
FIRST_RUN=false
if [ ! -f "prisma/dev.db" ]; then
    FIRST_RUN=true
fi

npx prisma generate
npx prisma migrate deploy

# 首次运行：初始化管理员账号
if [ "$FIRST_RUN" = true ]; then
    echo "[信息] 首次运行，初始化管理员账号..."
    npx tsx src/initProd.ts || echo "[警告] 初始化失败，可手动运行: npx tsx src/initProd.ts"
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

exec npx tsx src/app.ts
`;

// 创建 uninstall.bat
const uninstallBat = `@echo off
title 库存管理系统 - 卸载

echo.
echo  ============================================
echo      库存管理系统 (WMS)
echo      一键卸载
echo  ============================================
echo.

:: 确认卸载
echo  警告：此操作将删除以下内容：
echo.
echo    - 数据库文件（所有业务数据）
echo    - 配置文件（.env）
echo    - 依赖包（node_modules）
echo    - 日志文件
echo.
echo  注意：程序文件本身不会被删除，如需完全删除请手动操作。
echo.

set /p confirm=确定要卸载吗？(Y/N):
if /i not "%confirm%"=="Y" (
    echo 已取消卸载。
    pause
    exit /b 0
)

echo.
echo [1/4] 停止服务...

:: 查找并终止 Node.js 进程
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %errorlevel% equ 0 (
    echo   正在停止 Node.js 进程...
    taskkill /F /IM node.exe >nul 2>&1
    timeout /t 2 >nul
    echo   服务已停止。
) else (
    echo   服务未在运行。
)

echo [2/4] 删除数据库文件...
cd /d "%~dp0server"
if exist "prisma\\dev.db" (
    del /f /q "prisma\\dev.db"
    echo   数据库已删除。
) else (
    echo   数据库文件不存在。
)

:: 删除数据库备份
if exist "prisma\\dev.db-journal" (
    del /f /q "prisma\\dev.db-journal"
)

echo [3/4] 删除配置文件...
if exist ".env" (
    del /f /q ".env"
    echo   配置文件已删除。
) else (
    echo   配置文件不存在。
)

echo [4/4] 删除依赖包...
if exist "node_modules" (
    rmdir /s /q "node_modules"
    echo   依赖包已删除。
) else (
    echo   依赖包目录不存在。
)

:: 删除 Prisma 生成文件
if exist "node_modules\\.prisma" (
    rmdir /s /q "node_modules\\.prisma"
)

echo.
echo  ============================================
echo      卸载完成！
echo  ============================================
echo.
echo  已删除内容：
echo    ✓ 数据库文件
echo    ✓ 配置文件
echo    ✓ 依赖包
echo.
echo  如需重新安装，双击 start.bat 即可。
echo  如需完全删除，请手动删除整个文件夹。
echo.

pause
`;

// 创建 uninstall.sh
const uninstallSh = `#!/bin/bash
set -e

echo
echo "  ╔══════════════════════════════════╗"
echo "  ║     库存管理系统 (WMS)            ║"
echo "  ║     一键卸载                      ║"
echo "  ╚══════════════════════════════════╝"
echo

# 确认卸载
echo "  警告：此操作将删除以下内容："
echo
echo "    - 数据库文件（所有业务数据）"
echo "    - 配置文件（.env）"
echo "    - 依赖包（node_modules）"
echo "    - 日志文件"
echo
echo "  注意：程序文件本身不会被删除，如需完全删除请手动操作。"
echo

read -p "确定要卸载吗？(y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "已取消卸载。"
    exit 0
fi

echo
echo "[1/4] 停止服务..."

# 停止 systemd 服务（如果存在）
if command -v systemctl &>/dev/null && systemctl is-active --quiet wms 2>/dev/null; then
    echo "  正在停止 wms 服务..."
    sudo systemctl stop wms 2>/dev/null || true
    sudo systemctl disable wms 2>/dev/null || true
    echo "  服务已停止。"
fi

# 终止相关进程
pids=$(pgrep -f "tsx src/app.ts" 2>/dev/null || true)
if [ -n "$pids" ]; then
    echo "  正在终止进程..."
    kill $pids 2>/dev/null || true
    sleep 2
    echo "  进程已终止。"
else
    echo "  服务未在运行。"
fi

cd "$(dirname "$0")/server"

echo "[2/4] 删除数据库文件..."
if [ -f "prisma/dev.db" ]; then
    rm -f "prisma/dev.db"
    echo "  数据库已删除。"
else
    echo "  数据库文件不存在。"
fi

# 删除数据库日志
rm -f "prisma/dev.db-journal" 2>/dev/null || true

echo "[3/4] 删除配置文件..."
if [ -f ".env" ]; then
    rm -f ".env"
    echo "  配置文件已删除。"
else
    echo "  配置文件不存在。"
fi

echo "[4/4] 删除依赖包..."
if [ -d "node_modules" ]; then
    rm -rf "node_modules"
    echo "  依赖包已删除。"
else
    echo "  依赖包目录不存在。"
fi

echo
echo "  ╔══════════════════════════════════╗"
echo "  ║     卸载完成！                    ║"
echo "  ╚══════════════════════════════════╝"
echo
echo "  已删除内容："
echo "    ✓ 数据库文件"
echo "    ✓ 配置文件"
echo "    ✓ 依赖包"
echo
echo "  如需重新安装，运行 ./start.sh 即可。"
echo "  如需完全删除，请手动删除整个文件夹。"
echo
`;

// 写入脚本文件（.bat 文件需要 GBK 编码才能在 Windows cmd 中正确显示中文）
fs.writeFileSync(path.join(deployDir, 'start.bat'), startBat, 'utf-8');
fs.writeFileSync(path.join(deployDir, 'start.sh'), startSh);
fs.writeFileSync(path.join(deployDir, 'uninstall.bat'), uninstallBat, 'utf-8');
fs.writeFileSync(path.join(deployDir, 'uninstall.sh'), uninstallSh);

// 将 .bat 文件从 UTF-8 转换为 GBK 编码（Windows 批处理文件必须用系统默认编码）
try {
  const gbk = require('iconv-lite');
  const batFiles = ['start.bat', 'uninstall.bat'];
  for (const batFile of batFiles) {
    const batPath = path.join(deployDir, batFile);
    const content = fs.readFileSync(batPath, 'utf-8');
    // 先转 CRLF（Windows 换行），再转 GBK 编码
    const contentCRLF = content.replace(/\r?\n/g, '\r\n');
    const buf = gbk.encode(contentCRLF, 'gbk');
    fs.writeFileSync(batPath, buf);
  }
  console.log('批处理文件已转换为 GBK 编码');
} catch (e) {
  console.log('警告: GBK 转换失败，批处理文件可能显示乱码:', e.message);
}

// 复制 LICENSE
const licenseSrc = path.join(root, 'LICENSE');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, path.join(deployDir, 'LICENSE'));
}

console.log('\n=== 部署打包完成! ===');
console.log(`\n部署目录: ${deployDir}`);
console.log('\n提示: 可将 WMS-Deploy 文件夹重命名为 "仓库管理系统部署包"');
console.log('双击 start.bat 即可启动系统');

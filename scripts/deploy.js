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
console.log('[1/5] 构建前端...');
execSync('npx vite build', { cwd: path.join(root, 'client'), stdio: 'inherit' });

// 2. 清理并创建部署目录
console.log('[2/5] 准备部署目录...');
if (fs.existsSync(deployDir)) {
  try {
    fs.rmSync(deployDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  } catch (e) {
    console.log('警告: 无法清理旧目录，将尝试覆盖写入:', e.message);
    // If we can't remove the whole dir, just remove the server subdir
    const oldServer = path.join(deployDir, 'server');
    if (fs.existsSync(oldServer)) {
      try { fs.rmSync(oldServer, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch {}
    }
  }
}
fs.mkdirSync(deployDir, { recursive: true });

// 3. 下载 Node.js Windows 便携版（目标用户无需安装 Node.js）
console.log('[3/5] 准备 Node.js 便携版...');
const nodeVersion = 'v18.16.1';
const nodeZipName = `node-${nodeVersion}-win-x64`;
const nodeZipFile = `${nodeZipName}.zip`;
const nodeUrl = `https://nodejs.org/dist/${nodeVersion}/${nodeZipFile}`;
const cacheDir = path.join(root, 'scripts', '.cache');
const cachedZip = path.join(cacheDir, nodeZipFile);
const nodeDir = path.join(deployDir, 'nodejs');

if (!fs.existsSync(cachedZip)) {
  fs.mkdirSync(cacheDir, { recursive: true });
  console.log(`  下载 Node.js ${nodeVersion} 便携版 (约30MB)...`);
  try {
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${nodeUrl}' -OutFile '${cachedZip}'"`, { stdio: 'inherit', timeout: 120000 });
  } catch (e) {
    console.log('  警告: Node.js 下载失败，部署包将不包含 Node.js 运行时');
    console.log('  用户需自行安装 Node.js: https://nodejs.org');
    try { if (fs.existsSync(cachedZip)) fs.unlinkSync(cachedZip); } catch {}
  }
}

if (fs.existsSync(cachedZip)) {
  console.log('  解压 Node.js 便携版...');
  try {
    if (fs.existsSync(nodeDir)) {
      fs.rmSync(nodeDir, { recursive: true, force: true });
    }
    execSync(`powershell -Command "Expand-Archive -Path '${cachedZip}' -DestinationPath '${deployDir}' -Force"`, { stdio: 'inherit' });
    const extractedDir = path.join(deployDir, nodeZipName);
    if (fs.existsSync(extractedDir)) {
      fs.renameSync(extractedDir, nodeDir);
    }
    console.log(`  Node.js 便携版已就绪: nodejs/`);
  } catch (e) {
    console.log('  警告: Node.js 解压失败，部署包将不包含 Node.js 运行时');
    console.log('  错误:', e.message);
  }
}

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

// 4. 复制服务端代码
console.log('[4/5] 复制服务端...');
copyDir(path.join(root, 'server'), serverDir, ['node_modules', 'dist', '.git', '.prisma', 'dev.db', 'dev.db-journal']);
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
pkg.scripts = { start: 'npx -y tsx src/app.ts', postinstall: 'npx prisma generate' };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

// 4.5 预装依赖（目标用户无需 npm install）
if (fs.existsSync(nodeDir)) {
  console.log('[预装] 安装 Node.js 依赖...');
  const nodeExe = path.join(nodeDir, "node.exe");
  const npmCli = path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
  try {
    // 必须用 node.exe 直接调 npm-cli.js，不能用 npm.cmd
    // npm.cmd 走 cmd.exe 的 Windows PATH，会找到系统装的 Node.js 而不是便携版
    // 同时把便携 Node 目录放到 PATH 最前面，防止 node-gyp 等子进程调用系统 Node
    const env = { ...process.env, PATH: nodeDir + path.delimiter + process.env.PATH };

    // 检测 Python（node-gyp 编译原生模块需要）
    const pythonPaths = [
      path.join(process.env.USERPROFILE || '', 'AppData/Roaming/uv/python'),
      path.join(process.env.USERPROFILE || '', 'AppData/Local/Programs/Python'),
      'C:/Program Files/Python', 'C:/Python',
    ];
    for (const base of pythonPaths) {
      if (fs.existsSync(base)) {
        const entries = fs.readdirSync(base, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('cpython-')) {
            env.PATH = path.join(base, entry.name) + path.delimiter + env.PATH;
            console.log(`  找到 Python: ${entry.name}`);
            break;
          }
        }
        if (env.PATH !== nodeDir + path.delimiter + process.env.PATH) break;
      }
    }

    execSync(`"${nodeExe}" "${npmCli}" install --omit=dev`, { cwd: serverDir, stdio: "inherit", timeout: 300000, env });
    console.log('  依赖预装完成（含 better-sqlite3 原生模块）');
  } catch (e) {
    console.log('  警告: 依赖预装失败，用户首次启动时将自动安装');
    console.log('  错误:', e.message);
  }
} else {
  console.log('  跳过依赖预装（Node.js 便携版未就绪）');
}

// 4.6 清理敏感文件（确保每次部署都是干净状态）
console.log('[清理] 移除敏感文件...');
const filesToClean = ['.env', 'prisma/dev.db', 'prisma/dev.db-journal'];
for (const f of filesToClean) {
  const p = path.join(serverDir, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`  已移除: ${f}`);
  }
}

// 5. 创建启动和卸载脚本
console.log('[5/5] 创建脚本和文档...');

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
setlocal enabledelayedexpansion
set "NODE_EXE="
set "NODE_DIR="

:: 方法0：使用自带的 Node.js 便携版（无需安装 Node.js）
if exist "%~dp0nodejs\\node.exe" (
    set "NODE_EXE=%~dp0nodejs\\node.exe"
    set "NODE_DIR=%~dp0nodejs"
    set "PATH=%~dp0nodejs;%PATH%"
)

:: 方法1：直接尝试 node 命令
if "%NODE_EXE%"=="" (
    node --version >nul 2>nul
    if %errorlevel% equ 0 (
        set "NODE_EXE=node"
    )
)

:: 方法2：查 Windows 注册表（能找到任何安装方式的 Node.js）
if "%NODE_EXE%"=="" (
    for /f "tokens=2*" %%a in ('reg query "HKLM\\SOFTWARE\\Node.js" /v InstallPath 2^>nul ^| find "REG_SZ"') do (
        set "NODE_DIR=%%b"
    )
    for /f "tokens=2*" %%a in ('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Node.js" /v InstallPath 2^>nul ^| find "REG_SZ"') do (
        set "NODE_DIR=%%b"
    )
    if defined NODE_DIR if exist "!NODE_DIR!\\node.exe" (
        set "NODE_EXE=!NODE_DIR!\\node.exe"
        set "PATH=!NODE_DIR!;%PATH%"
    )
)

:: 方法3：检查系统安装路径
if "%NODE_EXE%"=="" if exist "C:\\Program Files\\nodejs\\node.exe" set "NODE_EXE=C:\\Program Files\\nodejs\\node.exe"
if "%NODE_EXE%"=="" if exist "C:\\Program Files (x86)\\nodejs\\node.exe" set "NODE_EXE=C:\\Program Files (x86)\\nodejs\\node.exe"

:: 方法4：检查 fnm 版本管理器
if "%NODE_EXE%"=="" (
    for /f "tokens=*" %%v in ('"%USERPROFILE%\\AppData\\Local\\fnm\\aliases\\default\\node.exe" -v 2^>nul') do (
        set "NODE_EXE=%USERPROFILE%\\AppData\\Local\\fnm\\aliases\\default\\node.exe"
    )
)

:: 方法5：检查 nvm-windows
if "%NODE_EXE%"=="" (
    where nvm >nul 2>nul
    if %errorlevel% equ 0 (
        for /f "tokens=*" %%v in ('nvm current 2^>nul') do (
            if exist "%USERPROFILE%\\.nvm\\versions\\node\\%%v\\node.exe" (
                set "NODE_EXE=%USERPROFILE%\\.nvm\\versions\\node\\%%v\\node.exe"
            )
        )
    )
)

if "%NODE_EXE%"=="" (
    echo.
    echo  ============================================
    echo  [错误] 未找到 Node.js
    echo  ============================================
    echo.
    echo  请先安装 Node.js 18 或更高版本:
    echo    https://nodejs.org
    echo.
    echo  安装时请勾选 "Add to PATH"
    echo  安装后请重新打开命令行窗口再试
    echo.
    echo  Error: Node.js not found.
    echo  Install Node.js 18+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('%NODE_EXE% -v') do set NODE_VERSION=%%i
echo [信息] Node.js 版本: %NODE_VERSION%

:: 确保 NODE_EXE 是完整路径（用于定位 npm-cli.js）
if "%NODE_EXE%"=="node" (
    for /f "tokens=*" %%i in ('where node') do set "NODE_EXE=%%i"
)

:: 从 node.exe 位置推导 npm/npx CLI 脚本路径
:: 绕过 npm.cmd/npx.cmd 直接用 node 调 CLI，避免 CALL 创建子 shell 触发 DOSKEY 报错
for %%a in ("%NODE_EXE%") do set "NODE_HOME=%%~dpa"
set "NPM_CLI=%NODE_HOME%node_modules\\npm\\bin\\npm-cli.js"
set "NPX_CLI=%NODE_HOME%node_modules\\npm\\bin\\npx-cli.js"

:: 将 node 所在目录加入 PATH（子进程需要）
set "PATH=%NODE_HOME%;%PATH%"

:: 安装依赖（首次运行）
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    "%NODE_EXE%" "%NPM_CLI%" install --omit=dev
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

"%NODE_EXE%" "%NPX_CLI%" -y prisma generate
if %errorlevel% neq 0 (
    echo [错误] Prisma 生成失败
    echo.
    pause
    exit /b 1
)

"%NODE_EXE%" "%NPX_CLI%" -y prisma migrate deploy
if %errorlevel% neq 0 (
    echo [错误] 数据库迁移失败
    echo.
    pause
    exit /b 1
)

:: 首次运行：初始化管理员账号
if defined FIRST_RUN (
    echo [信息] 首次运行，初始化管理员账号...
    "%NODE_EXE%" "%NPX_CLI%" -y tsx src/initProd.ts
    if %errorlevel% neq 0 (
        echo [警告] 初始化失败，可手动运行: npx -y tsx src/initProd.ts
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

"%NODE_EXE%" "%NPX_CLI%" -y tsx src/app.ts

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
echo.
echo  程序文件和预装依赖不会被删除。
echo  如需完全删除，请手动删除整个文件夹。
echo.

set /p confirm=确定要卸载吗？(Y/N):
if /i not "%confirm%"=="Y" (
    echo 已取消卸载。
    pause
    exit /b 0
)

echo.
echo [1/2] 停止服务...

:: 按端口 3001 精准查找并终止进程（不会影响其他 Node.js 程序）
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo   正在停止服务 PID: %%a...
    taskkill /F /PID %%a >/dev/null 2>/dev/null
)
echo   服务已停止。

echo [2/2] 删除数据...

cd /d "%~dp0server"

:: 删除数据库
if exist "prismadev.db" (
    del /f /q "prismadev.db"
    echo   数据库已删除。
) else (
    echo   数据库文件不存在。
)
if exist "prismadev.db-journal" (
    del /f /q "prismadev.db-journal"
)

:: 删除配置
if exist ".env" (
    del /f /q ".env"
    echo   配置文件已删除。
) else (
    echo   配置文件不存在。
)

echo.
echo  ============================================
echo      卸载完成！
echo  ============================================
echo.
echo  已删除内容：
echo    ✓ 数据库文件
echo    ✓ 配置文件
echo.
echo  预装依赖已保留，如需重新使用双击 start.bat 即可。
echo  如需完全删除，请手动删除整个文件夹。
echo.

pause
`;

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
echo
echo "  程序文件和预装依赖不会被删除。"
echo "  如需完全删除，请手动删除整个文件夹。"
echo

read -p "确定要卸载吗？(y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "已取消卸载。"
    exit 0
fi

echo
echo "[1/2] 停止服务..."

# 按端口 3001 终止进程（不会影响其他 Node.js 程序）
if lsof -ti :3001 >/dev/null 2>&1; then
    echo "  正在终止进程..."
    kill $(lsof -ti :3001) 2>/dev/null || true
    sleep 2
    echo "  服务已停止。"
else
    echo "  服务未在运行。"
fi

cd "$(dirname "$0")/server"

echo "[2/2] 删除数据..."

# 删除数据库
if [ -f "prisma/dev.db" ]; then
    rm -f "prisma/dev.db"
    echo "  数据库已删除。"
else
    echo "  数据库文件不存在。"
fi
rm -f "prisma/dev.db-journal" 2>/dev/null || true

# 删除配置
if [ -f ".env" ]; then
    rm -f ".env"
    echo "  配置文件已删除。"
else
    echo "  配置文件不存在。"
fi

echo
echo "  ╔══════════════════════════════════╗"
echo "  ║     卸载完成！                    ║"
echo "  ╚══════════════════════════════════╝"
echo
echo "  已删除内容："
echo "    ✓ 数据库文件"
echo "    ✓ 配置文件"
echo
echo "  预装依赖已保留，如需重新使用运行 ./start.sh 即可。"
echo "  如需完全删除，请手动删除整个文件夹。"
echo
`;

// 写入脚本文件（.bat 文件需要 GBK 编码才能在 Windows cmd 中正确显示中文）
fs.writeFileSync(path.join(deployDir, 'start.bat'), startBat, 'utf-8');
fs.writeFileSync(path.join(deployDir, 'start.sh'), startSh);
fs.writeFileSync(path.join(deployDir, 'uninstall.bat'), uninstallBat, 'utf-8');
fs.writeFileSync(path.join(deployDir, 'uninstall.sh'), uninstallSh);

// 复制使用说明书（先复制再转码）
const readmeSrc = path.join(root, '使用说明.txt');
if (fs.existsSync(readmeSrc)) {
  fs.copyFileSync(readmeSrc, path.join(deployDir, '使用说明.txt'));
}

// 将 Windows 文本文件从 UTF-8 转换为 GBK 编码（中文 Windows cmd/记事本 兼容）
try {
  const gbk = require('iconv-lite');
  const textFiles = ['start.bat', 'uninstall.bat', '使用说明.txt'];
  for (const file of textFiles) {
    const filePath = path.join(deployDir, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    const contentCRLF = content.replace(/\r?\n/g, '\r\n');
    const buf = gbk.encode(contentCRLF, 'gbk');
    fs.writeFileSync(filePath, buf);
  }
  console.log('文本文件已转换为 GBK 编码');
} catch (e) {
  console.log('警告: GBK 转换失败，文本文件可能显示乱码:', e.message);
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

@echo off
title 库存管理系统

echo.
echo  ============================================
echo      库存管理系统 (WMS)
echo      v1.0 - 一键启动
echo  ============================================
echo.

cd /d "%~dp0server"

:: 检查并清理占用 3001 端口的旧进程
for /f "tokens=5" %%a in ('%SystemRoot%\System32\netstat.exe -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo [信息] 发现旧进程 PID: %%a，正在清理...
    taskkill /F /PID %%a >nul 2>nul
)

:: 检查 Node.js
setlocal enabledelayedexpansion
set "NODE_EXE="
set "NODE_DIR="

:: 方法0：使用自带的 Node.js 便携版（无需安装 Node.js）
if exist "%~dp0nodejs\node.exe" (
    set "NODE_EXE=%~dp0nodejs\node.exe"
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
    for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\Node.js" /v InstallPath 2^>nul ^| find "REG_SZ"') do (
        set "NODE_DIR=%%b"
    )
    for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\WOW6432Node\Node.js" /v InstallPath 2^>nul ^| find "REG_SZ"') do (
        set "NODE_DIR=%%b"
    )
    if defined NODE_DIR if exist "!NODE_DIR!\node.exe" (
        set "NODE_EXE=!NODE_DIR!\node.exe"
        set "PATH=!NODE_DIR!;%PATH%"
    )
)

:: 方法3：检查系统安装路径
if "%NODE_EXE%"=="" if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if "%NODE_EXE%"=="" if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"

:: 方法4：检查 fnm 版本管理器
if "%NODE_EXE%"=="" (
    for /f "tokens=*" %%v in ('"%USERPROFILE%\AppData\Local\fnm\aliases\default\node.exe" -v 2^>nul') do (
        set "NODE_EXE=%USERPROFILE%\AppData\Local\fnm\aliases\default\node.exe"
    )
)

:: 方法5：检查 nvm-windows
if "%NODE_EXE%"=="" (
    where nvm >nul 2>nul
    if %errorlevel% equ 0 (
        for /f "tokens=*" %%v in ('nvm current 2^>nul') do (
            if exist "%USERPROFILE%\.nvm\versions\node\%%v\node.exe" (
                set "NODE_EXE=%USERPROFILE%\.nvm\versions\node\%%v\node.exe"
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
set "NPM_CLI=%NODE_HOME%node_modules\npm\bin\npm-cli.js"
set "NPX_CLI=%NODE_HOME%node_modules\npm\bin\npx-cli.js"

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
if not exist "prisma\dev.db" set "FIRST_RUN=1"

:: 清理上次 Prisma 生成的引擎文件（Windows 文件锁可能导致残留）
if exist "node_modules\.prisma" (
    rd /s /q "node_modules\.prisma" 2>nul
)

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
    "%NODE_EXE%" "%NPX_CLI%" -y tsx src/initProd.ts admin123
    echo.
    echo ============================================
    echo  默认管理员账号: admin / admin123
    echo  首次登录后请立即修改密码！
    echo ============================================
    echo.
    pause
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

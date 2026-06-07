@echo off
title 库存管理系统 - 重置管理员密码

echo.
echo  ============================================
echo      库存管理系统 (WMS)
echo      重置管理员密码
echo  ============================================
echo.

cd /d "%~dp0server"

:: 查找 Node.js
set "NODE_EXE="

:: 方法1：自带的便携版
if exist "%~dp0nodejs\node.exe" (
    set "NODE_EXE=%~dp0nodejs\node.exe"
    set "PATH=%~dp0nodejs;%PATH%"
)

:: 方法2：系统安装的 Node.js
if "%NODE_EXE%"=="" (
    node --version >nul 2>nul
    if %errorlevel% equ 0 set "NODE_EXE=node"
)

:: 方法3：常见安装路径
if "%NODE_EXE%"=="" if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if "%NODE_EXE%"=="" if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"

if "%NODE_EXE%"=="" (
    echo [错误] 未找到 Node.js
    echo 部署包自带 Node.js，请检查 nodejs 文件夹是否被误删。
    pause
    exit /b 1
)

:: 确保完整路径
if "%NODE_EXE%"=="node" (
    for /f "tokens=*" %%i in ('where node') do set "NODE_EXE=%%i"
)

:: 推导 npm/npx CLI 路径
for %%a in ("%NODE_EXE%") do set "NODE_HOME=%%~dpa"
set "NPX_CLI=%NODE_HOME%node_modules\npm\bin\npx-cli.js"

echo [信息] 正在重置管理员密码为 admin123...
echo.

"%NODE_EXE%" "%NPX_CLI%" -y tsx src/resetPassword.ts admin admin123

echo.
echo  ============================================
echo      密码已重置为 admin123
echo  ============================================
echo.
echo  请使用 admin / admin123 登录系统。
echo.

pause

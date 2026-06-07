@echo off
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
for /f "tokens=5" %%a in ('%SystemRoot%\System32\netstat.exe -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo   正在停止服务 PID: %%a...
    taskkill /F /PID %%a >nul 2>nul
)
echo   服务已停止。

echo [2/2] 删除数据...

cd /d "%~dp0server"

:: 删除数据库
if exist "prisma\dev.db" (
    del /f /q "prisma\dev.db"
    echo   数据库已删除。
) else (
    echo   数据库文件不存在。
)
if exist "prisma\dev.db-journal" (
    del /f /q "prisma\dev.db-journal"
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
echo    ? 数据库文件
echo    ? 配置文件
echo.
echo  预装依赖已保留，如需重新使用双击 start.bat 即可。
echo  如需完全删除，请手动删除整个文件夹。
echo.

pause

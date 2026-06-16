@echo off
title WMS 看门狗
setlocal enabledelayedexpansion

set LOG=watchdog.log
set PORT=3001
set INTERVAL=30
set MAX_FAIL=5
set FAIL_COUNT=0

echo [%date% %time%] WMS 看门狗已启动 >> %LOG%

:loop
netstat -ano | findstr :%PORT% | findstr LISTENING >nul
if %errorlevel% equ 0 (
    set FAIL_COUNT=0
) else (
    set /a FAIL_COUNT+=1
    echo [%date% %time%] 端口 %PORT% 无响应 (第 !FAIL_COUNT! 次) >> %LOG%
    if !FAIL_COUNT! geq %MAX_FAIL% (
        echo [%date% %time%] 连续 %MAX_FAIL% 次失败，停止看护 >> %LOG%
        echo.
        echo ============================================
        echo  WMS 连续 %MAX_FAIL% 次启动失败，已停止看护
        echo  请检查日志: %LOG%
        echo ============================================
        echo.
        pause
        exit /b 1
    )
    echo [%date% %time%] 正在重启服务... >> %LOG%
    start "WMS" /MIN "%~dp0start.bat"
    timeout /t 15 /nobreak >nul
)

timeout /t %INTERVAL% /nobreak >nul
goto loop
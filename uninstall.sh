#!/bin/bash
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

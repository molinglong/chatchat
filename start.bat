@echo off
chcp 65001 >nul
echo ========================================
echo        AI Chat 一键启动脚本 (增强版)
echo ========================================

echo [1/4] 检查 Node.js 环境... 
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装，请先安装 Node.js
    pause
    exit /b 1
)
echo ✅ OK

echo [2/4] 检查依赖...
if exist "node_modules" (
    echo ✅ 依赖已安装，跳过安装步骤。
) else (
    echo ⚠️  第一次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
)

echo [3/4] 彻底清理损坏的缓存...
powershell -Command "Start-Sleep -Seconds 1; Remove-Item -Path '.next','dist' -Recurse -Force -ErrorAction SilentlyContinue"
echo ✅ 缓存已清理

echo [4/4] 启动开发服务器...
echo ========================================
echo  服务地址：http://localhost:3000        
echo  按 Ctrl+C 停止服务
echo ========================================
call npm run dev

pause

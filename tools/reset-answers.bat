@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  清理考生作答记录与加密答案归档（治标补丁）
echo ============================================
echo.
echo 提示：运行前请先关闭 EPSE 程序（后端起停脚本即可）
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0reset-answers.ps1"

echo.
echo 详细日志：%~dp0reset-answers.log
pause

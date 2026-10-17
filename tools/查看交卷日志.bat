@echo off
chcp 65001 >nul
set "LOG=%~dp0..\epse\logs\ui-actions.log"
if not exist "%LOG%" (
  echo 还没有日志文件：%LOG%
  echo 请先启动程序、复现一次交卷，再运行本文件。
  pause
  exit /b 0
)
start "" notepad "%LOG%"

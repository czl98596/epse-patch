@echo OFF
chcp 65001 >nul
cd /d "%~dp0"

rem 清理上次作答记录与答案归档（治标补丁）
if exist "%~dp0tools\reset-answers.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\reset-answers.ps1" -Quiet

if exist "%~dp0EpseDesktop\EpseDesktop.exe" (
  start "" "%~dp0EpseDesktop\EpseDesktop.exe"
  exit /b 0
)

cd /d "%~dp0desktop"
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
if not exist "node_modules\electron\package.json" (
  echo First run: installing desktop components...
  call npm install --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo Install failed. Check network and retry.
    pause
    exit /b 1
  )
)

start "" cmd /c "npm start"

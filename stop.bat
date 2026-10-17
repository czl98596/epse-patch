@echo off

chcp 65001

set dir=%~dp0

set nginxDirPath=\epse\nginx-1.22.1
set nginxDir=%dir%%nginxDirPath%


cd /d %nginxDir%

::关闭nginx
taskkill /f /t /im nginx.exe

for /f "usebackq skip=1 tokens=*" %%I in (`wmic process where "name = 'javaw.exe' and commandline like '%%epse-electron-2.0.0.ja%%'" get processid 2^>null`) do (
    echo %%I
    if %%I GTR 1 (
        echo processid is: %%I
        set pid=%%I
        goto break
    )
)

:break

if defined pid (
    echo pid = %pid%
    echo taskkill /f /pid %pid%
    taskkill /f /pid %pid%
    echo Succeeded in killing the process.
) else echo 关闭成功.

::清理作答记录与答案归档（治标补丁）
if exist "%dir%tools\reset-answers.ps1" (
    echo 正在清理作答记录...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%dir%tools\reset-answers.ps1" -Quiet
)


pause
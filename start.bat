@echo OFF

chcp 65001

echo 正在启动中

::基础目录
set "dir=%~dp0"

::epse
set "epseDir=%dir%epse"

::ngix基础目录
set nginxDirPath=epse\nginx-1.22.1

::ngix目录
set "nginxDir=%dir%%nginxDirPath%"
echo nginxDir
::confif基础目录
set "configDir=%epseDir%\config\"

::基础的sql文件路径
set "applicationBaseSqlliteDir=%configDir%application-base-sqllite.yml"

::db路径
set "epseSqlliteDb=%configDir%electron-service.db"
set "adminSqlliteDb=%configDir%admin-service.db"


::修改配置文件
setlocal enabledelayedexpansion
cd.>%configDir%application-sqllite-new.yml
echo 正在替换文件中的字符串。。。
echo.
set "finalEpseSqlliteDb=%epseSqlliteDb:\=/%"
set "finalAdminSqlliteDb=%adminSqlliteDb:\=/%"
for /f "delims=" %%a in (%applicationBaseSqlliteDir%) do (
set str=%%a
set str=!str:${epse-sqllite-db-dir}=%finalEpseSqlliteDb%!
set str=!str:${admin-sqllite-db-dir}=%finalAdminSqlliteDb%!
echo !str!>>%configDir%application-sqllite-new.yml
)
del  %configDir%application-sqllite.yml
rename %configDir%application-sqllite-new.yml application-sqllite.yml
echo 成功替换文件中指定的字符串


cd /d "%nginxDir%"

::关闭nginx
taskkill /f /t /im nginx.exe >nul 2>nul
::开启nginx
start "" /D "%nginxDir%" nginx.exe

cd /d "%epseDir%"

::关闭java（匹配当前 jar 名）
for /f "usebackq skip=1 tokens=*" %%I in (`wmic process where "name = 'javaw.exe' and commandline like '%%epse-electron-2.0.0.jar%%'" get processid 2^>null`) do (
    echo %%I
    if %%I GTR 1 (
        echo processid is: %%I
        set pid=%%I
        goto break
    )
)

:break

if defined pid (
    echo pid = !pid!
    echo taskkill /f /pid !pid!
    taskkill /f /pid !pid!
    echo Succeeded in killing the process.
)

::优先使用文件夹内便携 JRE，不存在则回退系统 Java
set "javaExe=%dir%jre\bin\javaw.exe"
if exist "!javaExe!" (
    echo 使用便携 JRE：%dir%jre
) else (
    echo 未找到便携 JRE：!javaExe!
    echo 将尝试使用系统已安装的 Java...
    set "javaExe=javaw"
)

::清理上次作答记录与答案归档（治标补丁）
if exist "%dir%tools\reset-answers.ps1" (
    echo 正在清理上次作答记录...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%dir%tools\reset-answers.ps1" -Quiet
)

::后台启动java
start "" /D "%epseDir%" "!javaExe!" -jar epse-electron-2.0.0.jar

timeout /nobreak /t 3

echo 启动成功
echo 请在浏览器输入以下网址： http://localhost:10013/#/

start microsoft-edge:http://localhost:10013/#/

pause

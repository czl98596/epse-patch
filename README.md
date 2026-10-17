# EPSE 单机版补丁包

EPSE 单机版（EpseSingleV2.1）交卷相关修复补丁。适用于 **Backup\EpseSingleV2.1 最初原版**，在副本上覆盖安装。

> 仅用于个人学习、研究与自建单机环境调试。

## 修复内容

- 交卷后显示得分结果弹窗
- 结果弹窗可按住顶部标题拖动
- 答题卡彩色显示（正确 / 错误 / 部分得分）
- 可查看错题、考生答案与参考答案
- 修复返回登录再进考试后「确认提交」无反应
- 修复交卷后「操作台」滚动条不能拖动
- 启动 / 关闭时自动清理上次作答记录（沿用单机版练习逻辑）

## 安装方法

1. 先把 `Backup\EpseSingleV2.1` 整个文件夹复制一份，例如复制成 `EpseSingleV2.1_已修复`；
2. 把本仓库全部内容复制到该副本根目录；
3. 提示「目标包含同名文件」时选择替换 / 覆盖；
4. 启动方式任选其一：
   - `EpseDesktop.exe`
   - `OpenEPSE.bat`
   - `start.bat`（用 Edge 打开 `http://localhost:10013/#/`）

默认账号 / 密码：`123456 / 123456`

## 目录结构

```
epse\nginx-1.22.1\dist\index.html
epse\nginx-1.22.1\dist\js\app.491bc689.js
epse\nginx-1.22.1\dist\js\epse-submit-result.js   （新增）
EpseDesktop\resources\app.asar
tools\reset-answers.ps1
tools\reset-answers.mjs
tools\reset-answers.bat
tools\查看交卷日志.bat
tools\交卷修复说明.txt
OpenEPSE.bat
start.bat
stop.bat
```

## 校验

`补丁清单.txt` 内含各文件 SHA256，可用于核对文件完整性。

## 日志

- `epse\logs\ui-actions.log`（Electron 启动时）
- `epse\logs\log_info.log` / `log_error.log`（后端）
- `epse\nginx-1.22.1\logs\access.log`（nginx）

双击 `tools\查看交卷日志.bat` 可查看 `ui-actions.log`。

## 回滚

用 `Backup\EpseSingleV2.1` 原版重新复制一份即可。本补丁不含备份文件，不会覆盖原版文件夹。

详细修复说明见 `tools\交卷修复说明.txt` 和 `使用说明.txt`。

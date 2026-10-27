# EPSE 升级补丁

当前补丁：**patchv2.3.1**，制作于 2026-10-27。将完整的 **EpseSingleV2.1 原版**解压覆盖升级到当前 **EpseSingleV2.3.2-all** 的功能版本。

## 下载

- **[直接下载 patchv2.3.1.zip（344.85 MiB）](https://media.githubusercontent.com/media/czl98596/epse-patch/main/patchv2.3.1.zip)**
- [main 分支中的补丁文件](patchv2.3.1.zip)
- [使用说明](docs/patchv2.3.1/INSTALL.zh-CN.txt)
- [本次验证报告](docs/patchv2.3.1/VALIDATION.zh-CN.md)
- [SHA-256 校验文件](patchv2.3.1.zip.sha256)

补丁 ZIP 文件已放在 `main` 分支，通过 Git LFS 保存。请点击上面的直接下载链接获取完整压缩包；整个仓库的源码压缩包不作为安装包使用。

## 安装

1. 关闭所有 EPSE 窗口和后台，先备份原有 `EpseSingleV2.1` 文件夹。
2. 将 `patchv2.3.1.zip` 解压，把解压得到的**全部内容**拖进原有 `EpseSingleV2.1` 文件夹。
3. 遇到同名文件选择**替换目标中的文件**，不要再套一层补丁文件夹。
4. 双击该文件夹根目录的 `OpenEPSE.exe` 或 `OpenEPSE.bat` 启动。

账号 / 密码：`123456 / 123456`。无需额外安装 Java 或 Node.js，文件夹无需改名。

**注意：补丁会替换两份数据库，旧版作答和成绩记录不会保留，覆盖前请先备份。** 新版沿用启动和退出时清理作答的行为。只把 ZIP 拖进去不会自动升级，必须解压并替换。

本包需要完整 V2.1 原版，不能独立解压到空文件夹运行。

## 本次内容

- 保留新版桌面、后端、前端、数据库、运行脚本、A/B/C/D 功能、D 卷 v4 题库、151 张新增配图及仿真数据。
- 包含 2026-10-27 集成的共享题目保存/交卷修复、B 卷补齐 36 题、B/C 卷别显示、离线心跳与无效 WebSocket 重连修复。
- 新增或替换 1,185 个文件，复用原版相同的 1,771 个文件；排除开发备份和测试临时资料。
- 在原版副本覆盖验证 2,956 个目标运行文件；A/B/C/D 各连续两轮完整保存、交卷、100 分结果与返回清理全部通过。
- 正常启动自动更新数据库路径，可移动文件夹或换电脑使用。

验证范围和限制见[本次验证报告](docs/patchv2.3.1/VALIDATION.zh-CN.md)。

## 校验

```text
e15501e9ea8f093ceca264c4e8605ce3e12d8784f0cf20b4b330ee2e2a8f09da  patchv2.3.1.zip
```

Windows PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 .\patchv2.3.1.zip
```

## 历史版本

- [2026-10-25 发布的 V2.3.2-all 补丁](https://github.com/czl98596/epse-patch/releases/tag/v2.3.2-all)
- 仓库中原有桌面、前端和脚本文件保留作旧版补丁参考，当前完整升级请使用上面的 `patchv2.3.1.zip`。

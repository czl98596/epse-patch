# EPSE 升级补丁

将完整的 **EpseSingleV2.1 原版**通过解压覆盖升级到 **EpseSingleV2.3.2-all** 的功能版本。

## 下载完整补丁

- **[下载 V2.3.2-all 完整升级补丁（约 345 MB）](https://github.com/czl98596/epse-patch/releases/download/v2.3.2-all/EpseSingleV2.1-to-V2.3.2-all-patch.zip)**
- [发布页面与附件](https://github.com/czl98596/epse-patch/releases/tag/v2.3.2-all)
- [使用说明](docs/v2.3.2-all/INSTALL.zh-CN.txt)
- [验证报告](docs/v2.3.2-all/VALIDATION.zh-CN.md)
- [SHA-256 校验值](docs/v2.3.2-all/SHA256SUMS.txt)

请下载 Release 中的 `EpseSingleV2.1-to-V2.3.2-all-patch.zip`。GitHub 的 **Code → Download ZIP** 和自动生成的 **Source code** 压缩包不包含此次完整升级所需的大型后端和数据库文件。

## 使用方法

1. 关闭所有 EPSE 窗口和后台，先备份原有 `EpseSingleV2.1` 文件夹。
2. 解压下载的补丁，把解压得到的**全部内容**拖进原有 `EpseSingleV2.1` 文件夹。
3. 遇到同名文件，选择**替换目标中的文件**，不要再套一层补丁文件夹。
4. 双击该文件夹根目录的 `OpenEPSE.exe` 或 `OpenEPSE.bat` 启动。

**只把 ZIP 文件拖进去不会自动升级，必须解压并替换。** 文件夹仍可叫 `EpseSingleV2.1`，无需改名，也无需额外安装 Java 或 Node.js。

账号 / 密码：`123456 / 123456`。

> **数据提醒：补丁会替换两份数据库，旧版作答和成绩记录不会保留。覆盖前请先备份。** 新版沿用启动和退出时清理作答的行为。

## 补丁内容

- 新版桌面逻辑、后端 JAR、前端、数据库和运行脚本。
- A/B/C/D 功能、D 卷 v4 题库、151 张新增配图、新版提供的仿真数据及已有修复。
- 新增或替换 1,170 个文件；复用原版中完全相同的 1,861 个文件。
- 正常启动会自动更新数据库路径，可以移动文件夹或换电脑使用。

本包需要完整的 V2.1 原版作为基础，不能解压到空文件夹独立运行。原电脑的日志、PID 和初始数据库备份不随补丁分发。

## 验证与校验

已把补丁覆盖到原版 V2.1 的独立副本，3,031 个目标运行文件的 SHA-256 全部与可运行的 V2.3.2-all 一致。启动、登录、A/B/C 题库读取、D 卷随机抽题（36 题、100 分）与刷新保持题目均通过测试。

完整验证范围和限制见[验证报告](docs/v2.3.2-all/VALIDATION.zh-CN.md)。

```text
67badce3cdc8feca40b4bcf067b9a44da5a0108b8525b164f0c05c348c6f0ded  EpseSingleV2.1-to-V2.3.2-all-patch.zip
```

Windows PowerShell 校验：

```powershell
Get-FileHash -Algorithm SHA256 .\EpseSingleV2.1-to-V2.3.2-all-patch.zip
```

## 历史文件

仓库中原有的桌面、前端和脚本文件保留作旧版补丁参考；获取本次完整升级请使用上面的 Release 下载链接。

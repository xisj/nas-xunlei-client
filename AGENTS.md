# nas迅雷客户端 (nas-xunlei-client)

## 项目概述
Electron 桌面客户端，封装 NAS 上的迅雷下载站。macOS/Windows 跨平台。

## 关键命令
- 开发运行: `npm start` (即 `electron .`)
- 重建原生模块: `npx @electron/rebuild -f -w node-window-manager`
- 打包: `npm run dist:macarm` / `dist:macx64` / `dist:win64` / `dist:win32`
- UI 构建: `npm run build:ui2` (ui2 子目录)

## 图标 (src/icon.png)
- `src/icon.png` 同时用于 macOS 打包 (`build.mac.icon`) 与 macOS 窗口图标；Windows 用 `src/icon.ico` / `icon-256.ico`，托盘用 `src/icon-tray.png`。
- **必须是满幅 (full-bleed) 正方形 1024×1024，且不能有透明像素**。macOS 26 (Tahoe) 对图标分三类处理：
  1. 满幅方形图 → 自动按官方 squircle 裁切，四角用图像本身颜色补齐（推荐）；
  2. 带透明留白/非方形画面 → 被缩放后放进系统默认浅灰 squircle 里（"Squircle Jail"，就是"灰底 + 变形"的来源）；
  3. 使用 Xcode 26 `.icon` / Icon Composer 资源（本项目未使用）。
- 历史坑：源图曾是 986×790（宽高比 1.248）直接塞进 986×986 画布，Tahoe 把它拉伸填满 squircle → 小鸟被压扁、尾巴被裁、多出灰底。
- 重新生成：裁掉旧图透明边 → 按比例缩放画面到约 760px 宽 → 贴到 1024×1024 纯色背景 (`#E8EDF2`) 正中 → 保存为 `src/icon.png`。

## Homebrew Cask (Casks/nas-xunlei.rb)
- 应用未购买 Apple Developer 证书、未公证，官方 homebrew-cask 不会收录（2026-09 起该仓库要求 cask 通过 Gatekeeper 检查），只能用**个人 tap** 分发。
- 安装命令（需先把 `Casks/nas-xunlei.rb` 放进 `xisj/homebrew-nas-xunlei` 仓库）：
  - 一条命令（推荐，brew 会自动 tap + 信任该 cask）：`brew install --cask xisj/nas-xunlei/nas-xunlei`
  - 短名称方式（需先信任一次）：`brew tap xisj/nas-xunlei && brew trust xisj/nas-xunlei && brew install --cask nas-xunlei`
- brew 7 起 `brew install --cask <本地路径/URL>` 被禁用（`HOMEBREW_FORBID_PACKAGES_FROM_PATHS` 默认开启），cask 必须来自 tap；第三方 tap 默认不信任（`brew trust` / 全名安装自动信任）。
- `--no-quarantine` 选项已在 brew 7 移除；未公证应用必须用 `postflight_steps` 里的 `run "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "{{appdir}}/nas迅雷.app"]` 移除 quarantine，否则 Apple Silicon 首次启动报"已损坏"（已实测通过：安装 → 去 quarantine → 启动）。
- 发新版时需同步更新 `version` 与两架构 `sha256`（GitHub Release 附带的 `nas-xunlei-CHECKSUMS.txt` 里有值）。
- `auto_updates true`（应用自己用 electron-updater 升级，brew 不会提示过期）。`license` stanza 在本机 brew 7.0.4 运行时不支持（会报 undefined method），不要加。

## 已知原生依赖
- `node-window-manager@^2.2.4`: 用于检测前台全屏应用（视频/游戏），源码在 `node_modules/node-window-manager/lib/macos.mm` (macOS) / `windows.cc` (Windows)。
  - **已打补丁**: `initWindow` 与 `getWindowTitle` 增加了空指针保护，防止长时间挂机后 macOS 回收后台进程导致 `NSRunningApplication` 为 nil 进而 `strlen(nullptr)` SIGSEGV。
  - 重新安装/升级该依赖后需要重新打补丁并执行 `npx @electron/rebuild -f -w node-window-manager`。
  - **重要**: 打补丁只改源码不够，必须重新编译生成 `.node`。`electron-builder` 打包时会调用 `@electron/rebuild`（`buildFromSource=false`），若 `build/Release/` 下已有旧版未打补丁的二进制缓存，可能不会重新编译。打补丁后务必先 `npx @electron/rebuild -f -w node-window-manager -a arm64`（及 `-a x64`）强制重建，再打包。可用 `otool -arch arm64 -tvV build/Release/addon.node | grep -A250 initWindow` 检查是否含 `cbz x23`（app 空检查）与 `csel`（UTF8String 空回退）确认补丁已编入。
- `extract-file-icon`: 提取应用图标，同为 `.node` 原生模块。

## 崩溃修复历史
- v1.2.1: 修复长时间挂机后崩溃 (EXC_BAD_ACCESS at 0x0 in `initWindow` → `Napi::String::New(env, nullptr)`)。
  - 根因: `speedWindowTopmostTimer` 每秒调用 `isForegroundFullscreen()` → `windowManager.getActiveWindow()` → `addon.initWindow(id)`，挂机后 CGWindowList 返回陈旧窗口条目，owner PID 对应进程已被 macOS 挂起/回收，`NSRunningApplication` 为 nil，`[nil.bundleURL.path UTF8String]` 返回 nil，原生 `Napi::String::New(env, nullptr)` 触发 `strlen(nullptr)` 段错误。
  - 修复: (1) 补丁 `macos.mm` 空指针检查; (2) JS 层 `isForegroundFullscreen` 增加系统空闲检测(>5min 跳过)与 `active.path` 空值保护。
- v1.3.3: 同一崩溃复现。源码 `macos.mm` 补丁仍在，但打包出的 arm64 `addon.node` 实际是**未打补丁的旧二进制**（`otool` 反汇编显示 `initWindow` 内 `bundleURL→path→UTF8String→Napi::String::New` 之间无任何 `cbz` 空检查，崩溃偏移 `initWindow+620` 正对应 `Napi::String::New` 调用点）。
  - 根因: 之前打补丁后未强制重建 arm64 原生模块，`electron-builder` 的 `@electron/rebuild(buildFromSource=false)` 沿用了 `build/Release/` 下未打补丁的缓存二进制。JS 层 `active.path` 保护无法拦截，因为崩溃发生在原生 `initWindow` 内部、早于返回值。
  - 修复: `npx @electron/rebuild -f -w node-window-manager -a arm64`（及 `extract-file-icon`）强制从已打补丁源码重新编译，再 `npm run dist:macarm` 重新打包。反汇编验证新二进制含 `cbz x23`(app nil 检查)、`cbz x0`(bundleURL/path nil 检查)、`csel x1,x23,x0,eq`(UTF8String nil 回退到 "")。

## 卡死修复历史
- 点击"等待下载"任务左侧文件夹图标 → 整个应用卡死（100% 复现）。
  - 根因: `handleOpenFileFolder` → `findFileInDir` 用**同步** `fs.readdirSync` 在 `sharedPath`（NAS 网络挂载）上递归扫描 3 层。等待任务文件尚不存在 → 精确/模糊匹配落空 → 全量遍历整棵目录树，同步网络 I/O 直接阻塞主进程事件循环。已下载任务文件在顶层即命中早退，所以不卡。
  - 修复: 该链路全部改异步（`fs.promises` 顺序遍历、同一时刻最多一个挂起 readdir 避免占满 libuv 线程池）；加防重入 `openFileFolderInFlight` 与 30s 扫描超时；`open-shared-path`、速度球菜单"打开下载文件夹"两处的 `fs.existsSync(sharedPath)` 同样改异步。
  - **原则**: 主进程中禁止对 `sharedPath`（或任何 `/Volumes/` 下可能为网络挂载的路径）使用同步 fs 调用（existsSync/readdirSync/statSync/readFileSync），一律 `fs.promises`。
- 下载中任务点文件夹图标误报"文件不存在"。
  - 原因: 未完成任务文件以临时名存在（`name.mkv.xltd`、`.name.tmp` 等）或尚未落盘，文件名匹配不上。
  - 修复: `findFileInDir` 匹配分级（`normalizeEntryName` 去前导隐藏点 + 去临时后缀 `.xltd/.td/.tmp/.part/.download/.crdownload/.bc!/.!qb`）；preload 传 `taskState`（`ing`/`done`，取 `.task-item__content` class），未完成任务找不到文件时直接打开 `sharedPath`，已完成任务才弹"文件不存在"。
  - **匹配顺序**: 每层按 精确目录 → 精确文件 → 归一化精确目录 → 归一化精确文件 → 前缀模糊目录 → 前缀模糊文件。目录优先：多文件（BT）任务的任务名是文件夹，任务内文件可能尚未建立，不能靠文件名匹配；归一化精确（`A.file.xltd` 对任务 `A.file`）须优先于前缀模糊（碰巧同前缀的目录 `A`），否则单文件任务会误开别人的文件夹。
- 文件夹图标显示门槛（preload `isTaskQualified`/`getTaskProgress`）：**只读进度条宽度**（`.td-progress-bar__inner` 的 `style.width`，`parseFloat`）——等待中任务进度条是灰色的（宽度 0 或元素缺失 → 视为 0）。**不要从状态/其他文本抓 %**，无关百分比曾导致 0% 等待任务误显示图标（曾尝试用 `drive/v1/tasks` 接口 `file_name` 判断，过度设计已回退）。进度 ≥1% 或状态含"校验/验证"才显示图标；等待中但进度 ≥1% 的任务部分文件已落盘，仍可打开（曾按"等待"文本一刀切被否）。`mouseenter` 判定不合格时会主动恢复残留图标，防止列表复用 DOM 节点导致图标错挂。

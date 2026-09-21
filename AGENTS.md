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
- 安装命令（需先把 `Casks/nas-xunlei.rb` 放进 `xisj/homebrew-nas-xunlei` 仓库）：`brew tap xisj/nas-xunlei && brew install --cask nas-xunlei`。
- brew 7 起 `brew install --cask <本地路径/URL>` 被禁用（`HOMEBREW_FORBID_PACKAGES_FROM_PATHS` 默认开启），cask 必须来自 tap。
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

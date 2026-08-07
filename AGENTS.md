# nas迅雷客户端 (nas-xunlei-client)

## 项目概述
Electron 桌面客户端，封装 NAS 上的迅雷下载站。macOS/Windows 跨平台。

## 关键命令
- 开发运行: `npm start` (即 `electron .`)
- 重建原生模块: `npx @electron/rebuild -f -w node-window-manager`
- 打包: `npm run dist:macarm` / `dist:macx64` / `dist:win64` / `dist:win32`
- UI 构建: `npm run build:ui2` (ui2 子目录)

## 已知原生依赖
- `node-window-manager@^2.2.4`: 用于检测前台全屏应用（视频/游戏），源码在 `node_modules/node-window-manager/lib/macos.mm` (macOS) / `windows.cc` (Windows)。
  - **已打补丁**: `initWindow` 与 `getWindowTitle` 增加了空指针保护，防止长时间挂机后 macOS 回收后台进程导致 `NSRunningApplication` 为 nil 进而 `strlen(nullptr)` SIGSEGV。
  - 重新安装/升级该依赖后需要重新打补丁并执行 `npx @electron/rebuild -f -w node-window-manager`。
- `extract-file-icon`: 提取应用图标，同为 `.node` 原生模块。

## 崩溃修复历史
- v1.2.1: 修复长时间挂机后崩溃 (EXC_BAD_ACCESS at 0x0 in `initWindow` → `Napi::String::New(env, nullptr)`)。
  - 根因: `speedWindowTopmostTimer` 每秒调用 `isForegroundFullscreen()` → `windowManager.getActiveWindow()` → `addon.initWindow(id)`，挂机后 CGWindowList 返回陈旧窗口条目，owner PID 对应进程已被 macOS 挂起/回收，`NSRunningApplication` 为 nil，`[nil.bundleURL.path UTF8String]` 返回 nil，原生 `Napi::String::New(env, nullptr)` 触发 `strlen(nullptr)` 段错误。
  - 修复: (1) 补丁 `macos.mm` 空指针检查; (2) JS 层 `isForegroundFullscreen` 增加系统空闲检测(>5min 跳过)与 `active.path` 空值保护。

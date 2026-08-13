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
  - **重要**: 打补丁只改源码不够，必须重新编译生成 `.node`。`electron-builder` 打包时会调用 `@electron/rebuild`（`buildFromSource=false`），若 `build/Release/` 下已有旧版未打补丁的二进制缓存，可能不会重新编译。打补丁后务必先 `npx @electron/rebuild -f -w node-window-manager -a arm64`（及 `-a x64`）强制重建，再打包。可用 `otool -arch arm64 -tvV build/Release/addon.node | grep -A250 initWindow` 检查是否含 `cbz x23`（app 空检查）与 `csel`（UTF8String 空回退）确认补丁已编入。
- `extract-file-icon`: 提取应用图标，同为 `.node` 原生模块。

## 崩溃修复历史
- v1.2.1: 修复长时间挂机后崩溃 (EXC_BAD_ACCESS at 0x0 in `initWindow` → `Napi::String::New(env, nullptr)`)。
  - 根因: `speedWindowTopmostTimer` 每秒调用 `isForegroundFullscreen()` → `windowManager.getActiveWindow()` → `addon.initWindow(id)`，挂机后 CGWindowList 返回陈旧窗口条目，owner PID 对应进程已被 macOS 挂起/回收，`NSRunningApplication` 为 nil，`[nil.bundleURL.path UTF8String]` 返回 nil，原生 `Napi::String::New(env, nullptr)` 触发 `strlen(nullptr)` 段错误。
  - 修复: (1) 补丁 `macos.mm` 空指针检查; (2) JS 层 `isForegroundFullscreen` 增加系统空闲检测(>5min 跳过)与 `active.path` 空值保护。
- v1.3.3: 同一崩溃复现。源码 `macos.mm` 补丁仍在，但打包出的 arm64 `addon.node` 实际是**未打补丁的旧二进制**（`otool` 反汇编显示 `initWindow` 内 `bundleURL→path→UTF8String→Napi::String::New` 之间无任何 `cbz` 空检查，崩溃偏移 `initWindow+620` 正对应 `Napi::String::New` 调用点）。
  - 根因: 之前打补丁后未强制重建 arm64 原生模块，`electron-builder` 的 `@electron/rebuild(buildFromSource=false)` 沿用了 `build/Release/` 下未打补丁的缓存二进制。JS 层 `active.path` 保护无法拦截，因为崩溃发生在原生 `initWindow` 内部、早于返回值。
  - 修复: `npx @electron/rebuild -f -w node-window-manager -a arm64`（及 `extract-file-icon`）强制从已打补丁源码重新编译，再 `npm run dist:macarm` 重新打包。反汇编验证新二进制含 `cbz x23`(app nil 检查)、`cbz x0`(bundleURL/path nil 检查)、`csel x1,x23,x0,eq`(UTF8String nil 回退到 "")。

const {app, protocol, clipboard, BrowserWindow} = require('electron')
const logger = require('./common/logger')
require('./common/global')
const func = require('./common/func')

// 禁用硬件加速，减少GPU进程残留的可能性
app.disableHardwareAcceleration()
logger.log('Hardware acceleration disabled')

// 从参数列表中提取有效的协议链接，过滤掉快捷方式、Electron参数等
function extractProtocolUrl(args) {
    return args.find(arg => {
        // 排除以 -- 开头的参数（Electron/Chromium 参数）
        if (arg.startsWith('--')) return false
        // 以下为 Windows 特有路径过滤，Mac/Linux 上不会匹配，跳过判断以保持兼容
        if (process.platform === 'win32') {
            // 排除 exe 路径本身
            if (arg.endsWith('.exe')) return false
            // 排除文件路径（包含 .lnk, .url 等）
            if (arg.includes('.lnk') || arg.includes('.url')) return false
            // 排除 Windows 路径格式（如 C:\）
            if (/^[A-Z]:\\/i.test(arg)) return false
        }
        // 只接受有效的协议链接
        return (
            arg.startsWith('magnet:') ||
            arg.startsWith('ed2k://') ||
            arg.startsWith('thunder://') ||
            arg.startsWith('thunderx://') ||
            arg.startsWith('ftp://')
        )
    })
}

// 阻止创建额外窗口（处理协议链接时可能触发）
// 对所有实例（含未获锁的第二实例）都安全，不依赖任何窗口资源
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (e, url) => {
        e.preventDefault()
        logger.log('new-window prevented:', url)
    })
    // 阻止通过 window.open 创建新窗口
    contents.setWindowOpenHandler(({ url }) => {
        logger.log('window.open prevented:', url)
        return { action: 'deny' }
    })
})

// ============ 单实例锁 ============
// 必须在注册 whenReady / 加载会创建窗口的模块（tray/mainWindow/menu）之前判断，
// 否则第二实例（通过协议链接唤起）会在 app.quit() 生效前就触发 ready 事件，
// 创建出窗口/托盘/速度浮窗等全部资源，且 before-quit 不会被触发，
// 最终成为无界面的残留进程。
const additionalData = {myKey: 'myValue'}
const gotTheLock = app.requestSingleInstanceLock(additionalData)

if (!gotTheLock) {
    // 第二实例：不加载任何模块、不创建任何窗口，直接退出
    logger.log('Another instance already running, quitting this one')
    app.quit()
} else {
    // 主实例：加载菜单、托盘、主窗口模块
    require('./common/menu')
    const tray = require('./common/tray')
    const mainWindow = require('./module/mainWindow/mainWindow')
    const updater = require('./common/updater')

    // ============ macOS open-url 事件处理 ============
    // macOS 通过 URL scheme 唤起应用时触发 open-url 事件（而非 second-instance）。
    // 该事件可能在 whenReady 之前触发（应用未启动时点击链接），因此必须尽早注册。
    // Windows 不触发此事件，监听也无副作用。
    let pendingOpenUrls = []   // ready 之前缓存的协议 URL
    let isReady = false

    // 验证是否为受支持的协议链接
    function isValidProtocolUrl(url) {
        if (!url || typeof url !== 'string') return false
        return (
            url.startsWith('magnet:') ||
            url.startsWith('ed2k://') ||
            url.startsWith('thunder://') ||
            url.startsWith('thunderx://') ||
            url.startsWith('ftp://')
        )
    }

    // 处理协议链接：确保窗口可见并触发添加任务
    function handleProtocolUrl(url) {
        if (!isValidProtocolUrl(url)) {
            logger.log('open-url: not a valid protocol url, ignoring:', url)
            return
        }
        logger.log('Handling protocol URL:', url)
        // 确保窗口可见、再触发任务，避免显示/隐藏闪烁
        if (mainWindow.win) {
            try {
                if (!mainWindow.win.isVisible()) {
                    logger.log('open-url: window not visible, showing...')
                    mainWindow.win.show()
                }
                if (mainWindow.win.isMinimized()) {
                    logger.log('open-url: window minimized, restoring...')
                    mainWindow.win.restore()
                }
                mainWindow.win.focus()
            } catch (e) {
                logger.log('open-url: error showing window:', e)
            }
        }
        mainWindow.addXunLeiTask(url)
    }

    app.on('open-url', (event, url) => {
        // 必须 preventDefault，否则 Electron 可能尝试默认处理
        event.preventDefault()
        logger.log('open-url received:', url, 'isReady:', isReady)
        if (!url) return
        if (!isReady) {
            // 应用尚未就绪（未启动时点击链接），缓存 URL 等 ready 后处理
            pendingOpenUrls.push(url)
        } else {
            // 已就绪（已运行实例被唤起），直接处理
            handleProtocolUrl(url)
        }
    })

    app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
        logger.log('second-instance commandLine:', commandLine)

        // 先确保窗口可见、再触发任务，避免显示/隐藏闪烁
        if (mainWindow.win) {
            try {
                if (!mainWindow.win.isVisible()) {
                    logger.log('Window not visible, showing...')
                    mainWindow.win.show()
                }
                if (mainWindow.win.isMinimized()) {
                    logger.log('Window minimized, restoring...')
                    mainWindow.win.restore()
                }
                mainWindow.win.focus()
            } catch (e) {
                logger.log('Error showing window:', e)
            }
        }

        // 从 commandLine 中提取有效的协议链接，过滤掉快捷方式等参数
        const protocolUrl = extractProtocolUrl(commandLine)

        if (protocolUrl) {
            logger.log('Valid protocol URL found:', protocolUrl)
            mainWindow.addXunLeiTask(protocolUrl)
        } else {
            logger.log('No valid protocol URL in second-instance, ignoring')
        }
    })

    app.whenReady().then(() => {
        // Mac 上 .ico 不被支持，使用 .png
        const iconFile = process.platform === 'darwin' ? 'icon.png' : 'icon.ico'
        mainWindow.create(iconFile)
        // 初始化自动更新
        updater.init()
        updater.startAutoCheck()
        app.on('activate', () => {
            // 窗口被 hide() 后（例如最小化到托盘），点击任务栏图标会触发 activate。
            // 此时窗口仍存在但不可见，需要主动 show/focus，否则点击无反应。
            if (mainWindow.win && !mainWindow.win.isDestroyed()) {
                if (!mainWindow.win.isVisible()) {
                    logger.log('activate: showing hidden window')
                    mainWindow.win.show()
                }
                if (mainWindow.win.isMinimized()) {
                    logger.log('activate: restoring minimized window')
                    mainWindow.win.restore()
                }
                mainWindow.win.focus()
            } else if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow.create()
            }
        })
        if (global.config.hasOwnProperty('regProtocol') && true === global.config.regProtocol) {
            func.registerProtocolClient()
        }

        // 标记已就绪：此后收到的 open-url 事件会直接处理
        isReady = true

        // macOS: 处理应用未启动时点击链接缓存的 open-url（可能在 ready 之前触发）
        if (pendingOpenUrls.length > 0) {
            logger.log('Processing pending open-url(s):', pendingOpenUrls.length)
            // 延迟执行，确保窗口和页面已初始化（与 Windows argv 处理保持一致）
            setTimeout(() => {
                pendingOpenUrls.forEach(url => handleProtocolUrl(url))
                pendingOpenUrls = []
            }, 3000)
        }

        // Windows: 检查启动参数，处理通过协议链接启动的情况（程序关闭后点击链接）
        // macOS 的协议 URL 不在 argv 中，而是通过 open-url 事件传递（见上方处理）
        logger.log('Process argv:', process.argv)
        const protocolUrl = extractProtocolUrl(process.argv)
        if (protocolUrl) {
            logger.log('Launched with protocol URL:', protocolUrl)
            // 延迟执行，确保窗口和页面已初始化
            setTimeout(() => {
                mainWindow.addXunLeiTask(protocolUrl)
            }, 3000)  // 3秒确保页面完全加载和初始化
        } else {
            logger.log('No valid protocol URL found in argv')
        }
    })

    // 集中退出清理逻辑
    let forceExitTimer = null
    let cleanupDone = false
    app.on('before-quit', (e) => {
        // 如果已经清理过，直接放行，避免重复清理
        if (cleanupDone) {
            logger.log('before-quit: already cleaned, skipping')
            return
        }

        // 第一次进入，标记为退出中
        global.__isQuitting = true
        cleanupDone = true
        logger.log('before-quit: cleaning up')

        // 清理定时器
        try { mainWindow.cleanupTimers() } catch (err) { logger.log('cleanupTimers error:', err) }
        try { updater.stopAutoCheck() } catch (err) { logger.log('stopAutoCheck error:', err) }

        // 销毁窗口和所有资源
        try { mainWindow.destroyWindow() } catch (err) { logger.log('destroyWindow error:', err) }

        // 销毁tray
        try { tray.destroy() } catch (err) { logger.log('tray destroy error:', err) }

        // 不注销协议处理器，退出后仍应能通过链接唤起客户端
        // 只有在卸载程序时才应该注销协议

        logger.log('cleanup completed, exiting in 1s')

        // 兜底：1秒后强制退出，不再等待
        if (!forceExitTimer) {
            forceExitTimer = setTimeout(() => {
                logger.log('force exit now')
                app.exit(0)
            }, 1000)
        }
    })

    app.on('will-quit', () => {
        logger.log('will-quit fired')
        try { mainWindow.cleanupTimers() } catch (_) {}
        // 不注销协议处理器
    })

    app.on('window-all-closed', () => {
        logger.log('window-all-closed fired')
        // 如果已经在退出流程中，不再调用 app.quit()，避免重复触发 before-quit
        if (global.__isQuitting) {
            logger.log('already quitting, skip app.quit()')
            return
        }
        // 不注销协议处理器
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

    // 额外兜底：监听 quit 事件，确保退出被执行
    app.on('quit', () => {
        logger.log('quit event fired, app exiting')
    })
}

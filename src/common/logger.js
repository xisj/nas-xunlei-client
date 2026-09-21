// 统一的控制台日志函数
// 特性：
// 1. 主/渲染双端通用，自动检测 process.type
// 2. 默认缓冲日志，DevTools 开启后自动 flush
// 3. 主进程日志通过 IPC 转发到所有渲染进程（最终出现在 DevTools 控制台）
// 4. 接管全局 console.* 方法，旧代码无需改动即可生效
// 5. 暴露 global.logger / window.logger 供显式调用

const isRenderer = (typeof process !== 'undefined' && process.type === 'renderer')
const isMain = (typeof process !== 'undefined' && (process.type === 'browser' || process.type === 'main'))

const BUFFER_LIMIT = 2000
const buffer = []
let active = false
const openDevToolsSet = new Set()

const originalConsole = {}

function captureConsole() {
    if (typeof console !== 'undefined') {
        const c = console
        originalConsole.log = c.log
        originalConsole.warn = c.warn
        originalConsole.error = c.error
        originalConsole.info = c.info
        originalConsole.debug = c.debug
    }
}

captureConsole()

function safeArg(arg) {
    if (arg === undefined) return 'undefined'
    if (arg === null) return null
    if (typeof arg === 'function') return '[Function]'
    if (arg instanceof Error) return arg.stack || `[Error: ${arg.message}]`
    if (typeof arg === 'object') {
        try {
            const seen = new WeakSet()
            let str = JSON.stringify(arg, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) return '[Circular]'
                    seen.add(value)
                }
                return value
            })
            if (str && str.length > 4000) str = str.slice(0, 4000) + '... [truncated]'
            return str
        } catch (e) {
            try { return String(arg) } catch (_) { return '[unserializable]' }
        }
    }
    return arg
}

function rawLog(level, args) {
    if (isMain) {
        // 主进程没有 DevTools，开发模式下同时输出到 stderr 便于调试
        try {
            const { app } = require('electron')
            const packaged = (typeof app.isPackaged === 'function') ? app.isPackaged() : app.isPackaged
            if (app && !packaged) {
                const prefix = `[${level.toUpperCase()}]`
                const line = args.map(safeArg).join(' ')
                process.stderr.write(`${prefix} ${line}\n`)
            }
        } catch (_) {}
    } else if (originalConsole[level]) {
        originalConsole[level].apply(console, args)
    }
}

function sendToRenderers(level, args) {
    if (isRenderer) return
    try {
        const { BrowserWindow } = require('electron')
        const payload = { level, args: args.map(safeArg), ts: Date.now() }
        BrowserWindow.getAllWindows().forEach(w => {
            if (w.isDestroyed()) return
            try { w.webContents.send('__nas-log', payload) } catch (_) {}
        })
    } catch (e) { /* ignore */ }
}

function output(level, args) {
    if (!active) {
        if (buffer.length < BUFFER_LIMIT) buffer.push({ level, args, ts: Date.now() })
        return
    }
    dispatch(level, args)
}

function dispatch(level, args) {
    if (isRenderer) {
        rawLog(level, args)
    } else if (isMain) {
        sendToRenderers(level, args)
        rawLog(level, args)
    } else {
        rawLog(level, args)
    }
}

function flush() {
    while (buffer.length) {
        const { level, args } = buffer.shift()
        dispatch(level, args)
    }
}

function setActive(enabled) {
    if (active === enabled) return
    active = enabled
    if (active) flush()
}

function attachToWebContents(webContents) {
    if (!webContents || webContents.__nasLoggerAttached) return
    webContents.__nasLoggerAttached = true

    const onOpen = () => {
        openDevToolsSet.add(webContents.id)
        setActive(true)
        try { webContents.send('__nas-logger-active', true) } catch (_) {}
    }
    const onClose = () => {
        openDevToolsSet.delete(webContents.id)
        if (openDevToolsSet.size === 0) setActive(false)
        try { webContents.send('__nas-logger-active', false) } catch (_) {}
    }
    const onDestroy = () => {
        openDevToolsSet.delete(webContents.id)
        if (openDevToolsSet.size === 0) setActive(false)
    }

    webContents.on('devtools-opened', onOpen)
    webContents.on('devtools-closed', onClose)
    webContents.on('destroyed', onDestroy)
    if (webContents.isDevToolsOpened && webContents.isDevToolsOpened()) onOpen()
}

function setupMainProcess() {
    if (!isMain) return
    try {
        const { app, BrowserWindow, ipcMain } = require('electron')

        app.on('browser-window-created', (e, win) => attachToWebContents(win.webContents))

        BrowserWindow.getAllWindows().forEach(w => attachToWebContents(w.webContents))

        // 渲染进程就绪后查询当前 DevTools 状态
        ipcMain.on('__nas-logger-ready', (e) => {
            const wc = e.sender
            if (!wc || wc.isDestroyed()) return
            try {
                wc.send('__nas-logger-active', wc.isDevToolsOpened())
            } catch (_) {}
        })
    } catch (e) {}
}

function queryActiveState() {
    if (!isRenderer || typeof require === 'undefined') return
    try {
        const { ipcRenderer } = require('electron')
        ipcRenderer.send('__nas-logger-ready')
    } catch (e) {}
}

function setupRenderer() {
    if (!isRenderer || typeof require === 'undefined') return
    try {
        const { ipcRenderer } = require('electron')

        ipcRenderer.on('__nas-logger-active', (e, enabled) => setActive(enabled))

        ipcRenderer.on('__nas-log', (e, payload) => {
            if (!payload || !payload.level) return
            output(payload.level, payload.args)
        })

        queryActiveState()
    } catch (e) {}
}

function overrideConsole() {
    if (typeof console === 'undefined') return
    const methods = { log, warn, error, info, debug }
    for (const [name, fn] of Object.entries(methods)) {
        try {
            console[name] = fn
        } catch (e) {}
    }
}

function exposeGlobal() {
    if (typeof globalThis !== 'undefined') globalThis.__nasLogger = logger
    if (typeof global !== 'undefined') global.__nasLogger = logger
    if (typeof window !== 'undefined') {
        window.__nasLogger = logger
        window.logger = logger
    }
}

function log(...args) { output('log', args) }
function warn(...args) { output('warn', args) }
function error(...args) { output('error', args) }
function info(...args) { output('info', args) }
function debug(...args) { output('debug', args) }

const logger = { log, warn, error, info, debug, setActive, attachToWebContents }

if (isMain) setupMainProcess()
if (isRenderer) setupRenderer()
overrideConsole()
exposeGlobal()

module.exports = logger

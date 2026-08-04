const {app, dialog, shell, BrowserWindow} = require('electron')
const {autoUpdater} = require('electron-updater')
const isMac = process.platform === 'darwin'

// 更新检查间隔（24小时）
const CHECK_INTERVAL = 24 * 60 * 60 * 1000
// 启动后延迟检查（30秒）
const STARTUP_DELAY = 30 * 1000

let checkTimer = null
let downloadProgressWin = null
let isChecking = false
let isUpdateAvailable = false

// GitHub Release 页面，macOS 无签名时引导用户手动下载
const RELEASES_URL = 'https://github.com/xisj/nas-xunlei-client/releases/latest'

/**
 * 初始化自动更新
 */
function init() {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallAppOnQuit = true

    autoUpdater.on('checking-for-update', () => {
        console.log('[updater] checking for update')
    })

    autoUpdater.on('update-available', (info) => {
        console.log('[updater] update available:', info.version)
        isUpdateAvailable = true
    })

    autoUpdater.on('update-not-available', (info) => {
        console.log('[updater] current version is latest:', info.version)
        isUpdateAvailable = false
    })

    autoUpdater.on('error', (err) => {
        console.log('[updater] error:', err.message)
        isChecking = false
    })

    autoUpdater.on('download-progress', (progress) => {
        console.log(`[updater] download: ${progress.percent.toFixed(1)}%`)
    })

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[updater] update downloaded:', info.version)
        isChecking = false
        showUpdateDownloadedDialog(info)
    })
}

/**
 * 检查更新
 * @param {boolean} manual 是否手动触发（手动触发会显示"已是最新"提示）
 */
async function checkForUpdates(manual = false) {
    if (isChecking) {
        console.log('[updater] already checking, skip')
        return
    }

    if (!app.isPackaged) {
        console.log('[updater] dev mode, skip update check')
        if (manual) {
            showDevModeDialog()
        }
        return
    }

    isChecking = true

    if (isMac) {
        // macOS 无签名时 autoUpdater 会失败，直接引导手动下载
        await checkForUpdatesMacManual(manual)
        isChecking = false
        return
    }

    // Windows: 使用 electron-updater 自动更新
    try {
        const result = await autoUpdater.checkForUpdates()
        if (!result || !result.updateInfo) {
            isChecking = false
            return
        }
        // 如果没有更新，手动触发时提示
        if (manual && !isUpdateAvailable) {
            showNoUpdateDialog(result.updateInfo.version)
        }
        isChecking = false
    } catch (err) {
        console.log('[updater] check failed:', err.message)
        isChecking = false
        if (manual) {
            showCheckErrorDialog(err.message)
        }
    }
}

/**
 * macOS: 通过 GitHub API 检查更新，引导用户手动下载
 */
async function checkForUpdatesMacManual(manual) {
    const https = require('https')
    const currentVersion = app.getVersion()

    const checkPromise = new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/xisj/nas-xunlei-client/releases/latest',
            headers: {
                'User-Agent': 'nas-xunlei-client/' + currentVersion,
                'Accept': 'application/vnd.github.v3+json'
            }
        }

        const req = https.get(options, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => {
                try {
                    const release = JSON.parse(data)
                    resolve(release)
                } catch (e) {
                    reject(e)
                }
            })
        })
        req.on('error', reject)
        req.setTimeout(15000, () => {
            req.destroy(new Error('timeout'))
        })
    })

    try {
        const release = await checkPromise
        const tagName = release.tag_name || ''
        const remoteVersion = tagName.replace(/^v/, '')
        if (!remoteVersion) {
            if (manual) showCheckErrorDialog('无法获取远程版本号')
            return
        }

        if (compareVersion(currentVersion, remoteVersion) >= 0) {
            if (manual) showNoUpdateDialog(currentVersion)
            return
        }

        // 有新版本，引导用户手动下载
        showMacUpdateDialog(remoteVersion, release.body || '')
    } catch (err) {
        console.log('[updater] mac check failed:', err.message)
        if (manual) showCheckErrorDialog(err.message)
    }
}

/**
 * 显示"更新已下载"对话框（Windows）
 */
function showUpdateDownloadedDialog(info) {
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
        type: 'info',
        title: '更新已就绪',
        message: `新版本 ${info.version} 已下载完成`,
        detail: '点击"立即重启"将在关闭应用后自动安装更新。',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1
    }
    const parent = win && !win.isDestroyed() ? win : undefined
    dialog.showMessageBox(parent, opts).then(({response}) => {
        if (response === 0) {
            autoUpdater.quitAndInstall()
        }
    })
}

/**
 * 显示"已是最新版本"对话框
 */
function showNoUpdateDialog(version) {
    const win = BrowserWindow.getFocusedWindow()
    const parent = win && !win.isDestroyed() ? win : undefined
    dialog.showMessageBox(parent, {
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本',
        detail: `版本号: ${version}`,
        buttons: ['确定']
    })
}

/**
 * 显示 macOS 更新对话框（引导手动下载）
 */
function showMacUpdateDialog(version, notes) {
    const win = BrowserWindow.getFocusedWindow()
    const parent = win && !win.isDestroyed() ? win : undefined
    dialog.showMessageBox(parent, {
        type: 'info',
        title: '发现新版本',
        message: `新版本 ${version} 已发布`,
        detail: '由于 macOS 安全限制，请手动下载新版本安装。\n\n' + (notes || '').substring(0, 200),
        buttons: ['前往下载', '稍后'],
        defaultId: 0,
        cancelId: 1
    }).then(({response}) => {
        if (response === 0) {
            shell.openExternal(RELEASES_URL)
        }
    })
}

/**
 * 显示检查错误对话框
 */
function showCheckErrorDialog(message) {
    const win = BrowserWindow.getFocusedWindow()
    const parent = win && !win.isDestroyed() ? win : undefined
    dialog.showMessageBox(parent, {
        type: 'error',
        title: '检查更新失败',
        message: '检查更新时出错',
        detail: message,
        buttons: ['确定']
    })
}

/**
 * 显示开发模式提示
 */
function showDevModeDialog() {
    dialog.showMessageBox({
        type: 'info',
        title: '检查更新',
        message: '开发模式下不检查更新',
        buttons: ['确定']
    })
}

/**
 * 比较版本号，返回 -1/0/1
 */
function compareVersion(v1, v2) {
    const parts1 = v1.split('.').map(Number)
    const parts2 = v2.split('.').map(Number)
    const len = Math.max(parts1.length, parts2.length)
    for (let i = 0; i < len; i++) {
        const a = parts1[i] || 0
        const b = parts2[i] || 0
        if (a < b) return -1
        if (a > b) return 1
    }
    return 0
}

/**
 * 启动自动更新检查
 */
function startAutoCheck() {
    // 启动后延迟检查一次
    setTimeout(() => {
        checkForUpdates(false)
    }, STARTUP_DELAY)

    // 定时检查
    if (checkTimer) {
        clearInterval(checkTimer)
    }
    checkTimer = setInterval(() => {
        checkForUpdates(false)
    }, CHECK_INTERVAL)
}

/**
 * 停止自动检查
 */
function stopAutoCheck() {
    if (checkTimer) {
        clearInterval(checkTimer)
        checkTimer = null
    }
}

module.exports = {
    init,
    checkForUpdates,
    startAutoCheck,
    stopAutoCheck
}

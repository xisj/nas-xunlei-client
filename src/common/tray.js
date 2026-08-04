const {app, Tray, Menu, nativeImage} = require('electron')
const path = require('path')
require('./global')
const isMac = process.platform === 'darwin'

let tray

app.whenReady().then(() => {

    const appPath = app.isPackaged ? path.dirname(app.getPath('exe'))+"/resources/app.asar" : app.getAppPath();
    // macOS 托盘图标需要小尺寸（22x22），且设为 template image 让系统自动适配深浅色
    const trayIcon = isMac ? appPath + "/src/icon-tray.png" : appPath + "/src/icon.png"
    const trayImage = nativeImage.createFromPath(trayIcon)
    tray = new Tray(trayImage)
    if (isMac) {
        tray.setImage(trayImage.resize({ width: 22, height: 22 }))
    }

    const contextMenu = Menu.buildFromTemplate([
        {
            label: global.lang.getLang('menu', 'configNasUrl'),
            role: '',
            click: async () => {
                require('../module/mainWindow/mainWindow').loadDefaultHTML()
            }
        },
        {
            label: global.lang.getLang('menu', 'logout'),
            role: '',
            click: async () => {
                require('../module/mainWindow/mainWindow').logout()
            }
        },
        {
            label: global.lang.getLang('menu', 'hideMainWindow'),
            role: '',
            click: async () => {
                require('../module/mainWindow/mainWindow').hide()
            }
        },
        {
            label: global.lang.getLang('menu', 'showMainWindow'),
            role: '',
            click: async () => {
                require('../module/mainWindow/mainWindow').show()
            }
        },
        {
            label: global.lang.getLang('menu', 'checkUpdate'),
            role: '',
            click: async () => {
                require('./updater').checkForUpdates(true)
            }
        },
        isMac ?
            {label: global.lang.getLang('menu', 'quitApp'), role: 'close'} :
            {label: global.lang.getLang('menu', 'quitApp'), role: 'quit'}
    ])

    tray.setToolTip(global.lang.getLang('menu', 'title'))
    tray.setContextMenu(contextMenu)

    tray.on('click', () => {
        require('../module/mainWindow/mainWindow').show()
    })
})

// 更新 tooltip 文本
module.exports.updateTooltip = (text) => {
    if (tray && !tray.isDestroyed()) {
        tray.setToolTip(text)
    }
}

// 导出 tray 实例供外部使用
module.exports.getTray = () => tray

// 暴露销毁函数，退出时调用以避免tray残留进程
module.exports.destroy = () => {
    try {
        if (tray && !tray.isDestroyed()) {
            tray.destroy()
            tray = null
            console.log('tray destroyed')
        }
    } catch (e) {
        console.log('destroy tray failed:', e)
    }
}
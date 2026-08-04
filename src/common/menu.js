const {app, Menu, shell} = require('electron')
require('./global')
const isMac = process.platform === 'darwin'

const template = [
    // { role: 'appMenu' }
    ...(isMac ? [{
        label: app.name,
        submenu: [
            {role: 'about'},
            {type: 'separator'},
            {role: 'services'},
            {type: 'separator'},
            {role: 'hide'},
            {role: 'hideOthers'},
            {role: 'unhide'},
            {type: 'separator'},
            {role: 'quit'}
        ]
    }] : []),
    // { role: 'fileMenu' }
    {
        label: global.lang.getLang('menu', 'startMenu'),
        submenu: [
            {
                label: global.lang.getLang('menu', 'configNasUrl'),
                role: '',
                click: async () => {
                    require('../module/mainWindow/mainWindow').loadDefaultHTML()
                }
            },
            isMac ?
                {label: global.lang.getLang('menu', 'quitApp'), role: 'close'} :
                {label: global.lang.getLang('menu', 'quitApp'), role: 'quit'}

        ]
    },
    {
        label: global.lang.getLang('menu', 'userMenu'),
        submenu: [
            {
                label: global.lang.getLang('menu', 'logout'),
                role: '',
                click: async () => {
                    require('../module/mainWindow/mainWindow').logout()

                }
            }

        ]
    },

    // { role: 'editMenu' }
    // macOS 上网页内的复制/粘贴/剪切快捷键依赖应用菜单中的 Edit 项注册，缺失会导致 Cmd+C/V/X 不生效
    {
        label: 'Edit',
        submenu: [
            { role: 'undo', label: '撤销' },
            { role: 'redo', label: '重做' },
            { type: 'separator' },
            { role: 'cut', label: '剪切' },
            { role: 'copy', label: '复制' },
            { role: 'paste', label: '粘贴' },
            { role: 'selectAll', label: '全选' }
        ]
    },
    // { role: 'viewMenu' }
    {
        label: 'View',
        submenu: [
            {role: 'reload'},
            {role: 'forceReload'},
            {role: 'toggleDevTools'},
            {type: 'separator'},
            {role: 'resetZoom'},
            {role: 'zoomIn'},
            {role: 'zoomOut'},
            {type: 'separator'},
            {role: 'togglefullscreen'}
        ]
    },
    // { role: 'windowMenu' }
    {
        label: 'Window',
        submenu: [
            {role: 'minimize'},
            {role: 'zoom'},
            ...(isMac ? [
                {type: 'separator'},
                {role: 'front'},
                {type: 'separator'},
                {role: 'window'}
            ] : [
                {role: 'close'}
            ])
        ]
    },
    {
        role: 'help',
        label: global.lang.getLang('menu', 'aboutMe'),
        submenu: [
            {
                label: global.lang.getLang('menu', 'homepage'),
                click: async () => {
                    const {shell} = require('electron')
                    await shell.openExternal('https://github.com/xisj/synology-xunlei-client/')
                }
            },
            {
                label: global.lang.getLang('menu', 'weibo'),
                click: async () => {
                    const {shell} = require('electron')
                    await shell.openExternal('https://weibo.com/u/1917673145')
                }
            }
        ]
    }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)
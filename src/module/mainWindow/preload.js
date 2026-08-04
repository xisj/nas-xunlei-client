const {ipcRenderer, clipboard} = window.require('electron')

// 记录右键时提取到的文件名（用于在菜单点击时识别是哪个文件）
let lastContextFileName = null

// 监听来自页面的速度更新消息
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'speed-update') {
        console.log('[SPEED] Received speed:', e.data.speed)
        ipcRenderer.send('mainWindow-msg', {
            action: 'speed-update',
            data: { speed: e.data.speed }
        })
    } else if (e.data && e.data.type === 'task-list-update') {
        console.log('[TASK LIST] Received tasks:', e.data.tasks.length)
        ipcRenderer.send('mainWindow-msg', {
            action: 'task-list-update',
            data: { tasks: e.data.tasks }
        })
    } else if (e.data && e.data.type === 'overall-progress-update') {
        console.log('[PROGRESS] Overall progress:', e.data.progress, 'Task count:', e.data.taskCount)
        ipcRenderer.send('mainWindow-msg', {
            action: 'overall-progress-update',
            data: { progress: e.data.progress, taskCount: e.data.taskCount }
        })
    }
})

// 监听来自速度窗口的任务项打开文件夹请求
ipcRenderer.on('open-task-folder-from-speed-window', (e, data) => {
    console.log('[SPEED WINDOW] Open task folder request:', data.taskName)
    // 设置文件名，然后触发打开文件夹操作
    lastContextFileName = data.taskName
    // 发送打开文件夹请求到主进程
    ipcRenderer.send('mainWindow-msg', {
        action: 'open-shared-path'
    })
})

// 从右键事件的 target 向上查找，提取文件名
// 优先策略：找带 title 属性的元素（迅雷通常用 title 显示完整文件名）
function extractFileNameFromTarget(target) {
    if (!target) return null
    let node = target
    let depth = 0
    // 向上最多查找 15 层
    while (node && node !== document.body && depth < 15) {
        // 1. 优先看自身是否有 title 属性
        if (node.getAttribute && node.getAttribute('title')) {
            const t = node.getAttribute('title').trim()
            if (t.length > 0 && t.length < 500) return t
        }
        // 2. 在自身及子树中找带 title 的元素
        if (node.querySelector) {
            const titled = node.querySelector('[title]')
            if (titled) {
                const t = titled.getAttribute('title').trim()
                if (t.length > 0 && t.length < 500) return t
            }
        }
        node = node.parentElement
        depth++
    }
    // 兜底：从最近的"行"中提取最长文本
    node = target
    depth = 0
    while (node && node !== document.body && depth < 8) {
        // 找一个像"行"的容器：有多个兄弟节点
        if (node.parentElement && node.parentElement.children.length > 1) {
            const candidates = node.querySelectorAll ? node.querySelectorAll('*') : []
            let maxLen = 0
            let best = null
            for (const c of candidates) {
                if (c.children.length === 0) {
                    const t = (c.textContent || '').trim()
                    if (t.length > maxLen && t.length < 500) {
                        maxLen = t.length
                        best = t
                    }
                }
            }
            if (best) return best
        }
        node = node.parentElement
        depth++
    }
    return null
}

window.onload = function () {
    setInterval(() => {
        const statusBar = document.querySelector('.switch__status')
        // 容器存在且按钮不存在时才注入（切换菜单后容器会被重新渲染，需重新注入）
        if (statusBar !== null && document.querySelector('#nas-xunlei-openfolder-btn') === null) {
            statusBar.appendChild(parseElement('<div class="switch_item" style="margin-left: 50px" id="nas-xunlei-openfolder-btn"><button style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; background: #409eff; border: none; border-radius: 4px; color: white; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.3s ease;" onmouseover="this.style.background=\'#66b1ff\'" onmouseout="this.style.background=\'#409eff\'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9C21 7.89543 20.1046 7 19 7H12L10 5H5C3.89543 5 3 5.89543 3 7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>打开下载文件夹</span></button></div>'))
            document.querySelector('#nas-xunlei-openfolder-btn').addEventListener('click', () => {
                ipcRenderer.send('mainWindow-msg', {
                    action: "open-shared-path"
                })
            })
        }
    }, 1000)
    watchDesktop()
    injectContextMenuHandler()
    injectFolderIconHover()
}

// 任务项 hover 时将左侧图标替换为"打开的文件夹"图标，点击打开对应文件夹
function injectFolderIconHover() {
    if (window.__folderIconHoverInstalled) return
    window.__folderIconHoverInstalled = true

    // 打开的文件夹图标 SVG（蓝色系，与迅雷 UI 风格协调）
    var FOLDER_OPEN_SVG = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M2 6C2 4.89543 2.89543 4 4 4H9L11 6H20C21.1046 6 22 6.89543 22 8V11H2V6Z" fill="#409eff"/>'
        + '<path d="M22 11H2V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V11Z" fill="#66b1ff"/>'
        + '<path d="M22 11L19 8H2L5 11H22Z" fill="#a0cfff"/>'
        + '</svg>'

    // 判断任务项是否符合显示文件夹图标的条件
    function isTaskQualified(item) {
        var content = item.querySelector('.task-item__content')
        if (!content) return false

        // 下载中：进度 > 0，或处于"校验中"/"验证中"（此时进度条可能显示0%但文件已存在）
        if (content.classList.contains('ing')) {
            var progressInner = item.querySelector('.td-progress-bar__inner')
            var width = progressInner ? (progressInner.style.width || '0%') : '0%'
            var percent = parseInt(width.replace('%', ''), 10)
            if (percent > 0) return true
            // 校验中/验证中：文件已下载完成，应允许打开
            var statusEl = item.querySelector('.task-item__status')
            var statusText = statusEl ? statusEl.textContent.trim() : ''
            if (statusText.indexOf('校验') >= 0 || statusText.indexOf('验证') >= 0) return true
            return false
        }

        // 已完成：仅"下载完成"状态可打开（"文件不存在"/"已删除"等不可打开）
        if (content.classList.contains('done')) {
            // is-disabled class 标记文件不存在的任务
            if (item.classList.contains('is-disabled')) return false
            var statusEl = item.querySelector('.pan-list-item-status')
            var statusText = statusEl ? statusEl.textContent.trim() : ''
            // 只允许"下载完成"，排除"文件不存在"/"删除"等
            if (statusText !== '下载完成') return false
            return true
        }

        return false
    }

    // 从任务项提取文件名
    function getTaskFileName(item) {
        var nameEl = item.querySelector('.pan-list-item-name a, .pan-list-item-name')
        return nameEl ? nameEl.textContent.trim() : null
    }

    // 为单个任务项绑定 hover 行为
    function bindHoverBehavior(item) {
        if (item.__folderHoverBound) return
        item.__folderHoverBound = true

        item.addEventListener('mouseenter', function() {
            if (!isTaskQualified(item)) return
            var iconContainer = item.querySelector('.task-item__icon')
            if (!iconContainer) return
            var originalImg = iconContainer.querySelector('img')
            var folderIconEl = iconContainer.querySelector('.nas-folder-hover-icon')
            // 隐藏原图标
            if (originalImg) originalImg.style.display = 'none'
            // 创建或显示文件夹图标
            if (!folderIconEl) {
                folderIconEl = document.createElement('div')
                folderIconEl.className = 'nas-folder-hover-icon'
                folderIconEl.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;cursor:pointer;'
                folderIconEl.innerHTML = FOLDER_OPEN_SVG
                // 点击文件夹图标打开对应文件夹
                folderIconEl.addEventListener('click', function(e) {
                    e.stopPropagation()
                    e.preventDefault()
                    var fileName = getTaskFileName(item)
                    ipcRenderer.send('mainWindow-msg', {
                        action: 'open-file-folder',
                        data: { fileName: fileName }
                    })
                })
                iconContainer.appendChild(folderIconEl)
            }
            folderIconEl.style.display = 'flex'
            // 鼠标变手型
            item.style.cursor = 'pointer'
        })

        item.addEventListener('mouseleave', function() {
            var iconContainer = item.querySelector('.task-item__icon')
            if (!iconContainer) return
            var originalImg = iconContainer.querySelector('img')
            var folderIconEl = iconContainer.querySelector('.nas-folder-hover-icon')
            // 恢复原图标
            if (originalImg) originalImg.style.display = ''
            if (folderIconEl) folderIconEl.style.display = 'none'
            item.style.cursor = ''
        })
    }

    // 扫描并绑定所有任务项（带防抖，避免 MutationObserver 频繁触发）
    var scanTimer = null
    function scanAndBind() {
        if (scanTimer) clearTimeout(scanTimer)
        scanTimer = setTimeout(function() {
            var items = document.querySelectorAll('.task-item')
            for (var i = 0; i < items.length; i++) {
                bindHoverBehavior(items[i])
            }
        }, 100)
    }

    // MutationObserver 监听 DOM 变化（切换标签页/新任务/滚动都会重新渲染）
    var observer = new MutationObserver(scanAndBind)
    observer.observe(document.body, { childList: true, subtree: true })
    scanAndBind()
    console.log('[FOLDER HOVER] injection started')
}

// 在网页自定义的右键菜单上追加 "打开文件夹" 选项
function injectContextMenuHandler() {
    // 捕获右键事件，从 e.target 向上提取文件名
    // 同时：在输入框/文本域内右键时，阻止迅雷网页端的自定义右键菜单，
    // 让 Electron webContents 的 context-menu 事件能正常弹出原生菜单（含"粘贴"）。
    // 否则迅雷前端的 contextmenu handler 会 preventDefault 并显示自己的菜单（无粘贴项），
    // 盖住原生菜单，导致用户无法在弹层输入框里右键粘贴链接。
    document.addEventListener('contextmenu', (e) => {
        var t = e.target
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) {
            // 阻止迅雷前端的 contextmenu handler（stopPropagation 在捕获阶段可阻止冒泡阶段的监听器）
            e.stopImmediatePropagation()
            e.stopPropagation()
            // 不调用 preventDefault：让 Chromium 默认菜单被 Electron 的 context-menu 事件接管
        }
        lastContextFileName = extractFileNameFromTarget(e.target)
        console.log('contextmenu fileName captured:', lastContextFileName)
    }, true)

    // 确保在输入框/文本域内 cmd+v (mac) / ctrl+v (win) 能正常粘贴。
    // 迅雷前端可能全局监听 keydown 并对快捷键 preventDefault，导致原生粘贴失效。
    // 在捕获阶段拦截：若目标为可编辑元素，阻止事件继续传播到迅雷的 handler，
    // 但不 preventDefault，让浏览器/Electron 的原生粘贴行为正常执行。
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
            var t = e.target
            if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) {
                e.stopImmediatePropagation()
                e.stopPropagation()
            }
        }
    }, true)

    // 确保粘贴事件本身不被迅雷前端拦截。
    // 迅雷前端可能监听 paste 事件并 preventDefault（例如做自定义粘贴处理），
    // 导致 cmd+v 和 webContents.paste() 都无法将文本写入输入框。
    // 在捕获阶段拦截：若目标为可编辑元素，阻止事件传播到迅雷的 handler，
    // 不 preventDefault，让浏览器原生粘贴行为（插入剪贴板文本）正常执行。
    document.addEventListener('paste', (e) => {
        var t = e.target
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) {
            e.stopImmediatePropagation()
            e.stopPropagation()
        }
    }, true)

    // 使用 MutationObserver 监听菜单出现
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue
                // 在新插入的节点（及其子树）中查找"查看文件位置"项
                tryAppendOpenFolderItem(node)
            }
        }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    console.log('context menu observer started')
}

// 找到 "查看文件位置" 菜单项并在其后追加 "打开文件夹"
function tryAppendOpenFolderItem(rootNode) {
    // 查找所有可能的菜单项（通过文本匹配）
    const allElements = rootNode.querySelectorAll
        ? rootNode.querySelectorAll('*')
        : []

    let viewLocationItem = null
    for (const el of allElements) {
        // 只考虑叶子节点或文本节点容器（避免误匹配父容器）
        const text = (el.textContent || '').trim()
        if (text === '查看文件位置' && el.children.length === 0) {
            viewLocationItem = el
            break
        }
    }

    // 如果根节点本身就是"查看文件位置"
    if (!viewLocationItem && rootNode.nodeType === 1) {
        const text = (rootNode.textContent || '').trim()
        if (text === '查看文件位置') {
            viewLocationItem = rootNode
        }
    }

    if (!viewLocationItem) return

    // 找到承载该项的真正菜单项容器：向上查找直到找到与"重命名"等其他菜单项是兄弟关系的层级
    // 策略：先找到菜单容器（包含多个菜单项的父），再回到第一层子（即真正的菜单项）
    let menuItem = viewLocationItem
    let menuContainer = null
    
    // 向上查找包含多个兄弟项的容器（即菜单容器）
    let probe = viewLocationItem
    while (probe && probe.parentElement) {
        const parent = probe.parentElement
        // 如果父容器有多个子元素，且其中一个子元素的文本包含"重命名"或"删除任务"等，说明这是菜单容器
        if (parent.children.length > 1) {
            const siblingTexts = Array.from(parent.children).map(c => (c.textContent || '').trim())
            const hasMenuSiblings = siblingTexts.some(t => 
                t === '重命名' || t === '删除任务' || t === '复制链接' || t === '重新下载' || t === '任务详情页'
            )
            if (hasMenuSiblings) {
                menuContainer = parent
                menuItem = probe  // probe 此时就是真正的菜单项
                break
            }
        }
        probe = parent
    }
    
    // 如果没找到，说明 DOM 结构不同，把信息发回主进程让我们调试
    if (!menuContainer) {
        console.log('菜单容器未找到，输出DOM结构供调试')
        const debugInfo = []
        let p = viewLocationItem
        let depth = 0
        while (p && depth < 10) {
            debugInfo.push({
                depth,
                tag: p.tagName,
                class: p.className,
                childCount: p.children ? p.children.length : 0,
                outerHTMLSnippet: (p.outerHTML || '').substring(0, 500)
            })
            p = p.parentElement
            depth++
        }
        console.log('菜单容器未找到，输出DOM结构供调试', debugInfo)
        return
    }
    
    console.log('found menu container:', menuContainer, 'menuItem:', menuItem)

    // 防止重复添加
    if (menuContainer.querySelector('.nas-xunlei-open-folder-item')) {
        return
    }

    // 克隆该菜单项作为新项，完全复用其样式（包括布局）
    const newItem = menuItem.cloneNode(true)
    newItem.classList.add('nas-xunlei-open-folder-item')
    // 替换文本
    const textEls = newItem.querySelectorAll('*')
    let textReplaced = false
    for (const el of textEls) {
        if (el.children.length === 0 && (el.textContent || '').trim() === '查看文件位置') {
            el.textContent = '打开文件夹'
            textReplaced = true
            break
        }
    }
    if (!textReplaced) {
        newItem.textContent = '打开文件夹'
    }

    // 绑定点击事件
    newItem.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        console.log('open-folder clicked, fileName:', lastContextFileName)

        ipcRenderer.send('mainWindow-msg', {
            action: 'open-file-folder',
            data: { fileName: lastContextFileName }
        })

        // 关闭菜单
        document.body.click()
    }, true)

    // 插入到 "查看文件位置" 这一项后面
    if (menuItem.nextSibling) {
        menuContainer.insertBefore(newItem, menuItem.nextSibling)
    } else {
        menuContainer.appendChild(newItem)
    }
    console.log('「打开文件夹」 menu item appended')
}

function parseElement(htmlString) {
    return new DOMParser().parseFromString(htmlString, 'text/html').body.childNodes[0]
}

function watchDesktop() {

    let _id = setInterval(()=>{
        let _a = document.getElementById("sds-desktop");
        if (_a) {
            ipcRenderer.send('mainWindow-msg', {
                action: "desktop-ready"
            })
            clearInterval(_id)
        }

        if(window.location.href.indexOf("pan-xunlei-com") > 3) {
            ipcRenderer.send('mainWindow-msg', {
                action: "xunlei-ready"
            })
            clearInterval(_id)
        }

    },1000)
}

function addXunleiTask(_url) {
    if(null !== document.querySelector('.create__task')) {

    }
}
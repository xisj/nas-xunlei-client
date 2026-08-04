(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))l(t);new MutationObserver(t=>{for(const d of t)if(d.type==="childList")for(const i of d.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&l(i)}).observe(document,{childList:!0,subtree:!0});function n(t){const d={};return t.integrity&&(d.integrity=t.integrity),t.referrerPolicy&&(d.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?d.credentials="include":t.crossOrigin==="anonymous"?d.credentials="omit":d.credentials="same-origin",d}function l(t){if(t.ep)return;t.ep=!0;const d=n(t);fetch(t.href,d)}})();const f=document.getElementById("app");f.innerHTML=`
  <div class="page-shell">
    <main class="settings-card">
      <section class="panel">
        <div class="panel-header">
          <h2>Nas 迅雷设置中心</h2>
        </div>

        <div class="form-grid">
          <label class="field field-inline field-wide">
            <span class="field-label">Nas首页地址</span>
            <input id="nas-url" class="text-input" type="text" placeholder="例如：http://nas" />
          </label>

          <label class="field field-inline field-wide field-clickable">
            <span class="field-label">迅雷共享文件夹</span>
            <input id="nas-shared-path" class="text-input" type="text" placeholder="点击选择共享文件夹" readonly />
          </label>

          <label class="toggle-card" for="reg-protocol">
            <div>
              <div class="toggle-title">点击链接后自动弹窗</div>
              <div class="toggle-desc">注册协议后可直接拉起客户端添加任务。</div>
            </div>
            <div class="toggle-wrap">
              <input id="reg-protocol" class="native-switch" type="checkbox" checked />
              <span class="switch-ui"></span>
            </div>
          </label>

          <label class="toggle-card" for="show-speed-window">
            <div>
              <div class="toggle-title">显示速度球</div>
              <div class="toggle-desc">控制速度球的启动、显示与销毁。</div>
            </div>
            <div class="toggle-wrap">
              <input id="show-speed-window" class="native-switch" type="checkbox" checked />
              <span class="switch-ui"></span>
            </div>
          </label>
        </div>

        <div class="action-row">
          <button id="confirm-config" class="primary-button" type="button">保存配置</button>
          <button id="check-update" class="secondary-button" type="button">检查更新</button>
        </div>
      </section>
    </main>
  </div>
`;const a=document.getElementById("nas-shared-path");if(a){let s=!1,e=!1;document.addEventListener("keydown",n=>{n.key==="Tab"&&(s=!0)}),document.addEventListener("mousedown",()=>{s=!1}),document.addEventListener("focusin",n=>{n.target!==a&&(e=!1)}),a.addEventListener("focus",()=>{!s||e||(s=!1,e=!0,a.click())})}const{ipcRenderer:o}=window.require("electron");function c(s,e){const n=document.getElementById(s);n&&(n.value=e??"")}function r(s,e){const n=document.getElementById(s);n&&(n.checked=!!e,n.setAttribute("aria-checked",!!e))}o.on("mainWindow-msg",(s,e)=>{console.log("ui2 mainWindow-msg",e),e.action==="set-config"&&e.data?e.data.hasOwnProperty("nasURL")&&(c("nas-url",e.data.nasURL),c("nas-shared-path",e.data.sharedPath),e.data.hasOwnProperty("regProtocol")&&r("reg-protocol",e.data.regProtocol),e.data.hasOwnProperty("showSpeedWindow")&&r("show-speed-window",e.data.showSpeedWindow)):e.action==="confirm-shared-path"&&e.data&&e.data.filePaths&&c("nas-shared-path",e.data.filePaths)});const u=document.getElementById("confirm-config");u&&u.addEventListener("click",()=>{o.send("mainWindow-msg",{action:"confirm-config",data:{nasURL:document.getElementById("nas-url")?document.getElementById("nas-url").value:"",regProtocol:document.getElementById("reg-protocol")?document.getElementById("reg-protocol").checked:!1,sharedPath:document.getElementById("nas-shared-path")?document.getElementById("nas-shared-path").value:"",showSpeedWindow:document.getElementById("show-speed-window")?document.getElementById("show-speed-window").checked:!1}})});a&&a.addEventListener("click",()=>{o.send("mainWindow-msg",{action:"confirm-shared-path",data:{nasURL:document.getElementById("nas-url")?document.getElementById("nas-url").value:""}})});const p=document.getElementById("check-update");p&&p.addEventListener("click",()=>{o.send("mainWindow-msg",{action:"check-update"})});

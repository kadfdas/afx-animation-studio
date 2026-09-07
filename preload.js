/* ============================================================
 * preload.js — 预加载脚本
 * 在 contextIsolation 下，安全地向渲染进程暴露最小桌面 API：
 *  - window.electronAPI.saveFile(filePath, content)
 *  - 监听主进程菜单事件：new / open / save-request / playpause / stop
 *  - 在线更新：checkForUpdates / downloadUpdate / installUpdate
 * ============================================================ */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  onMenuNew: (cb) => ipcRenderer.on('menu:new', cb),
  onMenuOpen: (cb) => ipcRenderer.on('menu:open', (_, data) => cb(data)),
  onMenuSaveRequest: (cb) => ipcRenderer.on('menu:save-request', (_, filePath) => cb(filePath)),
  onMenuPlayPause: (cb) => ipcRenderer.on('menu:playpause', cb),
  onMenuStop: (cb) => ipcRenderer.on('menu:stop', cb),
  // 在线自动更新
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update')
});

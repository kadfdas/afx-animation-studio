/* ============================================================
 * main.js — Electron 主进程
 *  - 创建窗口、加载 index.html（file://）
 *  - 自定义应用菜单（文件/编辑/帮助）
 *  - 通过 preload 暴露原生「保存文件 / 打开文件」对话框
 *  - 窗口尺寸与位置记忆
 *  - 在线自动更新（electron-updater）
 * ============================================================ */
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 自动更新（打包后才生效；开发模式 require 失败时静默跳过）
let autoUpdater = null;
try {
  if (!app.isPackaged) {
    // 开发模式跳过，避免本地 file:// 无 latest.yml 报错
  } else {
    autoUpdater = require('electron-updater').autoUpdater;
  }
} catch (e) {
  console.warn('[updater] 模块加载失败，自动更新已禁用:', e.message);
}

const APP_NAME = 'AFX动画工坊';
const isDev = !app.isPackaged;

let mainWindow = null;
const windowState = {
  width: 1280,
  height: 800,
  x: undefined,
  y: undefined,
  maximized: false
};

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#16181d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 桌面应用允许音频/视频自动播放（不依赖用户手势），
      // 否则时间轴驱动的音频会被 Chromium autoplay 策略拦截
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  if (windowState.maximized) mainWindow.maximize();

  // 加载本地页面
  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 记录窗口状态
  ['resize', 'move'].forEach(evt => {
    mainWindow.on(evt, () => {
      if (mainWindow.isMaximized()) {
        windowState.maximized = true;
      } else {
        const b = mainWindow.getBounds();
        windowState.width = b.width;
        windowState.height = b.height;
        windowState.x = b.x;
        windowState.y = b.y;
        windowState.maximized = false;
      }
    });
  });

  mainWindow.on('close', () => {
    // 可在此持久化 windowState
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ---------------- 应用菜单 ---------------- */
function buildMenu() {
  const template = [];

  // macOS 首项为应用名（系统约定）
  if (process.platform === 'darwin') {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about', label: '关于 ' + APP_NAME },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    });
  }

  template.push({
    label: '文件',
      submenu: [
        {
          label: '新建项目',
          accelerator: 'CmdOrCtrl+N',
          click: () => { mainWindow && mainWindow.webContents.send('menu:new'); }
        },
        {
          label: '打开项目...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: '打开项目',
              filters: [{ name: 'AFX 场景', extensions: ['json'] }],
              properties: ['openFile']
            });
            if (!result.canceled && result.filePaths.length) {
              fs.readFile(result.filePaths[0], 'utf-8', (err, data) => {
                if (!err) mainWindow.webContents.send('menu:open', data);
              });
            }
          }
        },
        {
          label: '保存项目...',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              title: '保存项目',
              defaultPath: 'scene.afx.json',
              filters: [{ name: 'AFX 场景', extensions: ['json'] }]
            });
            if (!result.canceled && result.filePath) {
              mainWindow.webContents.send('menu:save-request', result.filePath);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
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
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '播放',
      submenu: [
        {
          label: '播放/暂停',
          accelerator: 'Space',
          click: () => { mainWindow && mainWindow.webContents.send('menu:playpause'); }
        },
        {
          label: '停止',
          accelerator: 'Shift+Space',
          click: () => { mainWindow && mainWindow.webContents.send('menu:stop'); }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 AFX 动画工坊',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: APP_NAME,
              detail: '版本 ' + app.getVersion() + '\n一个纯前端的网页动画编辑器桌面版。\n快捷键：空格 播放/暂停，Delete 删除选中，Esc 退出预览。'
            });
          }
        },
        {
          label: '检查更新...',
          click: () => checkForUpdates()
        }
      ]
    }
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- IPC：保存文件 ---------------- */
ipcMain.handle('save-file', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/* ---------------- IPC：弹保存对话框 ---------------- */
ipcMain.handle('show-save-dialog', async (event) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存项目',
    defaultPath: 'scene.afx.json',
    filters: [{ name: 'AFX 场景', extensions: ['json'] }]
  });
  return { canceled: result.canceled, filePath: result.filePath };
});

/* ---------------- IPC：弹打开对话框 ---------------- */
ipcMain.handle('show-open-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开项目',
    filters: [{ name: 'AFX 场景', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true, content: null };
  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { canceled: false, content };
  } catch (e) {
    return { canceled: false, content: null, error: e.message };
  }
});

/* ---------------- 在线自动更新 ---------------- */
function setupAutoUpdater() {
  if (!autoUpdater) return;  // 开发模式或模块缺失

  autoUpdater.autoDownload = false;          // 不自动下载，先提示用户
  autoUpdater.autoInstallOnAppQuit = true;   // 退出时自动安装已下载的更新

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `新版本 ${info.version} 已发布，是否下载更新？`,
      buttons: ['下载更新', '稍后']
    }).then(r => {
      if (r.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已下载',
      message: '更新已下载完成，重启后生效。是否立即重启？',
      buttons: ['立即重启', '稍后']
    }).then(r => {
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.warn('[updater] 检查更新失败:', err && err.message);
  });

  // 启动后延迟 3 秒检查，避免与窗口初始化争抢资源
  setTimeout(() => autoUpdater.checkForUpdates(), 3000);
}

/* 手动触发检查更新（菜单项 / IPC 调用） */
async function checkForUpdates() {
  if (!autoUpdater) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '检查更新',
      message: '当前为开发模式或未配置更新源，无法检查更新。'
    });
    return;
  }
  try {
    const r = await autoUpdater.checkForUpdates();
    if (r && !r.updateInfo) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本。'
      });
    }
  } catch (e) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '检查更新',
      message: '检查更新失败：' + (e.message || e)
    });
  }
}

/* ---------------- IPC：检查更新 ---------------- */
ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { available: false, reason: 'dev' };
  try {
    const r = await autoUpdater.checkForUpdates();
    return { available: !!r.updateInfo, version: r.updateInfo && r.updateInfo.version };
  } catch (e) { return { available: false, error: e.message }; }
});

ipcMain.on('download-update', () => {
  if (autoUpdater) autoUpdater.downloadUpdate();
});

ipcMain.on('install-update', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  setupAutoUpdater();   // 自动更新检查（打包后才生效）

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

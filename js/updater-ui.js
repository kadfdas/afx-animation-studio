/* ============================================================
 * updater-ui.js — 在线更新前端 UI
 * 检测 window.electronAPI.checkForUpdates 是否存在，
 * 在顶栏追加"检查更新"按钮。仿 electron-integration.js 模式。
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  // 仅桌面端 Electron 运行
  if (!window.electronAPI || !window.electronAPI.checkForUpdates) return;

  AFX.updater = {
    /* 初始化：在顶栏文件操作区后追加按钮 */
    init() {
      const fileOps = document.querySelector('.file-ops');
      if (!fileOps) {
        // DOM 未就绪，稍后重试
        setTimeout(() => AFX.updater.init(), 500);
        return;
      }
      // 避免重复添加
      if (document.getElementById('btnCheckUpdate')) return;

      const btn = document.createElement('button');
      btn.id = 'btnCheckUpdate';
      btn.className = 'obtn';
      btn.textContent = '检查更新';
      btn.title = '检查是否有新版本';
      btn.addEventListener('click', () => AFX.updater.check());
      fileOps.appendChild(btn);
    },

    /* 触发检查 */
    async check() {
      const btn = document.getElementById('btnCheckUpdate');
      if (btn) { btn.disabled = true; btn.textContent = '检查中...'; }

      try {
        const r = await window.electronAPI.checkForUpdates();
        if (r.reason === 'dev') {
          AFX.toast && AFX.toast('开发模式不支持更新检查', 2500);
        } else if (r.available) {
          // 主进程的 update-available 事件会弹窗确认
          AFX.toast && AFX.toast('发现新版本 ' + r.version, 3000);
        } else if (r.error) {
          AFX.toast && AFX.toast('检查失败: ' + r.error, 3000);
        } else {
          AFX.toast && AFX.toast('已是最新版本', 2000);
        }
      } catch (e) {
        AFX.toast && AFX.toast('检查更新失败: ' + (e.message || e), 3000);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '检查更新'; }
      }
    }
  };

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AFX.updater.init());
  } else {
    AFX.updater.init();
  }
})();

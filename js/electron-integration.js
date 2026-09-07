/* ============================================================
 * electron-integration.js — 桌面端集成（仅在 Electron 环境生效）
 *  - 监听主进程菜单事件：新建 / 打开 / 保存 / 播放 / 停止
 *  - 保存时优先使用原生对话框（electronAPI），无则回退浏览器下载
 * ============================================================ */
(function () {
  'use strict';
  if (!window.electronAPI) return;   // 非 Electron 环境，跳过

  const api = window.electronAPI;

  /* ---------- 保存：使用原生对话框 ---------- */
  window.AFX.saveToFile = async function (filePath) {
    const data = AFX.serializeScene(AFX.state.scene);
    if (filePath) {
      const r = await api.saveFile(filePath, data);
      if (!r.ok) alert('保存失败：' + r.error);
      return r.ok;
    }
    return false;
  };

  /* ---------- 打开：直接用主进程传来的 JSON 字符串 ---------- */
  window.AFX.loadFromText = function (text) {
    try {
      AFX.state.scene = AFX.normalizeScene(JSON.parse(text));
      AFX.state.sel = null;
      AFX.stop();
      // 重新绑定全局设置输入框
      const w = document.getElementById('setWidth');
      const h = document.getElementById('setHeight');
      const d = document.getElementById('setDuration');
      const b = document.getElementById('setBg');
      if (w) w.value = AFX.state.scene.meta.width;
      if (h) h.value = AFX.state.scene.meta.height;
      if (d) d.value = AFX.state.scene.meta.duration;
      if (b) b.value = AFX.state.scene.meta.background;
      AFX.refreshAll();
      return true;
    } catch (err) {
      alert('打开失败：' + err.message);
      return false;
    }
  };

  /* ---------- 菜单事件监听 ---------- */
  api.onMenuNew(() => {
    if (!confirm('新建将清空当前场景，确定继续？')) return;
    AFX.state.scene = AFX.emptyScene();
    AFX.state.sel = null;
    AFX.stop();
    AFX.refreshAll();
  });

  api.onMenuOpen((text) => {
    AFX.loadFromText(text);
  });

  api.onMenuSaveRequest((filePath) => {
    AFX.saveToFile(filePath);
  });

  api.onMenuPlayPause(() => {
    AFX.state.playing ? AFX.pause() : AFX.play();
  });

  api.onMenuStop(() => {
    AFX.stop();
  });

  /* ---------- 接管顶部「保存 JSON」/「导入 JSON」按钮：使用原生对话框 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const btnSave = document.getElementById('btnSave');
    const btnLoad = document.getElementById('btnLoad');
    if (btnSave) {
      // 移除原有点击监听器（通过克隆节点），绑定原生对话框流程
      const newSave = btnSave.cloneNode(true);
      btnSave.parentNode.replaceChild(newSave, btnSave);
      newSave.addEventListener('click', async () => {
        const r = await api.showSaveDialog();
        if (!r.canceled && r.filePath) await AFX.saveJSON(r.filePath);
      });
    }
    if (btnLoad) {
      const newLoad = btnLoad.cloneNode(true);
      btnLoad.parentNode.replaceChild(newLoad, btnLoad);
      newLoad.addEventListener('click', async () => {
        const r = await api.showOpenDialog();
        if (!r.canceled && r.content) AFX.loadFromText(r.content);
      });
    }
  });
})();

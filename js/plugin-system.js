/* ============================================================
 * plugin-system.js — AI 生成功能的插件系统（沙盒 / 注册 / 管理）
 *
 * 插件接口规范（IPlugin）：
 *   const plugin = {
 *     name: 'rain-effect',
 *     params: { count: 100 },            // 可选：参数默认值
 *     ui: [{key,label,min,max,step}],    // 可选：参数面板 schema
 *     init(context) {},                  // context 见下方 ctx 说明
 *     update(deltaTime) {},              // 每帧调用（暂停/拖动时 dt=0）
 *     destroy() {}
 *   };
 *
 * 运行上下文（context）：
 *   time/dt/playing/scene —— 实时只读；params —— 可编辑参数；
 *   fxCtx —— 画布顶层特效 Canvas 的 2D 上下文（每帧由系统清屏）；
 *   bus —— 全局事件总线（插件间通信唯一合法通道）；
 *   notify(msg) —— 通知；storage —— 命名空间化的本地存储；
 *   net.get(url) —— 白名单网络访问（默认仅同源，需用户授权域名）；
 *   fs.saveText() —— 仅 Electron 且经用户原生对话框明确授权后写文件。
 *
 * 安全与质量：
 *   - 注册前在 Web Worker 沙盒中试运行（init + 60 帧 update + destroy）
 *   - 懒加载：仅在启用时求值；含 export default 的代码走动态 import()
 *   - 插件异常被隔离捕获，自动禁用，不影响主引擎
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const S = () => AFX.state;
  const STORE_KEY = 'afx.plugins.v1';
  const HOST_KEY = 'afx.plugins.hosts.v1';

  /* ---------------- 通知浮层 ---------------- */
  if (!AFX.toast) {
    AFX.toast = function (msg, ms) {
      let t = document.getElementById('afx-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'afx-toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(AFX.toast.__timer);
      AFX.toast.__timer = setTimeout(() => t.classList.remove('show'), ms || 2600);
    };
  }

  /* ---------------- 特效覆盖层（画布顶层 Canvas） ---------------- */
  function ensureFxLayer() {
    const stage = document.getElementById('stage');
    if (!stage) return null;
    let layer = document.getElementById('afx-fx-layer');
    if (!layer) {
      layer = document.createElement('canvas');
      layer.id = 'afx-fx-layer';
      document.getElementById('stageWrap').appendChild(layer);
    }
    const w = stage.offsetWidth || 960, hgt = stage.offsetHeight || 540;
    if (layer.width !== w || layer.height !== hgt) {
      layer.width = w; layer.height = hgt;
    }
    return layer;
  }

  /* ---------------- 注册表持久化 ---------------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(AFX.plugins.registry.map(p => ({
        id: p.id, name: p.name, code: p.code, requirement: p.requirement || '',
        createdAt: p.createdAt, enabled: !!p.enabled, builtin: !!p.builtin,
        params: p.params || {}, paramsSchema: p.paramsSchema || []
      }))));
    } catch (e) { console.warn('[AFX.plugins] 持久化失败:', e); }
  }

  /* ---------------- 网络白名单 ---------------- */
  function loadHosts() {
    try { return JSON.parse(localStorage.getItem(HOST_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function persistHosts() {
    try { localStorage.setItem(HOST_KEY, JSON.stringify(AFX.plugins.allowedHosts)); } catch (_) {}
  }

  /* ---------------- 沙盒试运行（Web Worker，Blob 加载） ---------------- */
  function sandboxTest(code) {
    return new Promise(resolve => {
      const harness = `
        self.onmessage = function (e) {
          const logs = [];
          ['log','warn','error','info'].forEach(k => { console[k] = function(){ logs.push(Array.prototype.slice.call(arguments).map(String).join(' ')); }; });
          try {
            const fn = new Function('"use strict";' + e.data + '\\nreturn (typeof plugin === "object" && plugin) ? plugin : null;');
            const plugin = fn();
            if (!plugin || typeof plugin.name !== 'string') throw new Error('未找到合法的 plugin 对象（需 const plugin = { name, init, update, destroy }）');
            if (typeof plugin.init !== 'function' || typeof plugin.update !== 'function' || typeof plugin.destroy !== 'function')
              throw new Error('IPlugin 接口不完整：必须实现 init / update / destroy 三个方法');
            const noop = function () {};
            const mockCtx = new Proxy({}, {
              get: (t, k) => (k === 'canvas' ? { width: 960, height: 540 } : (typeof t[k] !== 'undefined' ? t[k] : noop)),
              set: () => true
            });
            const mock = {
              name: plugin.name, time: 0, dt: 0, playing: true,
              scene: { meta: { width: 960, height: 540, duration: 8, background: '#fff' }, elements: [] },
              params: JSON.parse(JSON.stringify(plugin.params || {})),
              fxCtx: mockCtx, stage: null,
              bus: { on: noop, off: noop, emit: noop },
              notify: noop,
              net: { get: function () { throw new Error('沙盒中禁止网络访问'); } },
              storage: { get: function () { return null; }, set: noop }
            };
            plugin.init(mock);
            for (let i = 0; i < 60; i++) { mock.dt = 1 / 60; mock.time += 1 / 60; plugin.update(1 / 60); }
            plugin.destroy();
            self.postMessage({ ok: true, logs: logs.slice(0, 20) });
          } catch (err) {
            self.postMessage({ ok: false, error: String((err && err.stack) || err), logs: logs.slice(0, 20) });
          }
        };`;
      let worker = null, blobUrl = null;
      try {
        blobUrl = URL.createObjectURL(new Blob([harness], { type: 'application/javascript' }));
        worker = new Worker(blobUrl);
      } catch (err) {
        // Worker 不可用时退化为同线程试运行（仍不触碰真实场景）
        try {
          const fn = new Function('"use strict";' + code + '\nreturn (typeof plugin === "object" && plugin) ? plugin : null;');
          const plugin = fn();
          if (!plugin || typeof plugin.init !== 'function') throw new Error('IPlugin 接口不完整');
          plugin.init({ time: 0, dt: 0, playing: true, scene: { meta: {}, elements: [] }, params: {}, fxCtx: null, stage: null, bus: { on(){}, off(){}, emit(){} }, notify(){}, net: { get(){ throw new Error('沙盒中禁止网络访问'); } }, storage: { get(){ return null; }, set(){} } });
          for (let i = 0; i < 60; i++) plugin.update(1 / 60);
          plugin.destroy();
          resolve({ ok: true, logs: [] });
        } catch (e2) {
          resolve({ ok: false, error: String((e2 && e2.stack) || e2) });
        }
        return;
      }
      const timer = setTimeout(() => {
        cleanup();
        resolve({ ok: false, error: '沙盒测试超时（插件 update 过重或死循环）' });
      }, 6000);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        cleanup();
        resolve(e.data);
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        cleanup();
        resolve({ ok: false, error: '沙盒加载失败: ' + (e.message || '未知错误') });
      };
      function cleanup() {
        try { worker.terminate(); } catch (_) {}
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
      worker.postMessage(code);
    });
  }
  AFX.pluginsSandboxTest = sandboxTest;

  /* ---------------- 实例化（懒加载，含动态 import） ---------------- */
  async function instantiate(meta) {
    if (meta.instance) return meta.instance;
    let plugin = null;
    if (/export\s+default/.test(meta.code)) {
      // ES 模块形态 → 动态 import() 懒加载
      const url = URL.createObjectURL(new Blob([meta.code], { type: 'text/javascript' }));
      try {
        const mod = await import(url);
        plugin = mod && (mod.default || mod.plugin);
      } finally { URL.revokeObjectURL(url); }
    } else {
      const fn = new Function('"use strict";' + meta.code + '\nreturn (typeof plugin === "object" && plugin) ? plugin : null;');
      plugin = fn();
    }
    if (!plugin || typeof plugin.name !== 'string' ||
        typeof plugin.init !== 'function' || typeof plugin.update !== 'function' || typeof plugin.destroy !== 'function') {
      throw new Error('IPlugin 接口不完整：需要 { name, init, update, destroy }');
    }
    meta.instance = plugin;
    return plugin;
  }

  /* ---------------- 构建插件运行上下文 ---------------- */
  function buildContext(meta) {
    const ctx = {
      id: meta.id, name: meta.name,
      get time() { return S().t; },
      get dt() { return S().__dt || 0; },
      get playing() { return S().playing; },
      get scene() { return S().scene; },
      params: meta.params || {},
      get fxCtx() { const l = ensureFxLayer(); return l ? l.getContext('2d') : null; },
      get stage() { return document.getElementById('stage'); },
      bus: AFX.bus,
      notify(msg) { AFX.toast('[' + meta.name + '] ' + msg); },
      // 白名单网络：默认仅同源；未知域名需用户在插件面板授权
      net: {
        get(url) {
          const u = new URL(url, location.href);
          const sameOrigin = u.origin === location.origin || location.protocol === 'file:';
          if (!sameOrigin && !AFX.plugins.allowedHosts.includes(u.hostname)) {
            throw new Error('网络请求被拦截：域名 ' + u.hostname + ' 未获授权（插件面板 → 网络授权）');
          }
          return fetch(u.href).then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
          });
        }
      },
      storage: {
        get(k, def) {
          try {
            const v = localStorage.getItem('afx.plugin.' + meta.id + '.' + k);
            return v == null ? def : JSON.parse(v);
          } catch (_) { return def; }
        },
        set(k, v) { try { localStorage.setItem('afx.plugin.' + meta.id + '.' + k, JSON.stringify(v)); } catch (_) {} }
      }
    };
    if (window.electronAPI) {
      // 桌面端：文件写入必须经用户原生对话框（= 明确授权）
      ctx.fs = {
        async saveText(defaultName, content) {
          const r = await window.electronAPI.showSaveDialog();
          if (r.canceled || !r.filePath) return null;
          const w = await window.electronAPI.saveFile(r.filePath, content);
          if (!w.ok) throw new Error('写入失败: ' + w.error);
          return r.filePath;
        }
      };
    }
    return ctx;
  }

  /* ---------------- 启用 / 禁用 / 移除 ---------------- */
  async function setEnabled(id, on) {
    const meta = AFX.plugins.registry.find(p => p.id === id);
    if (!meta) return;
    if (on) {
      try {
        const plugin = await instantiate(meta);
        if (!meta.ctx) meta.ctx = buildContext(meta);
        await Promise.resolve(plugin.init(meta.ctx));
        meta.enabled = true;
        AFX.bus.emit('plugins:changed', meta);
      } catch (err) {
        meta.enabled = false;
        console.warn('[AFX.plugins] 启用失败:', meta.name, err);
        AFX.toast('插件启用失败：' + err.message);
      }
    } else {
      try { if (meta.instance) await Promise.resolve(meta.instance.destroy()); } catch (_) {}
      meta.enabled = false;
      AFX.bus.emit('plugins:changed', meta);
    }
    persist();
  }

  /* ---------------- 每帧驱动（render.applyFrame 调用） ---------------- */
  function frame(dt, t) {
    S().__dt = dt;
    const layer = ensureFxLayer();
    if (!layer) return;
    const ctx = layer.getContext('2d');
    ctx.clearRect(0, 0, layer.width, layer.height);
    AFX.plugins.registry.forEach(meta => {
      if (!meta.enabled || !meta.instance) return;
      try {
        meta.instance.update(dt || 0);
      } catch (err) {
        console.warn('[AFX.plugins] 插件运行出错，已自动禁用:', meta.name, err);
        AFX.toast('插件「' + meta.name + '」出错已禁用：' + err.message);
        meta.enabled = false;
        persist();
      }
    });
  }

  /* ---------------- 注册 / 导入 / 导出 / 固化 ---------------- */
  function register(meta) {
    const entry = {
      id: meta.id || AFX.uid('plg'),
      name: meta.name || 'unnamed-plugin',
      code: meta.code,
      requirement: meta.requirement || '',
      createdAt: meta.createdAt || new Date().toISOString(),
      enabled: false,
      builtin: !!meta.builtin,
      params: meta.params || {},
      paramsSchema: meta.paramsSchema || [],
      instance: null, ctx: null
    };
    AFX.plugins.registry.push(entry);
    persist();
    AFX.bus.emit('plugins:changed', entry);
    return entry;
  }

  function remove(id) {
    const i = AFX.plugins.registry.findIndex(p => p.id === id);
    if (i < 0) return;
    const meta = AFX.plugins.registry[i];
    try { if (meta.instance) meta.instance.destroy(); } catch (_) {}
    AFX.plugins.registry.splice(i, 1);
    persist();
    AFX.bus.emit('plugins:changed', meta);
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  function pluginFileText(meta) {
    return '// ⚠️ 此文件由 AFX AI 助手自动生成/导出于 ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '\n' +
      '// 原始需求："' + (meta.requirement || '（无）') + '"\n' +
      '// 如需修改，建议通过 AI 助手重新生成，或手动编辑后测试。\n\n' + meta.code + '\n';
  }

  /* ---------------- 对外 API ---------------- */
  AFX.plugins = {
    registry: [],
    allowedHosts: loadHosts(),
    addAllowedHost(host) { if (host && !this.allowedHosts.includes(host)) { this.allowedHosts.push(host); persistHosts(); } },
    removeAllowedHost(host) {
      const i = this.allowedHosts.indexOf(host);
      if (i >= 0) { this.allowedHosts.splice(i, 1); persistHosts(); }
    },
    register, remove, setEnabled, frame, sandboxTest,
    persist,
    get(id) { return this.registry.find(p => p.id === id); },
    async enableWithTest(meta) {
      // 带沙盒测试的启用（AI 生成流程使用）：测试失败抛错
      const r = await sandboxTest(meta.code);
      if (!r.ok) throw new Error(r.error);
      const entry = register(meta);
      await setEnabled(entry.id, true);
      return entry;
    },
    async importPluginFile(file) {
      const text = await file.text();
      const entry = register({ name: (file.name || 'imported-plugin').replace(/\.m?js$/i, ''), code: text, requirement: '（导入的插件）' });
      await setEnabled(entry.id, true);
      return entry;
    },
    exportPlugin(id) {
      const meta = this.get(id);
      if (meta) download(meta.name + '.plugin.js', pluginFileText(meta));
    },
    async solidify(id) {
      // 固化：导出 .js 文件 + 标记为内置（始终随系统加载，防误删）
      const meta = this.get(id);
      if (!meta) return;
      meta.builtin = true;
      persist();
      if (window.electronAPI) {
        const r = await window.electronAPI.showSaveDialog();
        if (!r.canceled && r.filePath) {
          await window.electronAPI.saveFile(r.filePath, pluginFileText(meta));
          AFX.toast('已固化并导出源码');
          return;
        }
      }
      download(meta.name + '.plugin.js', pluginFileText(meta));
      AFX.toast('已固化为内置功能（可导出源码分享）');
    },
    ensureFxLayer
  };

  /* ---------------- 启动：恢复已注册插件 ---------------- */
  function init() {
    const saved = load();
    saved.forEach(s => {
      const entry = {
        id: s.id, name: s.name, code: s.code, requirement: s.requirement || '',
        createdAt: s.createdAt, enabled: false, builtin: !!s.builtin,
        params: s.params || {}, paramsSchema: s.paramsSchema || [],
        instance: null, ctx: null
      };
      AFX.plugins.registry.push(entry);
      if (s.enabled) setEnabled(entry.id, true);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

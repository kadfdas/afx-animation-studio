/* ============================================================
 * eventbus.js — 全局事件总线
 * 模块间（含 AI 生成插件）通过 bus 通信，禁止直接互相引用。
 *   AFX.bus.on(evt, fn) / off(evt, fn) / emit(evt, payload)
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const map = new Map();   // evt -> Set<fn>

  AFX.bus = {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => AFX.bus.off(evt, fn);
    },
    off(evt, fn) {
      const s = map.get(evt);
      if (s) s.delete(fn);
    },
    emit(evt, payload) {
      const s = map.get(evt);
      if (!s) return;
      // 拷贝一份，允许回调中安全 on/off
      Array.from(s).forEach(fn => {
        try { fn(payload); } catch (err) { console.warn('[AFX.bus] 事件处理器出错:', evt, err); }
      });
    }
  };
})();

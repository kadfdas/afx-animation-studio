/* ============================================================
 * eventbus.js — 全局事件总线（桌面端/移动端共享）
 * ============================================================ */

function createBus() {
  const map = new Map();

  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => this.off(evt, fn);
    },
    off(evt, fn) {
      const s = map.get(evt);
      if (s) s.delete(fn);
    },
    emit(evt, payload) {
      const s = map.get(evt);
      if (!s) return;
      Array.from(s).forEach(fn => {
        try { fn(payload); } catch (err) {
          console.warn('[bus] 事件处理器出错:', evt, err);
        }
      });
    },
    clear() { map.clear(); }
  };
}

module.exports = { createBus };

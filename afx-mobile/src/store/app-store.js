/* ============================================================
 * app-store.js — 全局状态管理（zustand，替代桌面端 AFX.state）
 * ============================================================ */
import { create } from 'zustand';
import { easing } from 'afx-core';

// 默认场景（与桌面端 scene.js 的 emptyScene 对应）
function emptyScene() {
  return {
    version: 2,
    meta: { name: '新项目', duration: 10, fps: 30, bg: '#16181d' },
    env: { wind: { masterStrength: 1, masterSpeed: 1, gustiness: 0.5 } },
    elements: []
  };
}

export const useAppStore = create((set, get) => ({
  // 场景数据
  scene: emptyScene(),
  sel: null,         // 选中元素 id
  t: 0,              // 当前播放时间
  playing: false,

  // 设置场景
  setScene(scene) { set({ scene, sel: null, t: 0, playing: false }); },

  // 选中元素
  select(id) { set({ sel: id }); },

  // 播放控制
  play() { set({ playing: true }); },
  pause() { set({ playing: false }); },
  stop() { set({ playing: false, t: 0 }); },
  seek(t) { set({ t: Math.max(0, t) }); },

  // 更新时间（由 requestAnimationFrame 驱动）
  tick(t) {
    const { scene, playing } = get();
    if (!playing) return;
    if (t >= scene.meta.duration) { set({ playing: false, t: scene.meta.duration }); return; }
    set({ t });
  },

  // 云同步状态
  cloudConfig: { serverUrl: '', token: null, user: null },
  setCloudConfig(cfg) { set({ cloudConfig: { ...get().cloudConfig, ...cfg } }); },
}));

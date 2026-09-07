/* ============================================================
 * afx-core/index.js — 统一导出桌面端和移动端共享的核心模块
 * ============================================================ */

const { easing, EASING_LABELS } = require('./lib/easing');
const { createBus } = require('./lib/eventbus');
const { createCloudSync } = require('./lib/cloud-sync-core');

module.exports = {
  easing,
  EASING_LABELS,
  createBus,
  createCloudSync,

  // 版本信息
  version: '1.0.0',
  platform: typeof window !== 'undefined' ? 'web' : 'mobile'
};

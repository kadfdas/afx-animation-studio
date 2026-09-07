/* ============================================================
 * services/cloud-sync.js — 云同步服务（复用 afx-core 的 cloud-sync-core）
 * ============================================================ */
import { createCloudSync } from 'afx-core';
import { useAppStore } from '../store/app-store';

export const cloud = createCloudSync(
  () => useAppStore.getState().cloudConfig,
  (cfg) => useAppStore.getState().setCloudConfig(cfg)
);

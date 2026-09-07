/* ============================================================
 * cloud-sync.js — 云端同步核心模块
 * 不改动现有 14 个 JS 文件，仿 electron-integration.js 模式
 * 挂载到 AFX.cloud，复用 serializeScene/normalizeScene/bus/toast
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const STORE_KEY = 'afx.cloud.config';
  const S = () => AFX.state;

  AFX.cloud = {
    config: { serverUrl: '', token: null, user: null },

    /* ---- 配置持久化（localStorage） ---- */
    load() {
      try {
        Object.assign(this.config, JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
      } catch (e) {}
    },
    save() {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.config));
    },
    get isLoggedIn() { return !!this.config.token; },

    /* ---- 底层请求（复用 ai.js 的 fetch + AbortController 模式） ---- */
    async request(method, path, body) {
      if (!this.config.serverUrl) throw new Error('未配置服务器地址');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        const res = await fetch(this.config.serverUrl + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.token ? { Authorization: 'Bearer ' + this.config.token } : {})
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal
        });
        const data = await res.json();
        if (!res.ok) {
          const err = new Error(data.error || ('HTTP ' + res.status));
          err.status = res.status;
          err.serverData = data.server_data;
          err.serverVersion = data.server_version;
          throw err;
        }
        return data;
      } finally { clearTimeout(timer); }
    },

    /* ---- 认证 ---- */
    async register(username, password, email) {
      const r = await this.request('POST', '/api/auth/register', { username, password, email });
      this.config.token = r.token;
      this.config.user = r.user;
      this.save();
      if (AFX.bus) AFX.bus.emit('cloud:login', r.user);
      return r;
    },

    async login(username, password) {
      const r = await this.request('POST', '/api/auth/login', { username, password });
      this.config.token = r.token;
      this.config.user = r.user;
      this.save();
      if (AFX.bus) AFX.bus.emit('cloud:login', r.user);
      return r;
    },

    logout() {
      this.config.token = null;
      this.config.user = null;
      this.save();
      if (AFX.bus) AFX.bus.emit('cloud:logout');
    },

    /* ---- 项目同步（复用 serializeScene / normalizeScene） ---- */
    async saveProject() {
      if (!this.isLoggedIn) throw new Error('未登录');
      const scene = S().scene;
      // 生成或复用云端项目 ID
      if (!scene.meta.cloud_id) scene.meta.cloud_id = 'afx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const projectId = scene.meta.cloud_id;
      const data = JSON.parse(AFX.serializeScene(scene));
      const version = scene.meta.cloud_version || 1;

      try {
        // 先尝试 PUT（更新已有项目）
        const r = await this.request('PUT', '/api/projects/' + projectId, { data, version });
        scene.meta.cloud_version = r.version;
        if (AFX.bus) AFX.bus.emit('cloud:synced', { id: projectId, version: r.version });
        if (AFX.toast) AFX.toast('已同步到云端 (v' + r.version + ')', 2000);
        return r;
      } catch (err) {
        if (err.status === 409) {
          // 冲突：通过 EventBus 广播，由 UI 处理
          if (AFX.bus) AFX.bus.emit('cloud:conflict', {
            projectId,
            serverVersion: err.serverVersion,
            serverData: err.serverData,
            localData: data
          });
          throw err;
        } else if (err.status === 404) {
          // 项目不存在 → 首次上传，POST 创建
          const r2 = await this.request('POST', '/api/projects', {
            id: projectId, name: data.meta.name, data
          });
          scene.meta.cloud_version = r2.version;
          if (AFX.bus) AFX.bus.emit('cloud:synced', { id: projectId, version: r2.version });
          if (AFX.toast) AFX.toast('已保存到云端 (v' + r2.version + ')', 2000);
          return r2;
        } else {
          if (AFX.toast) AFX.toast('同步失败: ' + err.message, 3000);
          throw err;
        }
      }
    },

    async loadProject(id) {
      if (!this.isLoggedIn) throw new Error('未登录');
      const r = await this.request('GET', '/api/projects/' + id);
      // 复用 normalizeScene，与本地打开 JSON 完全相同路径
      S().scene = AFX.normalizeScene(r.data);
      S().scene.meta.cloud_id = id;
      S().scene.meta.cloud_version = r.version;
      S().sel = null;
      if (AFX.stop) AFX.stop();
      if (AFX.refreshAll) AFX.refreshAll();
      if (AFX.bus) AFX.bus.emit('cloud:loaded', { id, name: r.name });
      if (AFX.toast) AFX.toast('已从云端加载: ' + r.name, 2000);
      return r;
    },

    async listProjects() {
      if (!this.isLoggedIn) throw new Error('未登录');
      return this.request('GET', '/api/projects');
    },

    async deleteProject(id) {
      await this.request('DELETE', '/api/projects/' + id);
      if (AFX.toast) AFX.toast('已删除云端项目', 2000);
    },

    /* 冲突解决：用本地覆盖服务端 */
    async forceOverwrite(projectId) {
      const scene = S().scene;
      const data = JSON.parse(AFX.serializeScene(scene));
      const r = await this.request('PUT', '/api/projects/' + projectId, { data, version: scene.meta.cloud_version || 1 });
      scene.meta.cloud_version = r.version;
      if (AFX.toast) AFX.toast('已用本地版本覆盖云端 (v' + r.version + ')', 2000);
    },

    /* 冲突解决：用服务端覆盖本地 */
    async useServerVersion(projectId, serverData, serverVersion) {
      S().scene = AFX.normalizeScene(serverData);
      S().scene.meta.cloud_id = projectId;
      S().scene.meta.cloud_version = serverVersion;
      S().sel = null;
      if (AFX.stop) AFX.stop();
      if (AFX.refreshAll) AFX.refreshAll();
      if (AFX.toast) AFX.toast('已使用云端版本', 2000);
    }
  };

  AFX.cloud.load();
})();

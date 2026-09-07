/* ============================================================
 * cloud-sync-core.js — 云同步核心请求逻辑（桌面端/移动端共享）
 * 无 DOM 依赖，fetch 是浏览器和 RN 都有的全局 API
 * ============================================================ */

function createCloudSync(getConfig, setConfig) {
  return {
    get isLoggedIn() { return !!getConfig().token; },

    async request(method, path, body) {
      const config = getConfig();
      if (!config.serverUrl) throw new Error('未配置服务器地址');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        const res = await fetch(config.serverUrl + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(config.token ? { Authorization: 'Bearer ' + config.token } : {})
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

    async register(username, password, email) {
      const r = await this.request('POST', '/api/auth/register', { username, password, email });
      setConfig({ ...getConfig(), token: r.token, user: r.user });
      return r;
    },

    async login(username, password) {
      const r = await this.request('POST', '/api/auth/login', { username, password });
      setConfig({ ...getConfig(), token: r.token, user: r.user });
      return r;
    },

    logout() {
      setConfig({ ...getConfig(), token: null, user: null });
    },

    async listProjects() {
      return this.request('GET', '/api/projects');
    },

    async getProject(id) {
      return this.request('GET', '/api/projects/' + id);
    },

    async createProject(id, name, data) {
      return this.request('POST', '/api/projects', { id, name, data });
    },

    async updateProject(id, data, version) {
      return this.request('PUT', '/api/projects/' + id, { data, version });
    },

    async deleteProject(id) {
      return this.request('DELETE', '/api/projects/' + id);
    }
  };
}

module.exports = { createCloudSync };

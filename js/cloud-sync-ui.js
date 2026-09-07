/* ============================================================
 * cloud-sync-ui.js — 云同步 UI（右侧面板"云同步"Tab）
 * 仿 ai-panel.js 模式：h() DOM 构建 + 深色主题
 * 未登录 → 登录/注册表单；已登录 → 项目列表 + 保存/加载/删除
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const h = (tag, attrs, ...children) => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'style') el.style.cssText = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else el.setAttribute(k, attrs[k]);
      }
    }
    children.flat().forEach(c => {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  };

  /* ---- 初始化 Tab 按钮 ---- */
  function initTab() {
    const bar = document.getElementById('panelTabs');
    if (!bar || document.getElementById('cloudTabBtn')) return;

    const btn = h('button', { class: 'ptab', id: 'cloudTabBtn', 'data-tab': 'cloudPanel' }, '云同步');
    bar.appendChild(btn);

    const page = h('div', { id: 'cloudPanel', class: 'tab-page' });
    document.getElementById('rightPanel').appendChild(page);

    btn.addEventListener('click', () => {
      bar.querySelectorAll('.ptab').forEach(b => b.classList.toggle('active', b === btn));
      ['propPanel', 'aiPanel', 'pluginPanel', 'cloudPanel'].forEach(id => {
        const p = document.getElementById(id);
        if (p) p.classList.toggle('active', id === 'cloudPanel');
      });
      render();
    });
  }

  /* ---- 渲染面板 ---- */
  function render() {
    const panel = document.getElementById('cloudPanel');
    if (!panel) return;
    panel.innerHTML = '';

    if (AFX.cloud && AFX.cloud.isLoggedIn) {
      renderLoggedIn(panel);
    } else {
      renderLoginForm(panel);
    }
  }

  /* ---- 未登录：登录/注册表单 ---- */
  function renderLoginForm(panel) {
    const serverUrl = (AFX.cloud.config.serverUrl) || 'http://127.0.0.1:3000';
    const isRegister = { v: false };

    const urlInput = h('input', { type: 'text', value: serverUrl, placeholder: '服务器地址', style: 'width:100%;margin-bottom:8px;' });
    const userInput = h('input', { type: 'text', placeholder: '用户名', style: 'width:100%;margin-bottom:8px;' });
    const passInput = h('input', { type: 'password', placeholder: '密码', style: 'width:100%;margin-bottom:8px;' });
    const modeBtn = h('button', { class: 'obtn', style: 'font-size:11px;margin-bottom:8px;', onclick: () => {
      isRegister.v = !isRegister.v;
      modeBtn.textContent = isRegister.v ? '切换到登录' : '切换到注册';
      submitBtn.textContent = isRegister.v ? '注册' : '登录';
    } }, '切换到注册');

    const submitBtn = h('button', { class: 'obtn primary', style: 'width:100%;' }, '登录');
    submitBtn.addEventListener('click', async () => {
      const server = urlInput.value.trim().replace(/\/+$/, '');
      const username = userInput.value.trim();
      const password = passInput.value;
      if (!server || !username || !password) {
        if (AFX.toast) AFX.toast('请填写完整信息', 2000);
        return;
      }
      AFX.cloud.config.serverUrl = server;
      AFX.cloud.save();
      submitBtn.textContent = '请稍候...';
      submitBtn.disabled = true;
      try {
        if (isRegister.v) await AFX.cloud.register(username, password);
        else await AFX.cloud.login(username, password);
        render();
      } catch (e) {
        if (AFX.toast) AFX.toast(e.message, 3000);
        submitBtn.textContent = isRegister.v ? '注册' : '登录';
        submitBtn.disabled = false;
      }
    });

    const tip = h('div', { style: 'color:var(--txt-dim);font-size:11px;margin-top:10px;line-height:1.6;' },
      '💡 首次使用请：\n1. 启动 server（cd server && npm start）\n2. 填写服务器地址\n3. 点击「切换到注册」创建账号'
    );

    panel.appendChild(h('div', { style: 'padding:12px;' },
      h('div', { style: 'font-weight:600;margin-bottom:12px;' }, '☁️ 云同步'),
      urlInput, userInput, passInput, modeBtn, submitBtn, tip
    ));
  }

  /* ---- 已登录：项目列表 ---- */
  function renderLoggedIn(panel) {
    const user = AFX.cloud.config.user;
    const header = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--line);' },
      h('span', { style: 'font-size:13px;' }, '☁️ ' + (user ? user.username : '') + ''),
      h('button', { class: 'obtn', style: 'font-size:11px;', onclick: () => { AFX.cloud.logout(); render(); } }, '退出')
    );
    panel.appendChild(header);

    // 操作按钮
    const saveBtn = h('button', { class: 'obtn primary', style: 'flex:1;' }, '保存到云端');
    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = '同步中...';
      saveBtn.disabled = true;
      try { await AFX.cloud.saveProject(); } catch (e) {}
      saveBtn.textContent = '保存到云端';
      saveBtn.disabled = false;
    });

    const refreshBtn = h('button', { class: 'obtn', style: 'flex:1;' }, '刷新列表');
    refreshBtn.addEventListener('click', () => render());

    panel.appendChild(h('div', { style: 'display:flex;gap:6px;padding:8px 12px;' }, saveBtn, refreshBtn));

    // 项目列表容器
    const listContainer = h('div', { id: 'cloudProjectList', style: 'flex:1;overflow-y:auto;' },
      h('div', { style: 'color:var(--txt-dim);padding:12px;text-align:center;' }, '加载中...')
    );
    panel.appendChild(listContainer);

    // 加载项目列表
    AFX.cloud.listProjects().then(projects => {
      listContainer.innerHTML = '';
      if (!projects.length) {
        listContainer.appendChild(h('div', { style: 'color:var(--txt-dim);padding:12px;text-align:center;' }, '暂无云端项目'));
        return;
      }
      projects.forEach(p => {
        const item = h('div', { style: 'padding:8px 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;' },
          h('div', { style: 'flex:1;cursor:pointer;', onclick: () => loadProject(p.id) },
            h('div', { style: 'font-size:13px;' }, p.name),
            h('div', { style: 'font-size:10px;color:var(--txt-dim);' }, 'v' + p.version + ' · ' + new Date(p.updated_at).toLocaleString())
          ),
          h('button', { class: 'obtn', style: 'font-size:10px;color:var(--danger);border-color:var(--danger);', onclick: async (e) => {
            e.stopPropagation();
            if (confirm('确定删除「' + p.name + '」？')) {
              try { await AFX.cloud.deleteProject(p.id); render(); } catch (e) {}
            }
          } }, '删除')
        );
        listContainer.appendChild(item);
      });
    }).catch(err => {
      listContainer.innerHTML = '';
      listContainer.appendChild(h('div', { style: 'color:var(--danger);padding:12px;' }, '加载失败: ' + err.message));
    });
  }

  async function loadProject(id) {
    try {
      await AFX.cloud.loadProject(id);
      // 切换到属性面板
      const bar = document.getElementById('panelTabs');
      if (bar) bar.querySelector('[data-tab="propPanel"]').click();
    } catch (e) {
      if (AFX.toast) AFX.toast('加载失败: ' + e.message, 3000);
    }
  }

  /* ---- 监听冲突事件 ---- */
  if (AFX.bus) {
    AFX.bus.on('cloud:conflict', (info) => {
      if (confirm('项目已被其他端修改！\n\n点击「确定」用云端版本覆盖本地\n点击「取消」保留本地版本（稍后可手动保存覆盖）')) {
        AFX.cloud.useServerVersion(info.projectId, info.serverData, info.serverVersion);
      }
    });
  }

  /* ---- 初始化 ---- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTab);
  } else {
    initTab();
  }
})();

/* ============================================================
 * ai-panel.js — 右侧面板「AI 助手」聊天窗口 + 「插件」管理面板
 *  - Tab 切换：属性 / AI 助手 / 插件
 *  - 聊天：消息流、动作卡片（应用/确认生成/修复方案）、快捷指令
 *  - 插件管理：启用开关 / 参数 / 查看源码 / 导出 / 固化 / 删除 / 网络授权
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const S = () => AFX.state;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'checked') el.checked = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v);
    });
    children.flat().forEach(c => {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  /* ==================== Tab 切换 ==================== */
  function initTabs() {
    const bar = document.getElementById('panelTabs');
    if (!bar) return;
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.ptab');
      if (!btn) return;
      bar.querySelectorAll('.ptab').forEach(b => b.classList.toggle('active', b === btn));
      ['propPanel', 'aiPanel', 'pluginPanel'].forEach(id => {
        const page = document.getElementById(id);
        if (page) page.classList.toggle('active', id === btn.dataset.tab);
      });
      if (btn.dataset.tab === 'pluginPanel') renderPluginList();
    });
  }

  /* ==================== AI 聊天窗口 ==================== */
  let msgsBox = null, inputBox = null, sendBtn = null, busy = false;

  function scrollBottom() { if (msgsBox) msgsBox.scrollTop = msgsBox.scrollHeight; }

  function addUserMsg(text) {
    msgsBox.appendChild(h('div', { class: 'msg user' }, text));
    scrollBottom();
  }
  function addAiMsg(text) {
    const m = h('div', { class: 'msg ai' });
    m.appendChild(h('div', { class: 'msg-text', style: 'white-space:pre-wrap;' }, text));
    msgsBox.appendChild(m);
    scrollBottom();
    return m;
  }

  function planCard(card) {
    const m = h('div', { class: 'msg ai' });
    m.appendChild(h('div', { class: 'card-title' }, '🎬 ' + (card.title || 'AI 建议')));
    m.appendChild(h('div', { class: 'msg-text', style: 'white-space:pre-wrap;' }, card.detail));
    const btns = h('div', { class: 'card-btns' });
    const applyBtn = h('button', { class: 'card-btn primary' }, '应用');
    applyBtn.addEventListener('click', () => {
      AFX.aiApplyOps(card.ops);
      applyBtn.disabled = true;
      applyBtn.textContent = '已应用 ✓';
      AFX.toast('AI 建议已应用');
    });
    btns.appendChild(applyBtn);
    (card.extraActions || []).forEach(a => {
      if (a.rerun) {
        const b = h('button', { class: 'card-btn' }, a.label);
        b.addEventListener('click', () => { if (card.__text) send(card.__text); });
        btns.appendChild(b);
      }
    });
    const skip = h('button', { class: 'card-btn' }, '忽略');
    skip.addEventListener('click', () => { m.style.opacity = '0.5'; btns.remove(); });
    btns.appendChild(skip);
    m.appendChild(btns);
    msgsBox.appendChild(m);
    scrollBottom();
  }

  function conflictCard(issues) {
    const m = h('div', { class: 'msg ai' });
    m.appendChild(h('div', { class: 'card-title' }, '⚠️ 逻辑纠错（' + issues.length + ' 处冲突）'));
    issues.forEach(issue => {
      m.appendChild(h('div', { class: 'msg-text', style: 'white-space:pre-wrap;' }, issue.text));
      const btns = h('div', { class: 'card-btns' });
      issue.fixes.forEach(fix => {
        const b = h('button', { class: 'card-btn' }, fix.label);
        b.addEventListener('click', () => {
          AFX.aiApplyOps(fix.ops);
          b.disabled = true;
          AFX.toast('已修复');
        });
        btns.appendChild(b);
      });
      m.appendChild(btns);
    });
    msgsBox.appendChild(m);
    scrollBottom();
  }

  function featureConfirmCard(plan) {
    return new Promise(resolve => {
      const m = h('div', { class: 'msg ai' });
      m.appendChild(h('div', { class: 'card-title' }, '🤖 ' + plan.title));
      m.appendChild(h('div', { class: 'msg-text', style: 'white-space:pre-wrap;' }, plan.detail));
      const btns = h('div', { class: 'card-btns' });
      const yes = h('button', { class: 'card-btn primary' }, '确认生成');
      const no = h('button', { class: 'card-btn' }, '取消');
      yes.addEventListener('click', () => { btns.remove(); m.style.opacity = '0.6'; resolve(true); });
      no.addEventListener('click', () => { btns.remove(); addAiMsg('好的，已取消生成。'); resolve(false); });
      btns.appendChild(yes); btns.appendChild(no);
      m.appendChild(btns);
      msgsBox.appendChild(m);
      scrollBottom();
    });
  }

  /* 构造 ai.handle 需要的 ui 回调 */
  function makeUI() {
    return {
      userMsg: addUserMsg,
      aiMsg: (t) => { addAiMsg(t); },
      progress: (t) => {
        // 追加到最近一条 ai 消息；没有则新建
        const all = msgsBox.querySelectorAll('.msg.ai');
        const last = all[all.length - 1];
        if (last && !last.querySelector('.card-btns')) {
          last.appendChild(h('div', { class: 'msg-progress' }, t));
        } else {
          addAiMsg(t);
        }
        scrollBottom();
      },
      plan: (card) => { card.__text = makeUI.__lastText; planCard(card); },
      conflict: (issues) => conflictCard(issues),
      featureConfirm: (plan) => featureConfirmCard(plan)
    };
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    makeUI.__lastText = text;
    addUserMsg(text);
    busy = true;
    sendBtn.disabled = true;
    const typing = h('div', { class: 'msg ai typing' }, 'AI 思考中…');
    msgsBox.appendChild(typing);
    scrollBottom();
    try {
      const ui = makeUI();
      // 先移除"思考中"，由 handle 填充真实消息
      const origAiMsg = ui.aiMsg;
      ui.aiMsg = (t) => { typing.remove(); origAiMsg(t); };
      const origPlan = ui.plan;
      ui.plan = (c) => { typing.remove(); origPlan(c); };
      const origConflict = ui.conflict;
      ui.conflict = (c) => { typing.remove(); origConflict(c); };
      const origConfirm = ui.featureConfirm;
      ui.featureConfirm = (p) => { typing.remove(); return origConfirm(p); };
      const origProgress = ui.progress;
      ui.progress = (t) => {
        if (typing.parentNode) { typing.remove(); }
        origProgress(t);
      };
      await AFX.ai.handle(text, ui);
      if (typing.parentNode) typing.remove();
    } catch (err) {
      if (typing.parentNode) typing.remove();
      addAiMsg('出错了：' + err.message);
      console.warn('[AFX.ai-panel]', err);
    } finally {
      busy = false;
      sendBtn.disabled = false;
    }
  }

  function buildChatUI() {
    const panel = document.getElementById('aiPanel');
    if (!panel) return;
    panel.innerHTML = '';

    /* --- 大模型接口设置 --- */
    const ep = AFX.ai.endpoint;
    const providers = AFX.ai.providers || [];

    /* 供应商下拉 */
    const provSel = h('select', { style: 'width:100%;' });
    providers.forEach(p => {
      const opt = h('option', { value: p.id }, p.name + (p.id === 'custom' ? '' : ' — ' + (p.models.some(m => m.pricing.includes('🆓')) ? '有免费额度' : '收费')));
      if (p.id === ep.provider) opt.selected = true;
      provSel.appendChild(opt);
    });

    /* 模型下拉（随供应商变化） */
    const modelSel = h('select', { style: 'width:100%;' });
    const pricingTip = h('div', { class: 'pricing-tip', style: 'color:var(--txt-dim);font-size:11px;padding:4px 6px;background:var(--bg3);border-radius:4px;min-height:18px;' });

    function refreshModels() {
      const p = AFX.ai.getProvider(provSel.value);
      modelSel.innerHTML = '';
      if (!p || !p.models.length) {
        // 自定义：显示一个文本输入
        modelSel.style.display = 'none';
        const customModelInp = document.getElementById('aiCustomModel') || h('input', { id: 'aiCustomModel', type: 'text', value: ep.model, placeholder: '模型名（如 gpt-4o-mini）', style: 'width:100%;' });
        customModelInp.value = ep.model;
        customModelInp.style.display = 'block';
        pricingTip.textContent = '';
        return;
      }
      const customInp = document.getElementById('aiCustomModel');
      if (customInp) customInp.style.display = 'none';
      modelSel.style.display = 'block';
      p.models.forEach(m => {
        const opt = h('option', { value: m.id }, m.name);
        if (m.id === ep.model) opt.selected = true;
        modelSel.appendChild(opt);
      });
      const cur = p.models.find(m => m.id === modelSel.value) || p.models[0];
      pricingTip.textContent = cur ? cur.pricing : '';
      modelSel.value = cur ? cur.id : '';
    }

    provSel.addEventListener('change', () => {
      AFX.ai.setProvider(provSel.value);
      const p = AFX.ai.getProvider(provSel.value);
      if (p) { keyInp.placeholder = p.keyHint || 'API Key'; }
      refreshModels();
    });
    modelSel.addEventListener('change', () => {
      AFX.ai.setModel(modelSel.value);
      const p = AFX.ai.getProvider(provSel.value);
      const cur = p && p.models.find(m => m.id === modelSel.value);
      pricingTip.textContent = cur ? cur.pricing : '';
    });

    const keyInp = h('input', { type: 'password', value: ep.key || '', placeholder: 'API Key', style: 'width:100%;' });
    const saveBtn = h('button', {
      class: 'card-btn primary',
      onclick: () => {
        const p = AFX.ai.getProvider(provSel.value);
        const modelVal = (p && p.models.length) ? modelSel.value : (document.getElementById('aiCustomModel') || {}).value || '';
        AFX.ai.setEndpoint(
          p ? p.url : '',
          keyInp.value.trim(),
          modelVal
        );
        AFX.toast(ep.url ? '大模型接口已保存' : '已切换为本地模拟大脑');
      }
    }, '保存接口设置');

    refreshModels();
    const curP = AFX.ai.getProvider(ep.provider);
    if (curP) keyInp.placeholder = curP.keyHint || 'API Key';

    /* 费用一览表（可折叠） */
    const pricingList = h('details', { class: 'ai-pricing-list', style: 'margin-top:4px;' },
      h('summary', { style: 'font-size:11px;color:var(--txt-dim);cursor:pointer;' }, '📊 全部模型费用一览'),
      h('div', { style: 'margin-top:6px;' }, ...providers.filter(p => p.id !== 'custom').flatMap(p => [
        h('div', { style: 'font-weight:600;font-size:11px;margin-top:4px;color:var(--accent);' }, p.name),
        ...p.models.map(m => h('div', {
          style: 'font-size:11px;padding:1px 0 1px 10px;display:flex;gap:6px;'
        }, h('span', { style: 'min-width:120px;' }, m.name), h('span', { style: 'color:var(--txt-dim);' }, m.pricing)))
      ]))
    );

    const settings = h('details', { class: 'ai-settings' },
      h('summary', {}, '🔌 大模型接口设置（' + providers.length + ' 家可选）'),
      h('div', { style: 'display:flex;flex-direction:column;gap:5px;margin-top:6px;' },
        h('label', { style: 'font-size:11px;color:var(--txt-dim);' }, '供应商'),
        provSel,
        h('label', { style: 'font-size:11px;color:var(--txt-dim);margin-top:2px;' }, '模型'),
        modelSel,
        h('input', { id: 'aiCustomModel', type: 'text', value: ep.model, placeholder: '模型名（自定义时填写）', style: 'width:100%;display:none;' }),
        pricingTip,
        keyInp,
        saveBtn,
        pricingList,
        h('div', { style: 'color:var(--txt-dim);font-size:11px;' }, '用于台词生成与自由对话；建议/纠错/插件生成为本地确定性引擎，离线可用')
      )
    );
    panel.appendChild(settings);

    /* --- 消息流 --- */
    msgsBox = h('div', { class: 'chat-msgs', id: 'aiMsgs' });
    panel.appendChild(msgsBox);

    // 欢迎语
    addAiMsg(
      '你好，我是 AI 导演助手 🎬\n' +
      '试试下面的快捷指令，或直接输入需求。我支持：\n' +
      '• 台词气泡 · 动作编排 · 逻辑纠错\n' +
      '• 说出系统没有的功能，我会自己写代码生成它'
    );

    /* --- 快捷指令 --- */
    const chips = h('div', { class: 'chat-chips' });
    ['他这时候很生气', '这里需要一点紧张感', '我想加一个下雨的效果', '检查一下场景', '看看场景上下文'].forEach(q => {
      chips.appendChild(h('button', { class: 'chip', onclick: () => send(q) }, q));
    });
    panel.appendChild(chips);

    /* --- 输入区 --- */
    inputBox = h('textarea', { id: 'aiInput', rows: '2', placeholder: '对 AI 导演说点什么…（Enter 发送，Shift+Enter 换行）' });
    inputBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(inputBox.value); inputBox.value = ''; }
    });
    sendBtn = h('button', { class: 'card-btn primary', onclick: () => { send(inputBox.value); inputBox.value = ''; } }, '发送');
    panel.appendChild(h('div', { class: 'chat-input-row' }, inputBox, sendBtn));
  }

  /* ==================== 插件管理面板 ==================== */
  function renderPluginList() {
    const panel = document.getElementById('pluginPanel');
    if (!panel) return;
    // 工具栏只构建一次
    if (!panel.querySelector('.plg-toolbar')) {
      const toolbar = h('div', { class: 'plg-toolbar' },
        h('button', {
          class: 'card-btn',
          onclick: () => {
            const inp = h('input', { type: 'file', accept: '.js,.mjs' });
            inp.addEventListener('change', async () => {
              const f = inp.files && inp.files[0];
              if (!f) return;
              try {
                const entry = await AFX.plugins.importPluginFile(f);
                AFX.toast('插件已导入并启用：' + entry.name);
                renderPluginList();
              } catch (err) { AFX.toast('导入失败：' + err.message); }
            });
            inp.click();
          }
        }, '导入插件 (.js)'),
        h('button', { class: 'card-btn', onclick: () => renderPluginList() }, '刷新'),
        h('span', { style: 'color:var(--txt-dim);font-size:11px;margin-left:auto;' },
          '插件经 Web Worker 沙盒测试后注册，运行于隔离上下文')
      );
      panel.appendChild(toolbar);

      const netBox = h('details', { class: 'ai-settings' },
        h('summary', {}, '网络授权（AI 生成代码默认禁止外联）'),
        h('div', { id: 'plgNetBody', style: 'display:flex;flex-direction:column;gap:5px;margin-top:6px;' })
      );
      panel.appendChild(netBox);
    }
    renderNetBody();

    const list = panel.querySelector('#pluginList') || (() => {
      const d = h('div', { id: 'pluginList' });
      panel.appendChild(d);
      return d;
    })();
    list.innerHTML = '';

    if (!AFX.plugins.registry.length) {
      list.appendChild(h('div', { class: 'plg-empty' },
        '暂无 AI 生成的插件。\n去【AI 助手】说「我想加一个下雨的效果」试试。'));
      return;
    }

    AFX.plugins.registry.forEach(meta => {
      const item = h('div', { class: 'plugin-item' });

      /* 标题行：名称 + 徽章 + 开关 */
      const badge = h('span', { class: 'plg-badge ' + (meta.builtin ? 'builtin' : 'ai') }, meta.builtin ? '内置' : 'AI 生成');
      const sw = h('label', { class: 'switch', title: '启用/禁用' });
      const swBox = h('input', { type: 'checkbox' });
      swBox.checked = !!meta.enabled;
      swBox.addEventListener('change', async () => {
        await AFX.plugins.setEnabled(meta.id, swBox.checked);
        renderPluginList();
      });
      sw.appendChild(swBox);
      sw.appendChild(h('span', { class: 'slider' }));
      item.appendChild(h('div', { class: 'plg-head' },
        h('span', { class: 'plg-name' }, meta.name), badge,
        h('span', { style: 'flex:1;' }), sw
      ));
      if (meta.requirement) {
        item.appendChild(h('div', { class: 'plg-req' }, '原始需求：' + meta.requirement));
      }

      /* 按钮行 */
      const btns = h('div', { class: 'plg-btns' });
      btns.appendChild(h('button', {
        class: 'mini', onclick: () => showSource(meta)
      }, '源码'));
      if (meta.paramsSchema && meta.paramsSchema.length) {
        btns.appendChild(h('button', {
          class: 'mini', onclick: () => toggleParams(item, meta)
        }, '参数'));
      }
      btns.appendChild(h('button', { class: 'mini', onclick: () => { AFX.plugins.exportPlugin(meta.id); } }, '导出'));
      btns.appendChild(h('button', {
        class: 'mini', onclick: async () => {
          await AFX.plugins.solidify(meta.id);
          renderPluginList();
        }
      }, '固化'));
      btns.appendChild(h('button', {
        class: 'mini danger',
        onclick: () => {
          if (!confirm(meta.builtin
            ? '「' + meta.name + '」是内置功能，确定删除？'
            : '删除插件「' + meta.name + '」？')) return;
          AFX.plugins.remove(meta.id);
          renderPluginList();
        }
      }, '删除'));
      item.appendChild(btns);

      /* 参数区（点击展开） */
      const paramsBox = h('div', { class: 'plg-params', style: 'display:none;' });
      item.appendChild(paramsBox);
      item.__paramsBox = paramsBox;

      list.appendChild(item);
    });
  }

  function toggleParams(item, meta) {
    const box = item.__paramsBox;
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    box.innerHTML = '';
    (meta.paramsSchema || []).forEach(sc => {
      if (sc.key === 'color') {
        const inp = h('input', { type: 'text', value: meta.params.color || '#ffffff', style: 'flex:1;' });
        inp.addEventListener('change', () => {
          meta.params.color = inp.value;
          if (meta.ctx) meta.ctx.params = meta.params;
          AFX.plugins.persist();
        });
        box.appendChild(h('div', { class: 'prow' }, h('span', { class: 'plabel' }, sc.label || sc.key), inp));
        return;
      }
      const inp = h('input', {
        type: 'range',
        min: String(sc.min), max: String(sc.max), step: String(sc.step || 1),
        value: String(meta.params[sc.key] != null ? meta.params[sc.key] : 0),
        style: 'flex:1;'
      });
      const lab = h('span', { style: 'min-width:34px;text-align:right;color:var(--txt-dim);font-size:11px;' },
        String(meta.params[sc.key] != null ? meta.params[sc.key] : ''));
      inp.addEventListener('input', () => {
        meta.params[sc.key] = parseFloat(inp.value);
        lab.textContent = inp.value;
        if (meta.ctx) meta.ctx.params = meta.params;   // 实时生效
        AFX.plugins.persist();
      });
      box.appendChild(h('div', { class: 'prow' }, h('span', { class: 'plabel' }, sc.label || sc.key), inp, lab));
    });
    box.style.display = 'block';
  }

  /* 源码查看 / 编辑弹窗 */
  function showSource(meta) {
    let overlay = document.getElementById('afx-code-modal');
    if (!overlay) {
      overlay = h('div', { id: 'afx-code-modal' });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
    const ta = h('textarea', { class: 'code-view', spellcheck: 'false' });
    ta.value = meta.code;
    overlay.appendChild(h('div', { class: 'modal-card' },
      h('div', { class: 'card-title' }, '源码：' + meta.name),
      ta,
      h('div', { class: 'card-btns' },
        h('button', {
          class: 'card-btn primary',
          onclick: async () => {
            const newCode = ta.value;
            const r = await AFX.pluginsSandboxTest(newCode);
            if (!r.ok && !confirm('沙盒测试未通过，仍要保存吗？\n' + String(r.error).slice(0, 200))) return;
            // 保存 = 原地重载：销毁旧实例，替换代码，重新启用
            const wasOn = meta.enabled;
            await AFX.plugins.setEnabled(meta.id, false);
            meta.code = newCode;
            meta.instance = null;
            AFX.plugins.persist();
            if (wasOn) await AFX.plugins.setEnabled(meta.id, true);
            overlay.classList.remove('show');
            AFX.toast('源码已保存并重载');
            renderPluginList();
          }
        }, '测试并保存'),
        h('button', { class: 'card-btn', onclick: () => overlay.classList.remove('show') }, '关闭')
      )
    ));
    overlay.classList.add('show');
  }

  function renderNetBody() {
    const body = document.getElementById('plgNetBody');
    if (!body) return;
    body.innerHTML = '';
    if (!AFX.plugins.allowedHosts.length) {
      body.appendChild(h('div', { style: 'color:var(--txt-dim);font-size:11px;' }, '未授权任何外部域名（插件只能访问本页面资源）'));
    }
    AFX.plugins.allowedHosts.forEach(host => {
      body.appendChild(h('div', { class: 'prow' },
        h('span', { class: 'plabel' }, host),
        h('button', {
          class: 'mini danger',
          onclick: () => { AFX.plugins.removeAllowedHost(host); renderNetBody(); }
        }, '撤销')
      ));
    });
    const inp = h('input', { type: 'text', placeholder: '例如 api.example.com', style: 'flex:1;' });
    body.appendChild(h('div', { class: 'prow' },
      inp,
      h('button', {
        class: 'mini',
        onclick: () => {
          const v = inp.value.trim().replace(/^https?:\/\//, '').split('/')[0];
          if (v) { AFX.plugins.addAllowedHost(v); renderNetBody(); }
        }
      }, '授权域名')
    ));
  }

  /* ==================== 初始化 ==================== */
  function init() {
    initTabs();
    buildChatUI();
    renderPluginList();
    AFX.bus.on('plugins:changed', () => {
      const pluginTabActive = document.getElementById('pluginPanel') &&
        document.getElementById('pluginPanel').classList.contains('active');
      if (pluginTabActive) renderPluginList();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ============================================================
 * ai.js — AI 智能导演助手 (AI Director Assistant)
 *
 *  - 场景上下文分析：contextSnapshot() 输出画布全部元素 JSON
 *  - 意图识别：台词生成 / 动作编排建议 / 逻辑纠错 / 功能请求 / 自由对话
 *  - 大模型接口：兼容 OpenAI /chat/completions（可配置端点，未配置时
 *    使用本地模拟大脑，完全离线可用）
 *  - 一键应用：建议以"操作 (op)"描述，用户确认后直接修改场景 JSON
 *  - 自主功能生成：当前系统不支持的需求 → 生成 IPlugin 插件代码 →
 *    Web Worker 沙盒测试（失败自动修复重试 ≤3 次）→ 注册启用
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const S = () => AFX.state;
  const ENDPOINT_KEY = 'afx.ai.endpoint.v2';

  /* ==================== 大模型供应商预设表 ====================
   * compat 字段决定 API 适配器：
   *   'openai'  → /chat/completions（OpenAI 兼容，绝大多数国产模型可用）
   *   'gemini'  → /v1beta/models/{model}:generateContent
   *   'claude'  → /v1/messages
   * pricing 字段标注免费额度与收费价格，UI 面板展示给用户参考。
   * ============================================================ */
  const PROVIDERS = [
    {
      id: 'zhipu', name: '智谱 GLM', compat: 'openai',
      url: 'https://open.bigmodel.cn/api/paas/v4',
      models: [
        { id: 'glm-4-flash',  name: 'GLM-4-Flash',  pricing: '🆓 免费（不限量）' },
        { id: 'glm-4',         name: 'GLM-4',         pricing: '💰 ¥0.1/千 tokens' },
        { id: 'glm-4-air',     name: 'GLM-4-Air',     pricing: '💰 ¥0.005/千 tokens' },
        { id: 'glm-4-flashx',  name: 'GLM-4-FlashX',  pricing: '🆓 免费（不限量）' }
      ],
      defaultModel: 'glm-4-flash',
      keyHint: '在 bigmodel.cn 控制台获取 API Key',
      docUrl: 'https://open.bigmodel.cn'
    },
    {
      id: 'deepseek', name: 'DeepSeek 深度求索', compat: 'openai',
      url: 'https://api.deepseek.com/v1',
      models: [
        { id: 'deepseek-chat',      name: 'DeepSeek-V3',      pricing: '💰 ¥1/百万 tokens（缓存命中 ¥0.1）' },
        { id: 'deepseek-reasoner',  name: 'DeepSeek-R1',      pricing: '💰 ¥4/百万 tokens（推理增强）' }
      ],
      defaultModel: 'deepseek-chat',
      keyHint: '在 platform.deepseek.com 获取 API Key',
      docUrl: 'https://platform.deepseek.com'
    },
    {
      id: 'qwen', name: '通义千问（阿里云）', compat: 'openai',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: [
        { id: 'qwen-turbo',    name: 'Qwen-Turbo',    pricing: '💰 ¥0.002/千 tokens（有免费额度）' },
        { id: 'qwen-plus',     name: 'Qwen-Plus',     pricing: '💰 ¥0.004/千 tokens' },
        { id: 'qwen-max',      name: 'Qwen-Max',      pricing: '💰 ¥0.02/千 tokens' },
        { id: 'qwen-long',     name: 'Qwen-Long',     pricing: '💰 ¥0.0005/千 tokens（超长上下文）' }
      ],
      defaultModel: 'qwen-turbo',
      keyHint: '在 dashscope.aliyun.com 获取 API Key',
      docUrl: 'https://dashscope.aliyun.com'
    },
    {
      id: 'kimi', name: '月之暗面 Kimi', compat: 'openai',
      url: 'https://api.moonshot.cn/v1',
      models: [
        { id: 'moonshot-v1-8k',   name: 'Moonshot-v1-8k',   pricing: '💰 ¥12/百万 tokens（注册送 ¥15）' },
        { id: 'moonshot-v1-32k',  name: 'Moonshot-v1-32k',  pricing: '💰 ¥24/百万 tokens' },
        { id: 'moonshot-v1-128k', name: 'Moonshot-v1-128k', pricing: '💰 ¥60/百万 tokens' },
        { id: 'kimi-latest',      name: 'Kimi-Latest',      pricing: '💰 ¥20/百万 tokens' }
      ],
      defaultModel: 'moonshot-v1-8k',
      keyHint: '在 platform.moonshot.cn 获取 API Key',
      docUrl: 'https://platform.moonshot.cn'
    },
    {
      id: 'ernie', name: '百度文心一言', compat: 'openai',
      url: 'https://qianfan.baidubce.com/v2',
      models: [
        { id: 'ernie-4.0-turbo-8k',  name: 'ERNIE 4.0 Turbo', pricing: '💰 ¥3/百万 tokens' },
        { id: 'ernie-3.5-8k',        name: 'ERNIE 3.5',       pricing: '💰 ¥1.2/百万 tokens' },
        { id: 'ernie-speed-8k',      name: 'ERNIE Speed',     pricing: '🆓 免费（限速）' },
        { id: 'ernie-lite-8k',       name: 'ERNIE Lite',      pricing: '🆓 免费（限速）' }
      ],
      defaultModel: 'ernie-speed-8k',
      keyHint: '在 qianfan.baidubce.com 获取 API Key / AK+SK',
      docUrl: 'https://qianfan.baidubce.com'
    },
    {
      id: 'yi', name: '零一万物 Yi', compat: 'openai',
      url: 'https://api.lingyiwanwu.com/v1',
      models: [
        { id: 'yi-large',   name: 'Yi-Large',   pricing: '💰 ¥21/百万 tokens' },
        { id: 'yi-medium',  name: 'Yi-Medium',  pricing: '💰 ¥2.5/百万 tokens' },
        { id: 'yi-light',   name: 'Yi-Light',   pricing: '💰 ¥0.8/百万 tokens' },
        { id: 'yi-lightning', name: 'Yi-Lightning', pricing: '🆓 免费（限速）' }
      ],
      defaultModel: 'yi-lightning',
      keyHint: '在 platform.lingyiwanwu.com 获取 API Key',
      docUrl: 'https://platform.lingyiwanwu.com'
    },
    {
      id: 'spark', name: '讯飞星火', compat: 'openai',
      url: 'https://spark-api-open.xf-yun.com/v1',
      models: [
        { id: 'generalv3',  name: 'Spark Pro',       pricing: '💰 ¥4/百万 tokens' },
        { id: 'general',    name: 'Spark Lite',       pricing: '🆓 免费（限速）' },
        { id: 'generalv3.5',name: 'Spark 3.5 Max',    pricing: '💰 ¥6/百万 tokens' },
        { id: '4.0Ultra',   name: 'Spark 4.0 Ultra', pricing: '💰 ¥12/百万 tokens' }
      ],
      defaultModel: 'general',
      keyHint: '在 xinghuo.xfyun.cn 获取 APIPassword（APIKey:APISecret）',
      docUrl: 'https://xinghuo.xfyun.cn'
    },
    {
      id: 'hunyuan', name: '腾讯混元', compat: 'openai',
      url: 'https://api.hunyuan.cloud.tencent.com/v1',
      models: [
        { id: 'hunyuan-turbos-latest', name: 'Hunyuan Turbo',   pricing: '💰 ¥1/百万 tokens' },
        { id: 'hunyuan-pro',           name: 'Hunyuan Pro',     pricing: '💰 ¥15/百万 tokens' },
        { id: 'hunyuan-standard',      name: 'Hunyuan Standard',pricing: '💰 ¥4.5/百万 tokens' },
        { id: 'hunyuan-lite',           name: 'Hunyuan Lite',    pricing: '🆓 免费（限速）' }
      ],
      defaultModel: 'hunyuan-lite',
      keyHint: '在 cloud.tencent.com/product/hunyuan 获取 API Key',
      docUrl: 'https://cloud.tencent.com/product/hunyuan'
    },
    {
      id: 'openai', name: 'OpenAI', compat: 'openai',
      url: 'https://api.openai.com/v1',
      models: [
        { id: 'gpt-4o-mini',   name: 'GPT-4o mini',  pricing: '💰 $0.15/百万 in · $0.60/百万 out' },
        { id: 'gpt-4o',         name: 'GPT-4o',        pricing: '💰 $2.50/百万 in · $10/百万 out' },
        { id: 'gpt-4.1-mini',   name: 'GPT-4.1 mini', pricing: '💰 $0.40/百万 in · $1.60/百万 out' },
        { id: 'gpt-4.1',        name: 'GPT-4.1',       pricing: '💰 $2.00/百万 in · $8.00/百万 out' },
        { id: 'o4-mini',        name: 'o4-mini',       pricing: '💰 $1.10/百万 in · $4.40/百万 out' }
      ],
      defaultModel: 'gpt-4o-mini',
      keyHint: '在 platform.openai.com 获取 sk- 开头 API Key',
      docUrl: 'https://platform.openai.com/api-keys'
    },
    {
      id: 'gemini', name: 'Google Gemini', compat: 'gemini',
      url: 'https://generativelanguage.googleapis.com',
      models: [
        { id: 'gemini-2.0-flash',           name: 'Gemini 2.0 Flash',  pricing: '🆓 免费层（15 RPM / 100万 tokens/天）' },
        { id: 'gemini-2.0-flash-lite',      name: 'Gemini 2.0 Flash-Lite', pricing: '🆓 免费层（30 RPM）' },
        { id: 'gemini-2.5-pro',             name: 'Gemini 2.5 Pro',    pricing: '💰 $1.25/百万 in · $5/百万 out' },
        { id: 'gemini-1.5-flash',           name: 'Gemini 1.5 Flash', pricing: '🆓 免费层（15 RPM）' },
        { id: 'gemini-1.5-pro',             name: 'Gemini 1.5 Pro',   pricing: '💰 $1.25/百万 in · $5/百万 out' }
      ],
      defaultModel: 'gemini-2.0-flash',
      keyHint: '在 aistudio.google.com 获取 API Key',
      docUrl: 'https://aistudio.google.com/app/apikey'
    },
    {
      id: 'claude', name: 'Anthropic Claude', compat: 'claude',
      url: 'https://api.anthropic.com',
      models: [
        { id: 'claude-sonnet-4-5-20250514',  name: 'Claude Sonnet 4.5', pricing: '💰 $3/百万 in · $15/百万 out' },
        { id: 'claude-3-5-sonnet-20241022',  name: 'Claude 3.5 Sonnet',pricing: '💰 $3/百万 in · $15/百万 out' },
        { id: 'claude-3-5-haiku-20241022',   name: 'Claude 3.5 Haiku', pricing: '💰 $0.80/百万 in · $4/百万 out' },
        { id: 'claude-3-opus-20240229',      name: 'Claude 3 Opus',    pricing: '💰 $15/百万 in · $75/百万 out' }
      ],
      defaultModel: 'claude-3-5-haiku-20241022',
      keyHint: '在 console.anthropic.com 获取 sk-ant- 开头 API Key',
      docUrl: 'https://console.anthropic.com'
    },
    {
      id: 'custom', name: '自定义（OpenAI 兼容）', compat: 'openai',
      url: '', models: [], defaultModel: '', keyHint: '填写任意 OpenAI 兼容端点', docUrl: ''
    }
  ];

  /* ==================== 大模型接口 ==================== */
  const ai = {
    providers: PROVIDERS,

    endpoint: { provider: 'zhipu', url: 'https://open.bigmodel.cn/api/paas/v4', key: '', model: 'glm-4-flash', compat: 'openai' },

    loadEndpoint() {
      try {
        const s = JSON.parse(localStorage.getItem(ENDPOINT_KEY) || '{}');
        if (s.url !== undefined || s.provider) this.endpoint = Object.assign(this.endpoint, s);
      } catch (_) {}
    },

    getProvider(id) { return PROVIDERS.find(p => p.id === id); },

    /* 切换供应商：自动填充 url / defaultModel / compat */
    setProvider(id) {
      const p = this.getProvider(id);
      if (!p) return;
      this.endpoint.provider = id;
      this.endpoint.url = p.url;
      this.endpoint.compat = p.compat;
      this.endpoint.model = p.defaultModel;
      this._persist();
    },

    setModel(modelId) {
      this.endpoint.model = modelId;
      this._persist();
    },

    setEndpoint(url, key, model) {
      this.endpoint.url = url || '';
      this.endpoint.key = key || '';
      this.endpoint.model = model || this.endpoint.model;
      this._persist();
    },

    _persist() {
      try { localStorage.setItem(ENDPOINT_KEY, JSON.stringify(this.endpoint)); } catch (_) {}
    },

    /* 调用大模型；未配置/失败返回 null（调用方回退本地大脑） */
    async chat(messages, maxTokens) {
      const ep = this.endpoint;
      if (!ep.url) return null;
      const compat = ep.compat || 'openai';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        let res;
        if (compat === 'gemini') {
          res = await this._callGemini(ep, messages, maxTokens, ctrl.signal);
        } else if (compat === 'claude') {
          res = await this._callClaude(ep, messages, maxTokens, ctrl.signal);
        } else {
          res = await this._callOpenAI(ep, messages, maxTokens, ctrl.signal);
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return this._extractText(data, compat);
      } catch (err) {
        console.warn('[AFX.ai] 大模型调用失败，回退本地大脑:', err.message);
        return null;
      } finally { clearTimeout(timer); }
    },

    /* OpenAI 兼容格式（OpenAI / DeepSeek / 智谱 / 通义 / Kimi / 文心 / 零一 / 讯飞 / 混元 / 自定义） */
    async _callOpenAI(ep, messages, maxTokens, signal) {
      return fetch(ep.url.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ep.key ? { Authorization: 'Bearer ' + ep.key } : {})
        },
        body: JSON.stringify({
          model: ep.model, messages,
          temperature: 0.8,
          max_tokens: maxTokens || 300,
          stream: false
        }),
        signal
      });
    },

    /* Google Gemini — /v1beta/models/{model}:generateContent */
    async _callGemini(ep, messages, maxTokens, signal) {
      const sysContent = (messages.find(m => m.role === 'system') || {}).content || '';
      const userContents = messages.filter(m => m.role !== 'system').map(m => ({
        text: m.content, role: m.role === 'assistant' ? 'model' : 'user'
      }));
      const url = ep.url + '/v1beta/models/' + encodeURIComponent(ep.model) + ':generateContent?key=' + encodeURIComponent(ep.key);
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: sysContent ? { parts: [{ text: sysContent }] } : undefined,
          contents: userContents,
          generationConfig: { temperature: 0.8, maxOutputTokens: maxTokens || 300 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
          ]
        }),
        signal
      });
    },

    /* Anthropic Claude — /v1/messages */
    async _callClaude(ep, messages, maxTokens, signal) {
      const sysContent = (messages.find(m => m.role === 'system') || {}).content || '';
      const conv = messages.filter(m => m.role !== 'system');
      return fetch(ep.url + '/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ep.key || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: ep.model,
          system: sysContent || undefined,
          messages: conv,
          max_tokens: maxTokens || 300,
          temperature: 0.8
        }),
        signal
      });
    },

    /* 从不同格式的响应 JSON 中提取文本 */
    _extractText(data, compat) {
      if (compat === 'gemini') {
        const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
        if (!parts) return null;
        return parts.map(p => p.text || '').join('').trim() || null;
      }
      if (compat === 'claude') {
        const parts = data.content;
        if (!parts) return null;
        return parts.map(p => p.text || '').join('').trim() || null;
      }
      // OpenAI 兼容
      const txt = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return txt ? txt.trim() : null;
    },

    /* ---------------- 场景上下文（供大模型 / 调试） ---------------- */
    contextSnapshot() {
      const scene = S().scene;
      return {
        meta: scene.meta,
        playhead: +S().t.toFixed(2),
        playing: S().playing,
        selection: S().sel,
        wind: scene.env && scene.env.wind,
        elements: scene.elements.map(e => {
          const o = {
            id: e.id, type: e.type, name: e.name,
            style: { x: e.style.x, y: e.style.y, width: e.style.width, height: e.style.height, opacity: e.style.opacity },
            visibility: e.visibility,
            move: e.animations.move.enabled ? { direction: e.animations.move.direction, distance: e.animations.move.distance } : null
          };
          if (e.type === 'text') o.text = e.content.text;
          if (e.char) o.character = {
            race: e.char.race, state: e.char.state, direction: e.char.direction,
            cues: e.char.cues
          };
          if (e.env && e.env.sway && e.env.sway.enabled) o.sway = e.env.sway;
          return o;
        })
      };
    }
  };
  ai.loadEndpoint();

  /* ==================== 意图识别 ==================== */
  const has = (t, words) => words.some(w => t.includes(w));

  function detectIntent(text) {
    const t = text.toLowerCase();
    if (has(t, ['检查', '冲突', '合理', '矛盾', '纠错', '体检'])) return 'conflict';
    if (has(t, ['你能做什么', '有什么功能', '功能列表', '帮助'])) return 'help';
    if (has(t, ['我想要', '加一个', '添加一个', '增加一个', '实现一个', '做一个', '来一个', '需要一个', '生成一个', '下雨', '下雪', '萤火虫', '彩带', '花瓣', '烟雾', '发光', '震动']) &&
        has(t, ['效果', '特效', '功能', '粒子', '动画', '氛围', ''])) return 'feature';
    if (has(t, ['紧张', '激烈', '刺激', '燃', '氛围', '节奏', '建议', '编排', '安排', '推荐', '轻松', '平静', '舒缓'])) return 'plan';
    if (has(t, ['台词', '说话', '气泡', '说一句', '喊', '感叹', '生气', '愤怒', '开心', '高兴', '伤心', '难过', '惊讶', '害怕', '委屈', '兴奋'])) return 'dialogue';
    /* === 新增：直接操作意图 === */
    if (has(t, ['向右', '往右', '右走', '右移', 'move right', '向左走', '往左', '左移']) ||
        has(t, ['走', '跑', '飞', '游泳', '坐下', '站']) && has(t, ['让', '要', '叫', '使', '给', '去', '开始', '来']))
      return 'action';
    if (has(t, ['背景', '颜色', '大小', '尺寸', '时长', '宽度', '高度', '场景']))
      return 'action';
    if (has(t, ['删除', '去掉', '移除', '清掉', '不要']))
      return 'action';
    return 'chat';
  }

  /* ==================== 本地大脑：台词生成 ==================== */
  const EMOTION_LINES = {
    angry: { words: ['生气', '愤怒', '火大', '气死'], lines: ['哼！别以为我怕你！', '真是气死我了！！', '你给我等着瞧！'] },
    happy: { words: ['开心', '高兴', '兴奋', '快乐'], lines: ['太好了，我们成功啦！', '哈哈，今天真是美好的一天！', '耶——！'] },
    sad: { words: ['伤心', '难过', '委屈', '沮丧'], lines: ['唉……为什么会这样。', '我心里好难受……', '也许……我该放弃了。'] },
    surprised: { words: ['惊讶', '吃惊', '震惊'], lines: ['什么？！这怎么可能！', '天哪，快看那边！', '居然会是这样……'] },
    scared: { words: ['害怕', '恐惧', '紧张', '慌'], lines: ['那……那是什么声音？！', '别过来……别过来！', '我们快离开这里！'] },
    neutral: { words: [], lines: ['……我们接下来该怎么办？', '嗯，让我想想。'] }
  };
  function detectEmotion(text) {
    for (const [k, v] of Object.entries(EMOTION_LINES)) {
      if (v.words.some(w => text.includes(w))) return k;
    }
    return 'neutral';
  }

  async function makeDialogue(text) {
    const scene = S().scene;
    const target = scene.elements.find(e => e.id === S().sel && e.type === 'character') ||
                   scene.elements.find(e => e.type === 'character');
    const emotion = detectEmotion(text);

    // 优先大模型生成更贴合语境的台词
    let line = null;
    const ctx = ai.contextSnapshot();
    line = await ai.chat([
      { role: 'system', content: '你是动画导演助手。根据用户描述为角色写一句口语化中文台词，直接输出台词本身，不要引号和其他说明，15字以内。' },
      { role: 'user', content: '场景：' + JSON.stringify(ctx) + '\n用户描述：' + text + '\n情绪：' + emotion }
    ], 60);
    if (!line) {
      const pool = EMOTION_LINES[emotion].lines;
      line = pool[Math.floor(Math.random() * pool.length)];
    }

    const t = +S().t.toFixed(2);
    const pos = target
      ? { x: target.style.x + target.style.width / 2 - 90, y: Math.max(4, target.style.y - 70) }
      : { x: Math.round(scene.meta.width / 2 - 90), y: Math.round(scene.meta.height / 2 - 100) };

    return {
      kind: 'dialogue',
      title: '台词气泡建议（' + ({ angry: '生气', happy: '开心', sad: '伤心', surprised: '惊讶', scared: '害怕', neutral: '中性' }[emotion]) + '）',
      detail: '在 T+' + t + 's 为「' + (target ? target.name : '场景中央') + '」添加台词气泡，持续 2.5 秒：\n“' + line + '”',
      line,
      ops: [{
        type: 'addBubble',
        text: line, x: pos.x, y: pos.y,
        start: t, end: Math.min(scene.meta.duration, t + 2.5),
        color: emotion === 'angry' ? '#c0392b' : emotion === 'sad' ? '#636e72' : '#2d3436'
      }],
      extraActions: [{ label: '换一句', rerun: true }]
    };
  }

  /* ==================== 本地大脑：直接操作（action） ==================== */
  // 解析简单的动作指令，返回 ops 数组（可直接 applyOps）
  function makeAction(text) {
    const scene = S().scene;
    const t = text.toLowerCase();
    const chars = scene.elements.filter(e => e.type === 'character');
    const target = chars.find(e => e.id === S().sel) || chars[0];
    if (!target && !has(t, ['添加', '新增', '加一个', '创建'])) return null;

    const ops = [];
    const tt = +S().t.toFixed(2);

    // --- 角色状态切换 ---
    if (has(t, ['坐下', '坐下来', 'sit'])) ops.push({ type: 'setCharState', elId: target && target.id, state: 'sit' });
    else if (has(t, ['站起来', '站立', '站好', 'idle'])) ops.push({ type: 'setCharState', elId: target && target.id, state: 'idle' });
    else if (has(t, ['飞起来', '起飞', '飞行', '飞', 'fly']) && !has(t, ['飞机'])) ops.push({ type: 'setCharState', elId: target && target.id, state: 'fly' });
    else if (has(t, ['游泳', '下水', '潜入', 'swim'])) ops.push({ type: 'setCharState', elId: target && target.id, state: 'swim' });
    else if (has(t, ['跑', 'run']) || has(t, ['快', '加速']) && has(t, ['走', '跑', '动'])) ops.push({ type: 'setCharState', elId: target && target.id, state: 'run' });
    else if (has(t, ['走', 'walk']) || has(t, ['慢', '减速'])) ops.push({ type: 'setCharState', elId: target && target.id, state: 'walk' });

    // --- 方向控制 ---
    if (has(t, ['向右', '往右', '右走', '右移', 'right'])) ops.push({ type: 'setCharDirection', elId: target && target.id, direction: 'right' });
    else if (has(t, ['向左', '往左', '左走', '左移', 'left'])) ops.push({ type: 'setCharDirection', elId: target && target.id, direction: 'left' });
    else if (has(t, ['向上', '往上', 'up'])) ops.push({ type: 'setCharDirection', elId: target && target.id, direction: 'up' });
    else if (has(t, ['向下', '往下', 'down'])) ops.push({ type: 'setCharDirection', elId: target && target.id, direction: 'down' });

    // --- 速度控制 ---
    const speedMatch = t.match(/(?:速度|speed)[^\d]*(\d+(?:\.\d+)?)/);
    if (speedMatch) ops.push({ type: 'setCharSpeed', elId: target && target.id, speed: parseFloat(speedMatch[1]) });

    // --- 背景颜色 ---
    const bgColors = { 红: '#e74c3c', 粉: '#fd79a8', 蓝: '#74b9ff', 绿: '#55efc4', 黄: '#ffeaa7', 紫: '#a29bfe', 白: '#ffffff', 黑: '#2d3436', 天蓝: '#a3d5f7', 夜: '#1a1a2e', 森林: '#27ae60', 夕阳: '#e17055' };
    for (const [w, c] of Object.entries(bgColors)) {
      if (has(t, ['背景']) && t.includes(w)) { ops.push({ type: 'setSceneMeta', background: c }); break; }
    }

    // --- 场景时长 ---
    const durMatch = t.match(/(?:时长|duration|时间)[^\d]*(\d+(?:\.\d+)?)/);
    if (durMatch) ops.push({ type: 'setSceneMeta', duration: parseFloat(durMatch[1]) });

    // --- 删除元素 ---
    if (has(t, ['删除', '去掉', '移除', '清掉', '不要'])) {
      if (target && !has(t, ['背景', '颜色', '时长', '场景'])) ops.push({ type: 'deleteElement', elId: target.id });
    }

    // --- 添加角色 ---
    if (has(t, ['添加', '新增', '加一个', '创建']) && has(t, ['角色', '人物', '人', '勇士', '英雄', '动物'])) {
      ops.push({ type: 'addElement', elementType: 'character', name: '新角色', x: 200, y: 300, state: 'idle', direction: 'right' });
    }

    // --- 移动动画配置 ---
    const distMatch = t.match(/(?:移动|距离|走|跑)[^\d]*(\d+)/);
    if (distMatch && target) {
      ops.push({ type: 'setMove', elId: target.id, enabled: true, distance: parseInt(distMatch[1]) });
    }

    return ops.length ? ops : null;
  }

  /* ==================== LLM 自主操作生成 ==================== */
  // 当本地解析失败时，用大模型理解用户意图并生成 ops
  async function llmGenerateOps(text, ui) {
    if (!ai.endpoint.url) {
      // 未配置大模型：尝试本地解析
      const ops = makeAction(text);
      if (ops) {
        applyOps(ops);
        return true;
      }
      return false;
    }

    const ctx = ai.contextSnapshot();
    const sysPrompt =
      '你是 AFX 动画工坊的 AI 导演助手。用户会用自然语言描述想要的效果，你需要将其转换为 JSON 操作序列（ops 数组），直接修改场景。\n' +
      '可用操作类型：\n' +
      '1. setCharState: {type:"setCharState", elId(可选), state:"idle|sit|walk|run|fly|swim"}\n' +
      '2. setCharDirection: {type:"setCharDirection", elId(可选), direction:"right|left|up|down|upRight|upLeft|downRight|downLeft"}\n' +
      '3. setCharSpeed: {type:"setCharSpeed", elId(可选), speed:1.0}\n' +
      '4. setCharRace: {type:"setCharRace", elId(可选), race:"human|bird|fish"}\n' +
      '5. setMove: {type:"setMove", elId(可选), enabled:true, direction:"right", distance:200, duration:3, delay:0, easing:"linear"}\n' +
      '6. setElementPos: {type:"setElementPos", elId(可选), x:100, y:200}\n' +
      '7. setElementSize: {type:"setElementSize", elId(可选), width:120, height:220}\n' +
      '8. setElementOpacity: {type:"setElementOpacity", elId(可选), opacity:0.5}\n' +
      '9. setElementRotation: {type:"setElementRotation", elId(可选), rotation:45}\n' +
      '10. setElementColor: {type:"setElementColor", elId(可选), skin:"#ffd9b3", shirt:"#4f9cff", pants:"#34495e"}\n' +
      '11. setSceneMeta: {type:"setSceneMeta", duration:8, width:960, height:540, background:"#ffffff"}\n' +
      '12. addElement: {type:"addElement", elementType:"character|text|svg|image", name:"名字", x:100, y:200, state:"walk", direction:"right", text:"文字内容"}\n' +
      '13. deleteElement: {type:"deleteElement", elId:"xxx"}\n' +
      '14. addCharCue: {type:"addCharCue", elId:"xxx", t:3.0, state:"run", direction:"left"}\n' +
      '15. addBubble: {type:"addBubble", text:"台词", x:100, y:50, start:0, end:3, color:"#2d3436"}\n' +
      '16. setWind: {type:"setWind", patch:{enabled:true, volume:0.5, gustiness:0.5, linkSway:true}}\n' +
      '17. mulSway: {type:"mulSway", value:1.5}\n' +
      '18. setBg: {type:"setBg", color:"#3d84b8"}\n\n' +
      '规则：\n' +
      '- 只输出 JSON 数组，不要其他文字\n' +
      '- elId 省略时自动选择当前选中的角色，或第一个角色\n' +
      '- 颜色用 hex 格式 #rrggbb\n' +
      '- 时间单位为秒，距离单位为像素\n' +
      '- 如果用户请求的是特效（下雨/下雪/粒子等），输出 [] 并在 reply 字段说明\n';

    ui.progress('正在理解你的需求…');
    const reply = await ai.chat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: '场景上下文：' + JSON.stringify(ctx) + '\n用户请求：' + text }
    ], 500);

    if (!reply) {
      // LLM 失败，尝试本地解析
      const ops = makeAction(text);
      if (ops) { applyOps(ops); return true; }
      return false;
    }

    // 尝试从回复中提取 JSON 数组
    let ops = null;
    try {
      const m = reply.match(/\[[\s\S]*\]/);
      if (m) ops = JSON.parse(m[0]);
    } catch (_) {}

    if (ops && Array.isArray(ops) && ops.length > 0) {
      applyOps(ops);
      ui.aiMsg('✅ 已执行：' + text + '\n（' + ops.length + ' 个操作已应用）');
      return true;
    }

    // 非操作类回复，直接展示
    ui.aiMsg(reply);
    return true;
  }
  function makePlan(text) {
    const scene = S().scene;
    const relax = text.includes('轻松') || text.includes('平静') || text.includes('舒缓');
    const t = +S().t.toFixed(2);
    const chars = scene.elements.filter(e => e.type === 'character');
    const sways = scene.elements.filter(e => e.env && e.env.sway.enabled);
    const ops = [];
    const desc = [];

    // 动作：紧张 → T+5 起跑；轻松 → 改为行走
    if (chars.length) {
      const target = chars.find(e => e.id === S().sel) || chars[0];
      const st = relax ? 'walk' : 'run';
      ops.push({ type: 'addCharCue', elId: target.id, t: +(t + 5).toFixed(1), state: st });
      desc.push('T+' + (t + 5).toFixed(1) + 's 让「' + target.name + '」切换为「' + AFX.CHAR_STATES[st] + '」');
    } else {
      desc.push('（场景中没有角色，跳过动作建议）');
    }
    // 树木摇摆幅度
    if (sways.length) {
      const mul = relax ? 0.6 : 1.5;
      ops.push({ type: 'mulSway', value: mul });
      desc.push('植被摇摆幅度' + (relax ? '减弱' : '增强') + ' ' + Math.round(Math.abs(mul - 1) * 100) + '%');
    }
    // 风声环境音
    ops.push({
      type: 'setWind',
      patch: relax
        ? { enabled: true, volume: 0.2, gustiness: 0.3, linkSway: true }
        : { enabled: true, volume: 0.7, gustiness: 0.75, linkSway: true }
    });
    desc.push(relax ? '风声转为轻柔（音量 0.2）' : '加入急促的风声（音量 0.7，阵风增强）');

    return {
      kind: 'plan',
      title: relax ? '氛围建议：舒缓轻松' : '氛围建议：紧张感',
      detail: desc.map(d => '• ' + d).join('\n'),
      ops
    };
  }

  /* ==================== 本地大脑：逻辑纠错 ==================== */
  function scanConflicts() {
    const scene = S().scene;
    const issues = [];
    scene.elements.forEach(el => {
      if (el.type !== 'character') return;
      const states = new Set([el.char.state]);
      (el.char.cues || []).forEach(u => { if (u.state) states.add(u.state); });
      const fixTarget = () => el;
      if (el.char.race === 'fish' && states.has('fly')) {
        issues.push({
          text: '检测到生物属性冲突：「' + el.name + '」是鱼类，却被安排了飞行状态。',
          fixes: [
            { label: '切换为水下环境（改为游泳）', ops: [{ type: 'fixState', elId: el.id, state: 'swim' }, { type: 'setBg', color: '#3d84b8' }] },
            { label: '将该生物切换为鸟类', ops: [{ type: 'fixRace', elId: el.id, race: 'bird' }] }
          ],
          fixTarget
        });
      }
      if (el.char.race === 'fish' && (states.has('walk') || states.has('run') || states.has('sit'))) {
        issues.push({
          text: '检测到生物属性冲突：「' + el.name + '」是鱼类，无法在陆地上' + (states.has('sit') ? '坐下' : '行走/跑动') + '。',
          fixes: [
            { label: '切换为游泳', ops: [{ type: 'fixState', elId: el.id, state: 'swim' }, { type: 'setBg', color: '#3d84b8' }] },
            { label: '将该生物切换为人类', ops: [{ type: 'fixRace', elId: el.id, race: 'human' }] }
          ]
        });
      }
      if (el.char.race === 'bird' && states.has('swim')) {
        issues.push({
          text: '检测到生物属性冲突：「' + el.name + '」是鸟类，却被安排了游泳状态。',
          fixes: [
            { label: '切换为飞行', ops: [{ type: 'fixState', elId: el.id, state: 'fly' }] },
            { label: '将该生物切换为鱼类', ops: [{ type: 'fixRace', elId: el.id, race: 'fish' }, { type: 'setBg', color: '#3d84b8' }] }
          ]
        });
      }
    });
    return issues;
  }

  /* ==================== 自主功能生成 ==================== */
  const FEATURE_KINDS = {
    rain:     { match: ['下雨', '雨滴', '雨水', '暴雨'], name: 'rain-effect', label: '雨滴粒子系统' },
    snow:     { match: ['下雪', '雪花', '雪景'], name: 'snow-effect', label: '雪花粒子系统' },
    fireflies:{ match: ['萤火虫', '流萤'], name: 'fireflies-effect', label: '萤火虫光点系统' },
    sparkle:  { match: ['闪烁', '星光', '星星闪', '亮晶晶'], name: 'sparkle-effect', label: '星光闪烁系统' },
    petals:   { match: ['花瓣', '樱花', '落叶'], name: 'petals-effect', label: '飘落花瓣系统' },
    confetti: { match: ['彩带', '礼花', '庆祝'], name: 'confetti-effect', label: '彩带庆祝系统' },
    smoke:    { match: ['烟雾', '烟', '云雾'], name: 'smoke-effect', label: '烟雾上升系统' },
    bubbles:  { match: ['水下气泡', '水泡'], name: 'bubbles-effect', label: '水下气泡系统' },
    glow:     { match: ['发光', '光晕', 'bloom'], name: 'glow-effect', label: '光晕叠加系统' },
    shake:    { match: ['震动', '抖动', '晃动画面', '地震'], name: 'shake-effect', label: '画面震动系统' }
  };
  const COLOR_WORDS = { 红: '#ff6b6b', 粉: '#fd79a8', 蓝: '#74b9ff', 绿: '#55efc4', 黄: '#ffeaa7', 紫: '#a29bfe', 白: '#ffffff', 黑: '#2d3436', 金: '#f9ca24' };

  function matchFeatureKind(text) {
    for (const [kind, def] of Object.entries(FEATURE_KINDS)) {
      if (def.match.some(w => text.includes(w))) return kind;
    }
    return null;
  }

  /* ---- 插件代码模板生成器 ---- */
  function makeEffectCode(kind, opts) {
    opts = opts || {};
    const name = opts.name || (FEATURE_KINDS[kind] ? FEATURE_KINDS[kind].name : 'custom-effect');
    const color = opts.color || { rain: '#9ad0ff', snow: '#ffffff', petals: '#fd79a8', confetti: '#ffeaa7', smoke: '#aab7c4', bubbles: 'rgba(200,230,255,0.9)', fireflies: '#ffeaa7', sparkle: '#fff', glow: '#74b9ff' }[kind] || '#9ad0ff';
    const p = JSON.stringify(defaultParams(kind, color));
    const ui = JSON.stringify(defaultSchema(kind));

    const bodies = {
      fall: `init(c){ this.items=[]; for(let i=0;i<__COUNT;i++) this.items.push(this.spawn(c,true)); },
spawn(c,anywhere){ const s=c.scene.meta; const R=Math.random;
  return { x:R()*s.width, y:anywhere?R()*s.height:-10, vy:__VY*(0.7+R()*0.6), vx:__VX*(R()-0.2), rot:R()*6.28, vr:(R()-0.5)*3, size:__SIZE*(0.7+R()*0.6) }; },
update(dt){ const c=this.ctx; const g=c.fxCtx; if(!g) return; const s=c.scene.meta; const p=c.params;
  for(const it of this.items){
    it.x+=it.vx*(dt||0.016)*60*0.016*60; it.y+=it.vy*(dt||0.016)*60; it.rot+=it.vr*(dt||0.016);
    if(it.y>s.height+12){ Object.assign(it,this.spawn(c,false)); }
    if(it.x<-12) it.x=s.width+10; if(it.x>s.width+12) it.x=-10;
    __DRAW
  } }`,
      rise: `init(c){ this.items=[]; for(let i=0;i<__COUNT;i++) this.items.push(this.spawn(c,true)); },
spawn(c,anywhere){ const s=c.scene.meta; const R=Math.random;
  return { x:R()*s.width, y:anywhere?R()*s.height:s.height+10, vy:__VY*(0.7+R()*0.6), wob:R()*6.28, size:__SIZE*(0.6+R()*0.8), a:1 }; },
update(dt){ const c=this.ctx; const g=c.fxCtx; if(!g) return; const s=c.scene.meta; const step=(dt||0.016);
  for(const it of this.items){
    it.wob+=step*2; it.x+=Math.sin(it.wob)*0.5; it.y-=it.vy*step*60; it.a-=step*0.12;
    if(it.y<-12||it.a<=0){ Object.assign(it,this.spawn(c,false)); }
    __DRAW
  } }`,
      wander: `init(c){ this.items=[]; for(let i=0;i<__COUNT;i++) this.items.push(this.spawn(c)); },
spawn(c){ const s=c.scene.meta; const R=Math.random;
  return { x:R()*s.width, y:R()*s.height*0.8, a:R()*6.28, sp:0.4+R()*0.8, ph:R()*6.28, size:__SIZE*(0.6+R()*0.8) }; },
update(dt){ const c=this.ctx; const g=c.fxCtx; if(!g) return; const s=c.scene.meta; const step=(dt||0.016); const tm=c.time;
  for(const it of this.items){
    it.a+=(Math.random()-0.5)*0.6; it.x+=Math.cos(it.a)*it.sp; it.y+=Math.sin(it.a)*it.sp*0.6;
    if(it.x<0)it.x=s.width; if(it.x>s.width)it.x=0; if(it.y<0)it.y=s.height*0.8; if(it.y>s.height*0.8)it.y=0;
    __DRAW
  } }`,
      twinkle: `init(c){ this.items=[]; for(let i=0;i<__COUNT;i++) this.items.push(this.spawn(c)); },
spawn(c){ const s=c.scene.meta; const R=Math.random;
  return { x:R()*s.width, y:R()*s.height, ph:R()*6.28, sp:1+R()*2, size:__SIZE*(0.6+R()*1.2) }; },
update(dt){ const c=this.ctx; const g=c.fxCtx; if(!g) return; const tm=c.time;
  for(const it of this.items){
    const al=0.25+0.75*Math.abs(Math.sin(tm*it.sp+it.ph));
    __DRAW
  } }`,
      shake: `init(c){ this.dur=0; },
update(dt){ const c=this.ctx; const st=c.stage; if(!st) return; const step=(dt||0);
  if(c.playing){ this.dur=Math.min(1,this.dur+(dt||0)*0.4); } else { this.dur=0; }
  const amp=__SIZE*this.dur*(0.6+0.4*Math.sin(c.time*30));
  st.style.transform='translate('+((Math.random()-0.5)*amp)+'px,'+((Math.random()-0.5)*amp)+'px)';
  if(!c.playing) st.style.transform=''; },
destroy(){ const st=document.getElementById('stage'); if(st) st.style.transform=''; }`,
      glow: `init(c){},
update(dt){ const c=this.ctx; const g=c.fxCtx; if(!g) return; const s=c.scene.meta;
  const al=0.10+0.10*Math.sin(c.time*1.5);
  const gr=g.createRadialGradient(s.width/2,s.height/2,s.height*0.1,s.width/2,s.height/2,s.width*0.7);
  gr.addColorStop(0,__COLOR_GRAD); gr.addColorStop(1,'rgba(0,0,0,0)');
  g.globalAlpha=al*(c.params.strength||1); g.fillStyle=gr; g.fillRect(0,0,s.width,s.height); g.globalAlpha=1; }`
    };

    const drawByKind = {
      rain: `g.globalAlpha=0.7; g.strokeStyle=p.color; g.lineWidth=1.2; g.beginPath(); g.moveTo(it.x,it.y); g.lineTo(it.x-it.vx*2,it.y-14); g.stroke(); g.globalAlpha=1;`,
      snow: `g.globalAlpha=0.9; g.fillStyle=p.color; g.beginPath(); g.arc(it.x,it.y,it.size,0,6.283); g.fill(); g.globalAlpha=1;`,
      petals: `g.save(); g.translate(it.x,it.y); g.rotate(it.rot); g.fillStyle=p.color; g.globalAlpha=0.85; g.beginPath(); g.ellipse(0,0,it.size,it.size*0.5,0,0,6.283); g.fill(); g.restore(); g.globalAlpha=1;`,
      confetti: `g.save(); g.translate(it.x,it.y); g.rotate(it.rot); g.fillStyle=p.color; g.fillRect(-it.size,-it.size*0.5,it.size*2,it.size); g.restore();`,
      smoke: `g.globalAlpha=Math.max(0,it.a)*0.35; g.fillStyle=p.color; g.beginPath(); g.arc(it.x,it.y,it.size*(2-it.a),0,6.283); g.fill(); g.globalAlpha=1;`,
      bubbles: `g.globalAlpha=0.8; g.strokeStyle=p.color; g.lineWidth=1.4; g.beginPath(); g.arc(it.x,it.y,it.size,0,6.283); g.stroke(); g.globalAlpha=1;`,
      fireflies: `const al=0.4+0.6*Math.abs(Math.sin(tm*2+it.ph)); g.globalAlpha=al; g.fillStyle=p.color; g.shadowColor=p.color; g.shadowBlur=8; g.beginPath(); g.arc(it.x,it.y,it.size,0,6.283); g.fill(); g.shadowBlur=0; g.globalAlpha=1;`,
      sparkle: `g.save(); g.translate(it.x,it.y); g.globalAlpha=al; g.fillStyle=p.color; g.rotate(tm*0.5); g.fillRect(-it.size,-0.5,it.size*2,1); g.fillRect(-0.5,-it.size,1,it.size*2); g.restore(); g.globalAlpha=1;`
    };

    let mode, draw = '';
    if (kind === 'rain' || kind === 'snow' || kind === 'petals' || kind === 'confetti') { mode = 'fall'; draw = drawByKind[kind]; }
    else if (kind === 'smoke' || kind === 'bubbles') { mode = 'rise'; draw = drawByKind[kind]; }
    else if (kind === 'fireflies') { mode = 'wander'; draw = drawByKind[kind]; }
    else if (kind === 'sparkle') { mode = 'twinkle'; draw = drawByKind[kind]; }
    else if (kind === 'shake') { mode = 'shake'; }
    else if (kind === 'glow') { mode = 'glow'; }
    else { mode = 'fall'; draw = drawByKind.snow; }   // 自定义默认：同雪落粒子

    let body = bodies[mode]
      .replace(/__COUNT/g, '__PCOUNT')
      .replace(/__VY/g, '__PVY')
      .replace(/__VX/g, '__PVX')
      .replace(/__SIZE/g, '__PSIZE')
      .replace(/__DRAW/g, draw)
      .replace(/__COLOR_GRAD/g, "p.color.replace(')', ',0.55)').replace('rgb','rgba').replace('#','#') === p.color ? hexA(p.color,0.55) : p.color");

    // glow 模板里的渐变色处理简化：直接在代码内定义 hexA
    const prelude = mode === 'glow' ? 'function hexA(hex,a){const n=parseInt(hex.slice(1),16);return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+((n)&255)+","+a+")";}\n' : '';

    return prelude +
      'const plugin = {\n' +
      '  name: ' + JSON.stringify(name) + ',\n' +
      '  params: ' + p + ',\n' +
      '  ui: ' + ui + ',\n' +
      '  init(c){ this.ctx=c; this.ctxRef=c; ' + body.split('init(c){')[1].split('},\nspawn')[0].replace('init(c){','') + ' },\n';
  }
  /* 上面的字符串拼接容易出错，改用结构化模板（见 makeEffectCodeV2） */

  function defaultParams(kind, color) {
    const base = { color };
    switch (kind) {
      case 'rain': return Object.assign(base, { count: 140, speed: 9, slant: 1.5, size: 1 });
      case 'snow': return Object.assign(base, { count: 90, speed: 1.6, size: 2.4 });
      case 'petals': return Object.assign(base, { count: 40, speed: 2.2, size: 5 });
      case 'confetti': return Object.assign(base, { count: 80, speed: 4, size: 4 });
      case 'smoke': return Object.assign(base, { count: 30, speed: 1.2, size: 14 });
      case 'bubbles': return Object.assign(base, { count: 40, speed: 1.8, size: 4 });
      case 'fireflies': return Object.assign(base, { count: 26, size: 2.2 });
      case 'sparkle': return Object.assign(base, { count: 60, size: 4 });
      case 'shake': return { strength: 8 };
      case 'glow': return { color, strength: 1 };
      default: return Object.assign(base, { count: 80, speed: 2, size: 3 });
    }
  }
  function defaultSchema(kind) {
    const d = defaultParams(kind, '#ffffff');
    const s = [];
    if ('count' in d) s.push({ key: 'count', label: '数量', min: 5, max: 400, step: 5 });
    if ('speed' in d) s.push({ key: 'speed', label: '速度', min: 0.2, max: 12, step: 0.2 });
    if ('strength' in d) s.push({ key: 'strength', label: '强度', min: 1, max: 20, step: 1 });
    if ('size' in d) s.push({ key: 'size', label: '大小', min: 0.5, max: 20, step: 0.5 });
    if ('slant' in d) s.push({ key: 'slant', label: '倾斜', min: 0, max: 5, step: 0.1 });
    if ('color' in d && kind !== 'glow') s.push({ key: 'color', label: '颜色(hex)', min: 0, max: 0, step: 0 });
    return s;
  }

  /* ---- 结构化代码生成（v2，直接拼完整可运行代码） ---- */
  function makeEffectCodeV2(kind, opts) {
    opts = opts || {};
    const name = opts.name || (FEATURE_KINDS[kind] ? FEATURE_KINDS[kind].name : 'custom-effect');
    const dp = defaultParams(kind, opts.color);
    const schema = defaultSchema(kind);
    const J = v => JSON.stringify(v);

    const particleKinds = {
      rain:     { mode: 'fall', vy: 9,  vx: 1.5, size: 1,   color: opts.color || '#9ad0ff' },
      snow:     { mode: 'fall', vy: 1.6, vx: 0.4, size: 2.4, color: opts.color || '#ffffff' },
      petals:   { mode: 'fall', vy: 2.2, vx: 0.6, size: 5,   color: opts.color || '#fd79a8', shape: 'petal' },
      confetti: { mode: 'fall', vy: 4,   vx: 0.8, size: 4,   color: opts.color || '#ffeaa7', shape: 'rect' },
      smoke:    { mode: 'rise', vy: 1.2, vx: 0,   size: 14,  color: opts.color || '#aab7c4', shape: 'soft' },
      bubbles:  { mode: 'rise', vy: 1.8, vx: 0,   size: 4,   color: opts.color || 'rgba(200,230,255,0.9)', shape: 'ring' },
      fireflies:{ mode: 'wander', size: 2.2, color: opts.color || '#ffeaa7', shape: 'glow' },
      sparkle:  { mode: 'twinkle', size: 4,  color: opts.color || '#ffffff', shape: 'star' }
    };

    const head =
      'const plugin = {\n' +
      '  name: ' + J(name) + ',\n' +
      '  params: ' + J(dp) + ',\n' +
      '  ui: ' + J(schema) + ',\n';

    if (kind === 'shake') {
      return head +
        '  init(c){ this.ctx=c; },\n' +
        '  update(dt){ const c=this.ctx; const st=c.stage; if(!st) return; const d=(dt||0);\n' +
        '    let amp=0; if(c.playing){ amp=(c.params.strength||8)*0.8; }\n' +
        '    if(amp>0){ st.style.transform="translate("+((Math.random()-0.5)*amp)+"px,"+((Math.random()-0.5)*amp)+"px)"; }\n' +
        '    else { st.style.transform=""; }\n' +
        '  },\n' +
        '  destroy(){ const st=document.getElementById("stage"); if(st) st.style.transform=""; }\n' +
        '};\n';
    }
    if (kind === 'glow') {
      return head +
        '  init(c){ this.ctx=c; },\n' +
        '  update(dt){ const c=this.ctx; const g=c.fxCtx; if(!g) return; const s=c.scene.meta;\n' +
        '    const al=(0.10+0.10*Math.sin(c.time*1.5))*(c.params.strength||1);\n' +
        '    const gr=g.createRadialGradient(s.width/2,s.height/2,s.height*0.1,s.width/2,s.height/2,s.width*0.7);\n' +
        '    gr.addColorStop(0,c.params.color+"8c"); gr.addColorStop(1,"rgba(0,0,0,0)");\n' +
        '    g.globalAlpha=Math.max(0,al); g.fillStyle=gr; g.fillRect(0,0,s.width,s.height); g.globalAlpha=1;\n' +
        '  },\n' +
        '  destroy(){}\n' +
        '};\n';
    }

    const pk = particleKinds[kind] || { mode: 'fall', vy: 2, vx: 0.5, size: 3, color: opts.color || '#9ad0ff', shape: 'dot' };
    const spawnExpr =
      pk.mode === 'fall'
        ? '{ x:R()*s.width, y:anywhere?R()*s.height:-10, vy:p.speed*(0.7+R()*0.6), vx:p.slant!=null?p.slant*(R()*0.6+0.2):(R()-0.2), rot:R()*6.28, vr:(R()-0.5)*3, size:p.size*(0.7+R()*0.6) }'
        : pk.mode === 'rise'
          ? '{ x:R()*s.width, y:anywhere?R()*s.height:s.height+10, vy:p.speed*(0.7+R()*0.6), wob:R()*6.28, size:p.size*(0.6+R()*0.8), a:1 }'
          : pk.mode === 'wander'
            ? '{ x:R()*s.width, y:R()*s.height*0.85, a:R()*6.28, sp:0.4+R()*0.9, ph:R()*6.28, size:p.size*(0.6+R()*0.8) }'
            : '{ x:R()*s.width, y:R()*s.height, ph:R()*6.28, sp:1+R()*2, size:p.size*(0.6+R()*1.2) }';

    let moveBlock = '';
    let drawBlock = '';
    if (pk.mode === 'fall') {
      moveBlock = 'it.y+=it.vy*d60; it.x+=it.vx*d60*0.6; it.rot+=it.vr*d60;\n' +
        '    if(it.y>s.height+12){ Object.assign(it,this.spawn(c,false)); }\n' +
        '    if(it.x<-12) it.x=s.width+10; if(it.x>s.width+12) it.x=-10;';
      drawBlock =
        pk.shape === 'petal'
          ? 'g.save(); g.translate(it.x,it.y); g.rotate(it.rot); g.globalAlpha=0.85; g.fillStyle=p.color; g.beginPath(); g.ellipse(0,0,it.size,it.size*0.5,0,0,6.283); g.fill(); g.restore(); g.globalAlpha=1;'
          : pk.shape === 'rect'
            ? 'g.save(); g.translate(it.x,it.y); g.rotate(it.rot); g.fillStyle=p.color; g.fillRect(-it.size,-it.size*0.5,it.size*2,it.size); g.restore();'
            : 'g.globalAlpha=0.85; g.fillStyle=p.color; g.beginPath(); g.arc(it.x,it.y,Math.max(0.5,it.size),0,6.283); g.fill(); g.globalAlpha=1;';
    } else if (pk.mode === 'rise') {
      moveBlock = 'it.wob+=step*2; it.x+=Math.sin(it.wob)*0.5; it.y-=it.vy*d60; it.a-=step*0.12;\n' +
        '    if(it.y<-12||it.a<=0){ Object.assign(it,this.spawn(c,false)); }';
      drawBlock =
        pk.shape === 'soft'
          ? 'g.globalAlpha=Math.max(0,it.a)*0.35; g.fillStyle=p.color; g.beginPath(); g.arc(it.x,it.y,it.size*(2-it.a),0,6.283); g.fill(); g.globalAlpha=1;'
          : 'g.globalAlpha=Math.max(0,Math.min(1,it.a)); g.strokeStyle=p.color; g.lineWidth=1.4; g.beginPath(); g.arc(it.x,it.y,it.size,0,6.283); g.stroke(); g.globalAlpha=1;';
    } else if (pk.mode === 'wander') {
      moveBlock = 'it.a+=(Math.random()-0.5)*0.6; it.x+=Math.cos(it.a)*it.sp; it.y+=Math.sin(it.a)*it.sp*0.6;\n' +
        '    if(it.x<0)it.x=s.width; if(it.x>s.width)it.x=0; if(it.y<0)it.y=s.height*0.85; if(it.y>s.height*0.85)it.y=0;';
      drawBlock = 'const al=0.4+0.6*Math.abs(Math.sin(c.time*2+it.ph)); g.globalAlpha=al; g.fillStyle=p.color; g.shadowColor=p.color; g.shadowBlur=8; g.beginPath(); g.arc(it.x,it.y,Math.max(0.5,it.size),0,6.283); g.fill(); g.shadowBlur=0; g.globalAlpha=1;';
    } else { // twinkle
      moveBlock = '';
      drawBlock = 'const al=0.25+0.75*Math.abs(Math.sin(c.time*it.sp+it.ph)); g.save(); g.translate(it.x,it.y); g.globalAlpha=al; g.fillStyle=p.color; g.rotate(c.time*0.5); g.fillRect(-it.size,-0.5,it.size*2,1); g.fillRect(-0.5,-it.size,1,it.size*2); g.restore(); g.globalAlpha=1;';
    }

    const countExpr = (pk.mode === 'twinkle' || pk.mode === 'wander') ? 'c.params.count' : 'c.params.count';

    return head +
      '  init(c){ this.ctx=c; this.items=[]; for(let i=0;i<c.params.count;i++) this.items.push(this.spawn(c,true)); },\n' +
      '  spawn(c, anywhere){ const s=c.scene.meta; const p=c.params; const R=Math.random; return ' + spawnExpr + '; },\n' +
      '  update(dt){ const c=this.ctx; const g=c.fxCtx; if(!g) return; const s=c.scene.meta; const p=c.params;\n' +
      '    const d60=(dt||0.016)*60; const step=(dt||0.016);\n' +
      '    for(const it of this.items){\n' +
      '      ' + moveBlock + '\n' +
      '      ' + drawBlock + '\n' +
      '    }\n' +
      '  },\n' +
      '  destroy(){ this.items=null; }\n' +
      '};\n';
  }

  /* ---- 生成 + 沙盒测试 + 自动修复重试 ---- */
  async function generatePluginFlow(text, ui) {
    const kind = matchFeatureKind(text);
    let color = null;
    Object.entries(COLOR_WORDS).forEach(([w, hex]) => { if (text.includes(w)) color = hex; });
    const label = kind ? FEATURE_KINDS[kind].label : '自定义粒子效果';
    const pluginName = (kind ? FEATURE_KINDS[kind].name : 'custom-effect') + '-' + Date.now().toString(36).slice(-4);

    const r1 = await ai.chat([
      { role: 'system', content: '你是插件命名助手。给动画特效插件取一个简短英文kebab-case名字，只输出名字本身。' },
      { role: 'user', content: text }
    ], 20);
    const finalName = /^[a-z0-9-]{3,40}$/.test(r1 || '') ? r1 : pluginName;

    // 生成计划卡片由 ai-panel 前置完成（plan 消息），此处执行生成
    ui.progress('正在编写插件代码（' + label + '）…');
    let code = makeEffectCodeV2(kind || 'custom', { name: finalName, color });

    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      ui.progress('沙盒测试中（第 ' + attempt + '/3 次尝试）…');
      result = await AFX.pluginsSandboxTest(code);
      if (result.ok) break;
      ui.progress('测试失败：' + String(result.error).split('\n')[0].slice(0, 120) + '，自动修复并重试…');
      // 自动修复策略：重新生成更保守的模板；第 3 次附加守卫包装
      code = makeEffectCodeV2('custom', { name: finalName, color });
      if (attempt === 2) code = code.replace('for(const it of this.items){', 'if(!this.items||!this.items.length) return;\n    for(const it of this.items){');
      if (attempt === 3) {
        code += '\n;["init","update","destroy"].forEach(function(k){ var f=plugin[k]; plugin[k]=function(){ try{ return f.apply(this,arguments); }catch(e){ console.error("[auto-repair]",k,e&&e.message); } }; });\n';
      }
    }
    if (!result || !result.ok) {
      ui.aiMsg('抱歉，自动生成失败（已重试 3 次）。\n错误：' + (result ? String(result.error).slice(0, 300) : '未知'));
      return null;
    }

    const schema = [];
    try {
      const m = code.match(/ui:\s*(\[[\s\S]*?\])\s*,\s*\n\s*init/);
      if (m) schema.push(...JSON.parse(m[1]));
    } catch (_) {}

    const entry = await AFX.plugins.enableWithTest({
      name: finalName,
      code,
      requirement: text,
      paramsSchema: schema
    });
    ui.aiMsg('✅ 新功能已生成并启用：「' + entry.name + '」\n' +
      '• 已注册为 IPlugin 插件（沙盒测试通过：init + 60 帧模拟 + destroy）\n' +
      '• 参数面板见【插件】标签页，可调参数 / 查看源码 / 禁用 / 导出 / 固化\n' +
      '• 点击播放即可看到效果');
    return entry;
  }

  function makeFeaturePlan(text) {
    const kind = matchFeatureKind(text);
    const label = kind ? FEATURE_KINDS[kind].label : '自定义粒子效果';
    const kindName = kind ? FEATURE_KINDS[kind].name : 'custom-effect';
    return {
      kind: 'feature',
      title: '检测到当前系统没有【' + label + '】功能',
      detail: '我计划自动生成以下代码来实现：\n' +
        '• 新增插件：' + kindName + '（雨滴/粒子/特效系统，IPlugin 规范）\n' +
        '• 运行方式：Web Worker 沙盒测试 → 主线程隔离执行，不修改核心引擎\n' +
        '• 预计影响范围：渲染引擎顶层特效画布 / 插件管理面板\n' +
        '• 附带参数面板（数量 / 速度 / 颜色等），可随时禁用或删除',
      requirement: text,
      kind
    };
  }

  /* ==================== 操作应用 ==================== */
  function applyOps(ops) {
    const scene = S().scene;
    ops.forEach(op => {
      switch (op.type) {
        case 'addBubble': {
          const el = AFX.createElement('text', scene);
          el.name = '台词气泡';
          el.content.text = op.text;
          el.content.fontSize = 22;
          el.content.color = op.color || '#2d3436';
          el.content.bubble = true;
          el.style.x = Math.round(op.x); el.style.y = Math.round(op.y);
          el.style.width = 220; el.style.height = 64;
          el.visibility = [{ start: op.start, end: op.end, fadeIn: 0.2, fadeOut: 0.3 }];
          scene.elements.push(el);
          break;
        }
        case 'addCharCue': {
          const el = scene.elements.find(e => e.id === op.elId);
          if (el && el.char) {
            el.char.cues.push({ t: op.t, state: op.state || null, direction: op.direction || null });
            el.char.cues.sort((a, b) => a.t - b.t);
          }
          break;
        }
        case 'mulSway': {
          scene.elements.forEach(e => {
            if (e.env && e.env.sway && e.env.sway.enabled) {
              e.env.sway.strength = Math.max(0, +(e.env.sway.strength * op.value).toFixed(2));
            }
          });
          break;
        }
        case 'setWind': {
          if (scene.env && scene.env.wind) Object.assign(scene.env.wind, op.patch);
          break;
        }
        case 'fixRace': {
          const el = scene.elements.find(e => e.id === op.elId);
          if (el && el.char) el.char.race = op.race;
          break;
        }
        case 'fixState': {
          const el = scene.elements.find(e => e.id === op.elId);
          if (el && el.char) {
            el.char.state = op.state;
            el.char.cues = (el.char.cues || []).filter(u => u.state !== 'fly' && u.state !== 'walk' && u.state !== 'run' && u.state !== 'sit');
          }
          break;
        }
        case 'setBg': {
          scene.meta.background = op.color;
          break;
        }
        /* ============ 扩展操作：直接控制角色 ============ */
        case 'setCharState': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el && el.char) el.char.state = op.state;
          break;
        }
        case 'setCharDirection': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el && el.char) el.char.direction = op.direction;
          break;
        }
        case 'setCharSpeed': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el && el.char) el.char.speed = Math.max(0.1, op.speed);
          break;
        }
        case 'setCharRace': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el && el.char) el.char.race = op.race;
          break;
        }
        /* ============ 扩展操作：元素控制 ============ */
        case 'setMove': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el) {
            if (op.enabled != null) el.animations.move.enabled = op.enabled;
            if (op.direction) el.animations.move.direction = op.direction;
            if (op.distance != null) el.animations.move.distance = op.distance;
            if (op.duration != null) el.animations.move.duration = op.duration;
            if (op.delay != null) el.animations.move.delay = op.delay;
            if (op.easing) el.animations.move.easing = op.easing;
          }
          break;
        }
        case 'setElementPos': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el) {
            if (op.x != null) el.style.x = op.x;
            if (op.y != null) el.style.y = op.y;
          }
          break;
        }
        case 'setElementSize': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el) {
            if (op.width != null) el.style.width = Math.max(4, op.width);
            if (op.height != null) el.style.height = Math.max(4, op.height);
          }
          break;
        }
        case 'setElementOpacity': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el) el.style.opacity = Math.min(1, Math.max(0, op.opacity));
          break;
        }
        case 'setElementRotation': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el) el.style.rotation = op.rotation;
          break;
        }
        case 'setElementColor': {
          const el = op.elId ? scene.elements.find(e => e.id === op.elId) : scene.elements.find(e => e.type === 'character');
          if (el && el.char) {
            if (op.skin) el.char.skin = op.skin;
            if (op.shirt) el.char.shirt = op.shirt;
            if (op.pants) el.char.pants = op.pants;
          }
          if (el && el.type === 'text' && op.color) el.content.color = op.color;
          break;
        }
        /* ============ 扩展操作：场景控制 ============ */
        case 'setSceneMeta': {
          if (op.duration != null) scene.meta.duration = Math.max(1, op.duration);
          if (op.width != null) scene.meta.width = Math.max(200, op.width);
          if (op.height != null) scene.meta.height = Math.max(200, op.height);
          if (op.background != null) scene.meta.background = op.background;
          break;
        }
        case 'addElement': {
          const el = AFX.createElement(op.elementType || 'character', scene);
          if (op.name) el.name = op.name;
          if (op.x != null) el.style.x = op.x;
          if (op.y != null) el.style.y = op.y;
          if (op.width != null) el.style.width = op.width;
          if (op.height != null) el.style.height = op.height;
          if (op.state && el.char) el.char.state = op.state;
          if (op.direction && el.char) el.char.direction = op.direction;
          if (op.text != null && el.type === 'text') el.content.text = op.text;
          scene.elements.push(el);
          break;
        }
        case 'deleteElement': {
          const i = scene.elements.findIndex(e => e.id === op.elId);
          if (i >= 0) {
            scene.elements.splice(i, 1);
            if (S().sel === op.elId) S().sel = null;
          }
          break;
        }
        case 'selectElement': {
          S().sel = op.elId;
          break;
        }
      }
    });
    AFX.refreshAll();
    const stage = document.getElementById('stage');
    if (stage && scene.meta.background) stage.style.background = scene.meta.background;
    AFX.bus.emit('ai:applied', { ops });
  }
  AFX.aiApplyOps = applyOps;

  /* ==================== 主分发器 ==================== */
  ai.handle = async function (text, ui) {
    const intent = detectIntent(text);

    if (intent === 'help') {
      ui.aiMsg(
        '我是 AI 导演助手，能力包括：\n' +
        '1. 角色控制 —— 说「让角色向右走」「让他跑起来」「飞起来」直接执行\n' +
        '2. 场景编辑 —— 说「背景改成蓝色」「时长改为10秒」直接执行\n' +
        '3. 台词气泡 —— 选中角色后说「他这时候很生气」生成台词\n' +
        '4. 动作编排 —— 说「这里需要一点紧张感」，给出编排建议\n' +
        '5. 逻辑纠错 —— 说「检查一下场景」，检测冲突\n' +
        '6. 自主功能生成 —— 说「我想加一个下雨的效果」，自动编写插件代码\n' +
        '7. 自由对话 —— 任何问题都能问，配置了大模型时直接理解并执行\n' +
        (this.endpoint.url
          ? '已接入：' + (this.getProvider(this.endpoint.provider) || {}).name + ' / ' + this.endpoint.model
          : '当前为本地模拟大脑（设置里可接入 12 家大模型，含免费额度）')
      );
      return;
    }

    if (intent === 'conflict') {
      const issues = scanConflicts();
      if (!issues.length) {
        ui.aiMsg('✅ 检查完毕：未发现生物属性与环境冲突（鱼类不会在飞、鸟类没有在游泳）。');
      } else {
        ui.conflict(issues);
      }
      return;
    }

    if (intent === 'feature') {
      const plan = makeFeaturePlan(text);
      const entry = ui.featureConfirm(plan);
      const ok = await entry;
      if (ok) await generatePluginFlow(text, ui);
      return;
    }

    if (intent === 'plan') {
      const plan = makePlan(text);
      ui.plan(plan);
      return;
    }

    if (intent === 'dialogue') {
      const card = await makeDialogue(text);
      ui.plan(card);
      return;
    }

    if (intent === 'action') {
      // 先尝试本地快速解析
      const localOps = makeAction(text);
      if (localOps) {
        applyOps(localOps);
        ui.aiMsg('✅ 已执行：' + text + '\n（' + localOps.length + ' 个操作已应用，点击播放查看效果）');
        return;
      }
      // 本地解析失败 → LLM 自主操作生成
      const handled = await llmGenerateOps(text, ui);
      if (!handled) {
        ui.aiMsg('我没能理解这个指令。试试这样说：\n• 让角色向右走\n• 让他跑起来\n• 背景改成蓝色\n• 添加一个角色');
      }
      return;
    }

    if (intent === 'chat') {
      if (text.includes('看看场景') || text.includes('上下文')) {
        ui.aiMsg('当前场景 JSON 快照：\n' + JSON.stringify(ai.contextSnapshot(), null, 1).slice(0, 2400));
        return;
      }
      // 自由对话：优先用 LLM 生成操作（能执行就执行）
      const handled = await llmGenerateOps(text, ui);
      if (!handled) {
        ui.aiMsg(
          '收到！你可以这样指挥我：\n' +
          '• 「让角色向右走」→ 角色自动行走\n' +
          '• 「让他跑起来」→ 切换为跑动状态\n' +
          '• 「背景改成蓝色」→ 修改场景背景\n' +
          '• 「我想加一个下雨的效果」→ 自动生成新功能\n' +
          '• 「检查一下场景」→ 逻辑纠错'
        );
      }
      return;
    }
  };

  AFX.ai = ai;
})();

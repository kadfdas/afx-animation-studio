/* ============================================================
 * environment.js — 自然环境与音效系统 (Environment & Audio FX)
 *  - SwayController：基于正弦波的程序化植被摇摆（无需逐帧动画）
 *      角度 = 振幅 × sin(2π·频率·t + 相位) × 阵风系数(全局风力调制)
 *  - 环境音轨：WebAudio 程序化"风声"发生器（区别于 BGM 音频元素）
 *      白噪声 → 低通滤波 → 增益；音量可联动植被摇摆能量（树动越大声越大）
 *  - 属性 UI：元素摇摆组 + 场景风声组（未选中元素时显示）
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const S = () => AFX.state;
  const TAU = Math.PI * 2;

  /* ==================== SwayController ==================== */
  AFX.swayAngleAt = function (el, t) {
    const sw = el.env && el.env.sway;
    if (!sw || !sw.enabled) return 0;
    const scene = S().scene;
    const wind = (scene && scene.env && scene.env.wind) || {};
    const masterStrength = wind.masterStrength == null ? 1 : wind.masterStrength;
    const masterSpeed = wind.masterSpeed == null ? 1 : wind.masterSpeed;
    const gust = wind.gustiness == null ? 0.5 : wind.gustiness;

    // 阵风系数：慢周期正弦调制，让风一阵一阵
    const gustFactor = 1 - gust * 0.5 + gust * 0.5 * Math.sin(t * TAU * 0.17 + 1.3);
    const amp = (sw.strength || 0) * masterStrength;
    const freq = Math.max(0.01, (sw.speed || 0.5) * masterSpeed);
    return amp * Math.sin(TAU * freq * t + (sw.phase || 0)) * gustFactor;
  };

  /* 摇摆能量 0~1：所有启用摇摆元素的平均归一化幅度（供风声联动） */
  AFX.envSwayEnergy = function (t) {
    const scene = S().scene;
    if (!scene) return 0;
    let sum = 0, n = 0;
    scene.elements.forEach(el => {
      const sw = el.env && el.env.sway;
      if (sw && sw.enabled) {
        sum += Math.min(1, Math.abs(AFX.swayAngleAt(el, t)) / Math.max(1, sw.strength));
        n += 1;
      }
    });
    return n ? sum / n : 0;
  };

  /* ==================== 环境风声发生器（WebAudio） ==================== */
  const wind = {
    ctx: null, gain: null, filter: null, started: false,
    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
        // 白噪声缓冲（2 秒循环）
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          // 布朗化白噪声 → 更接近风声的低频质感
          const white = Math.random() * 2 - 1;
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.2;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 500;
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0;
        src.connect(this.filter).connect(this.gain).connect(this.ctx.destination);
        src.start();
        this.started = true;
        return true;
      } catch (e) {
        console.warn('[AFX] 风声初始化失败:', e);
        return false;
      }
    },
    unlock() {   // 必须在用户手势栈内调用（浏览器 autoplay 策略）
      if (!this.ensure()) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    suspend() {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    },
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    /* 每帧更新：音量 = 基础音量 × 阵风 × 摇摆联动 */
    update(t) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const scene = S().scene;
      const conf = scene && scene.env && scene.env.wind;
      if (!conf) return;
      const playing = S().playing;
      const enabled = !!conf.enabled;
      let target = 0;
      if (playing && enabled) {
        const gust = conf.gustiness == null ? 0.5 : conf.gustiness;
        const gustFactor = 0.75 + 0.25 * Math.sin(t * TAU * 0.17 + 1.3);
        target = (conf.volume == null ? 0.4 : conf.volume) * gustFactor;
        if (conf.linkSway) {
          const energy = AFX.envSwayEnergy(t);
          target *= 0.45 + 0.55 * Math.min(1, energy * 1.6);   // 树动得厉害 → 风声变大
        }
        // 阵风感越强，滤波频率越高（呼啸感）
        if (this.filter) {
          this.filter.frequency.setTargetAtTime(380 + 900 * gust, this.ctx.currentTime, 0.15);
        }
      }
      if (this.gain) this.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, target)) * 0.5, this.ctx.currentTime, 0.1);
    }
  };
  AFX.envAudio = wind;
  AFX.envUpdate = function (t) { wind.update(t); };
  AFX.unlockEnvAudio = function () { wind.unlock(); };

  /* ==================== 属性 UI ==================== */
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
  function prow(label, ...controls) {
    return h('div', { class: 'prow' }, h('span', { class: 'plabel' }, label), ...controls);
  }
  function group(title, bodyChildren, headerExtra) {
    const head = h('div', { class: 'pg-head' }, h('span', {}, title));
    if (headerExtra) head.appendChild(headerExtra);
    const body = h('div', { class: 'pg-body' }, ...bodyChildren);
    return h('div', { class: 'prop-group' }, head, body);
  }
  function numInput(value, onChange, opt = {}) {
    const inp = h('input', { type: 'number', value: String(value), step: opt.step != null ? String(opt.step) : '1' });
    if (opt.min != null) inp.min = opt.min;
    if (opt.max != null) inp.max = opt.max;
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (isFinite(v)) onChange(v);
    });
    return inp;
  }
  function chk(value, onChange, label) {
    const wrap = h('label', { style: 'display:flex;align-items:center;gap:4px;cursor:pointer;' });
    const box = h('input', { type: 'checkbox' });
    box.checked = !!value;
    box.addEventListener('change', () => onChange(box.checked));
    wrap.appendChild(box);
    if (label) wrap.appendChild(h('span', {}, label));
    return wrap;
  }

  /* --- 元素：风吹摇摆（SwayController 参数） --- */
  function swayGroup(el) {
    const sw = el.env.sway;
    const g = group('风吹摇摆（SwayController）', [
      prow('频率·风速(Hz)', numInput(sw.speed, v => { sw.speed = Math.max(0.05, v); AFX.applyFrame(S().t); }, { step: 0.1, min: 0.05 })),
      prow('振幅·风力(°)', numInput(sw.strength, v => { sw.strength = Math.max(0, v); AFX.applyFrame(S().t); }, { step: 1, min: 0, max: 45 })),
      prow('相位(°)', numInput(sw.phase, v => { sw.phase = v; AFX.applyFrame(S().t); }, { step: 15 })),
      h('div', { style: 'color:var(--txt-dim);font-size:11px;' }, '以底部为轴心正弦摆动；未选中元素时可在场景环境中调全局风力')
    ], chk(sw.enabled, on => { sw.enabled = on; AFX.applyFrame(S().t); }, '启用'));
    return g;
  }

  /* --- 场景级：风声环境音轨 + 全局风力（未选中任何元素时显示） --- */
  function sceneEnvGroup() {
    const scene = S().scene;
    const w = scene.env.wind;
    return group('场景环境（风声音轨 / 全局风力）', [
      prow('风声音量', numInput(w.volume, v => { w.volume = Math.min(1, Math.max(0, v)); }, { step: 0.05, min: 0, max: 1 })),
      prow('阵风感', numInput(w.gustiness, v => { w.gustiness = Math.min(1, Math.max(0, v)); }, { step: 0.05, min: 0, max: 1 })),
      prow('联动摇摆', chk(w.linkSway, on => { w.linkSway = on; }, '树动越大风声越大')),
      prow('全局风力', numInput(w.masterStrength, v => { w.masterStrength = Math.max(0, v); AFX.applyFrame(S().t); }, { step: 0.1, min: 0 })),
      prow('全局风速', numInput(w.masterSpeed, v => { w.masterSpeed = Math.max(0.1, v); AFX.applyFrame(S().t); }, { step: 0.1, min: 0.1 })),
      h('div', { style: 'color:var(--txt-dim);font-size:11px;' },
        '环境音轨独立于 BGM（音频元素）：程序化合成风声，播放时自动循环；需点击播放按钮解锁声音'),
      prow('',
        h('button', { class: 'mini', onclick: () => { AFX.unlockEnvAudio(); AFX.toast && AFX.toast('已解锁音频上下文，点播放试听风声'); } }, '试听解锁'),
        h('button', {
          class: 'mini',
          onclick: () => {
            // 给场景中第一个未摇摆的 svg 元素快速开启摇摆
            const el = scene.elements.find(e => e.type === 'svg' && !e.env.sway.enabled);
            if (!el) { AFX.toast && AFX.toast('没有可开启摇摆的图形元素'); return; }
            el.env.sway.enabled = true;
            AFX.refreshPropPanel(); AFX.applyFrame(S().t);
          }
        }, '为图形开启摇摆')
      )
    ], chk(w.enabled, on => {
      w.enabled = on;
      if (on) AFX.unlockEnvAudio();
      AFX.toast && AFX.toast(on ? '风声环境音轨已启用' : '风声环境音轨已关闭');
    }, '启用风声'));
  }

  AFX.bus.on('panel:build', ({ el, panel }) => {
    if (!el) return;
    panel.appendChild(swayGroup(el));
  });

  AFX.bus.on('panel:empty', ({ panel }) => {
    panel.appendChild(sceneEnvGroup());
  });
})();

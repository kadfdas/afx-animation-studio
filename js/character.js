/* ============================================================
 * character.js — 角色与生物行为系统 (Character & Creature System)
 *  - 状态机：站立/坐下/行走/跑动/飞行/游泳（AFX.charStateAt 解析 cues）
 *  - 方向控制：8 方向，含水平分量自动镜像翻转
 *  - 环境适配：飞行 Y 轴悬浮 + 翅膀扇动；游泳阻力感 + 水深(Z)层级
 *  - 外观自定义：分层渲染（身体底层程序化绘制 → 衣服层 → 配饰层 PNG）
 *  - 属性 UI：监听 AFX.bus 'panel:build' 追加编辑区
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const S = () => AFX.state;
  const TAU = Math.PI * 2;

  /* ---------------- DOM 小工具（模块自包含） ---------------- */
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
  function selectInput(options, value, onChange) {
    const sel = h('select');
    Object.entries(options).forEach(([val, label]) => {
      const o = h('option', { value: val }, label);
      if (val === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  function colorInput(value, onChange) {
    const inp = h('input', { type: 'color', value: value || '#ffffff' });
    inp.addEventListener('input', () => onChange(inp.value));
    return inp;
  }
  function rangeInput(value, onChange, min, max, step) {
    const wrap = h('span', { style: 'display:flex;align-items:center;gap:6px;flex:1;' });
    const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), style: 'flex:1;' });
    const lab = h('span', { style: 'min-width:30px;text-align:right;color:var(--txt-dim);font-size:11px;' });
    lab.textContent = Number(value).toFixed(2).replace(/\.?0+$/, '') || '0';
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      lab.textContent = v.toFixed(2).replace(/\.?0+$/, '') || '0';
      onChange(v);
    });
    wrap.appendChild(inp); wrap.appendChild(lab);
    return wrap;
  }

  /* ---------------- 服装 PNG 缓存 ---------------- */
  const outfitCache = new Map();
  function getOutfitImg(src) {
    if (!src) return null;
    let img = outfitCache.get(src);
    if (img && img.complete && img.naturalWidth > 0) return img;
    if (!img) {
      img = new Image();
      img.onload = () => { /* 加载完成后下一帧自动绘制 */ };
      img.src = src;
      outfitCache.set(src, img);
    }
    return null;
  }

  /* ---------------- 环境物理特效（供 render.js 每帧调用） ----------------
   * 飞行：Y 轴悬浮（忽略重力）+ 缓慢浮动
   * 游泳：阻力感（浮动减速 + 横向漂移）+ 水深影响层级/雾化
   * ------------------------------------------------------------- */
  AFX.charFxAt = function (el, t) {
    const c = el.char || {};
    const { state } = AFX.charStateAt(el, t);
    const fx = { dy: 0, dx: 0, extraRot: 0, zBoost: 0, blurPx: 0, opMul: 1 };
    const fly = c.fly || {}, swim = c.swim || {};

    if (c.race === 'fish' && state !== 'swim') {
      // 鱼离水：扑腾弹跳（也构成 AI 逻辑纠错的可视线索）
      fx.extraRot = Math.sin(t * 10) * 8;
      fx.dy = -Math.abs(Math.sin(t * 5)) * 10;
      return fx;
    }
    if (state === 'fly') {
      fx.dy = -(fly.hover || 0) + Math.sin(t * TAU * 0.5) * 4;   // 忽略重力，悬浮 + 缓浮
      return fx;
    }
    if (state === 'swim') {
      const drag = Math.min(1, Math.max(0, swim.drag == null ? 0.6 : swim.drag));
      const depth = Math.min(1, Math.max(0, swim.depth == null ? 0.35 : swim.depth));
      // 阻力感：水越深/阻力越大，浮动越慢、幅度越小，并带横向漂移
      const bobSpeed = TAU * (0.3 + 0.5 * (1 - drag)) * (1 - depth * 0.3);
      fx.dy = Math.sin(t * bobSpeed) * 5 * (1 - drag * 0.4);
      fx.dx = Math.sin(t * bobSpeed * 0.7) * 4 * (1 - drag * 0.3);
      fx.zBoost = Math.round(depth * 100);           // 水层深度（Z 轴）→ 层级
      fx.blurPx = depth * 1.4;                        // 水下雾化
      fx.opMul = 1 - depth * 0.25;
    }
    return fx;
  };

  /* ---------------- 程序化角色绘制 ---------------- */
  AFX.drawCharacterNode = function (node, el, t, st) {
    const canvas = node.querySelector('canvas');
    if (!canvas) return;
    const w = Math.max(4, Math.round(st.w)), hh = Math.max(4, Math.round(st.h));
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, hh);
    if (!st.visible) return;

    const c = el.char || {};
    const { state, direction } = AFX.charStateAt(el, t);
    const flip = (AFX.CHAR_FACING[direction] || 1) < 0;
    const speed = Math.max(0.1, c.speed || 1);

    ctx.save();
    ctx.translate(w / 2, hh);
    if (flip) ctx.scale(-1, 1);

    const body = c.shirt || '#4f9cff';
    const skin = c.skin || '#ffd9b3';
    const pants = c.pants || '#34495e';
    const back = direction === 'up';   // 背面视角不画五官

    if (c.race === 'bird') drawBird(ctx, state, t, speed, body, skin, back);
    else if (c.race === 'fish') drawFish(ctx, state, t, speed, body, skin);
    else drawHuman(ctx, state, t, speed, body, skin, pants, back);

    ctx.restore();

    /* ---- 分层渲染：身体底层已画 → 衣服层 → 配饰层 ---- */
    drawOutfitLayer(ctx, c.outfit, 'clothes', w, hh);
    drawOutfitLayer(ctx, c.outfit, 'accessory', w, hh);
  };

  function drawOutfitLayer(ctx, outfit, key, w, hh) {
    if (!outfit || !outfit[key]) return;
    const img = getOutfitImg(outfit[key]);
    if (!img) return;
    const scale = outfit[key + 'Scale'] == null ? 1 : outfit[key + 'Scale'];
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, (outfit[key + 'X'] || 0), (outfit[key + 'Y'] || 0), dw, dh);
  }

  /* ---------- 人类：四视图 + 6 状态动作 ---------- */
  function drawHuman(ctx, state, t, speed, body, skin, pants, back) {
    // 肢体线段绘制工具（局部，闭包持有 ctx）
    function limb(x1, y1, x2, y2, color, width) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    const bob = Math.sin(t * TAU * 2) * 1.2;
    let lean = 0;

    if (state === 'sit') {
      // 坐姿：髋部下移，大腿向前
      const hipY = -60, groundY = 0;
      limb(0, hipY, 26, hipY + 12, pants, 9);            // 大腿向前
      limb(26, hipY + 12, 26, groundY, pants, 9);        // 小腿向下
      limb(-6, hipY, -6, groundY - 18, pants, 9);        // 另一腿
      limb(0, hipY, 0, hipY - 42, body, 14);             // 躯干
      head(ctx, 0, hipY - 56, skin, back);
      limb(2, hipY - 36, 20, hipY - 20, body, 7);        // 手臂搭腿
      return;
    }
    if (state === 'swim') {
      // 游泳：水平身体 + 划水 + 打腿 + 气泡
      const cx = 0, cy = -95;
      ctx.save();
      ctx.translate(cx, cy);
      limb(-20, 4, -34, 8 + Math.sin(t * TAU * 2.2 * speed) * 8, skin, 8);   // 腿打水
      limb(-18, -2, -32, -4 + Math.cos(t * TAU * 2.2 * speed) * 8, skin, 8);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 0, 26, 12, 0, 0, TAU); ctx.fill();     // 躯干水平
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(30, -2, 11, 0, TAU); ctx.fill();               // 头
      if (!back) { ctx.fillStyle = '#2d3436'; ctx.beginPath(); ctx.arc(35, -4, 1.8, 0, TAU); ctx.fill(); }
      const armA = Math.sin(t * TAU * 1.6 * speed) * 50;                       // 划水
      ctx.save(); ctx.translate(10, -4); ctx.rotate(armA * Math.PI / 180);
      limb(0, 0, 24, 0, skin, 7); ctx.restore();
      // 气泡
      ctx.strokeStyle = 'rgba(180,220,255,0.8)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const bt = (t * 0.7 + i * 0.33) % 1;
        ctx.globalAlpha = 1 - bt;
        ctx.beginPath(); ctx.arc(38 + i * 3, -18 - bt * 26, 2.4 + i, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }
    if (state === 'fly') {
      lean = -10;   // 身体前倾飞行
      const cy = -100 + bob;
      // 翅膀（扇动角度随时间正弦变化）
      drawWings(ctx, 0, cy - 8, t, 2.2 * speed, skin);
      limb(0, cy + 26, -8, cy + 48, pants, 9);
      limb(0, cy + 26, 8, cy + 50, pants, 9);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, cy + 8, 12, 24, lean * Math.PI / 180, 0, TAU); ctx.fill();
      head(ctx, 2, cy - 12, skin, back);
      limb(0, cy + 2, 16, cy - 10, skin, 7);
      limb(0, cy + 2, -16, cy + 2, skin, 7);
      return;
    }
    // 站立 / 行走 / 跑动（直立 + 腿臂摆动）
    const run = state === 'run';
    const walk = state === 'walk';
    const freq = run ? TAU * 2.6 * speed : TAU * 1.6 * speed;
    const amp = run ? 40 : (walk ? 25 : 0);
    const ph = t * freq;
    const legA1 = Math.sin(ph) * amp, legA2 = Math.sin(ph + Math.PI) * amp;
    const armA1 = Math.sin(ph + Math.PI) * (run ? 35 : 18), armA2 = Math.sin(ph) * (run ? 35 : 18);
    const bodyBob = (walk || run) ? Math.abs(Math.sin(ph)) * (run ? 4 : 2) : bob;
    if (run) lean = 10;

    ctx.save(); ctx.rotate(lean * Math.PI / 180);
    const hipY = -70 - bodyBob, shY = hipY - 36, headY = shY - 18;
    // 腿（髋部摆动）
    limb(0, hipY, Math.sin(legA1 * Math.PI / 180) * 28, hipY + 66, pants, 9);
    limb(0, hipY, Math.sin(legA2 * Math.PI / 180) * 28, hipY + 66, pants, 9);
    // 躯干
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, (hipY + shY) / 2, 11, 22, 0, 0, TAU); ctx.fill();
    // 手臂
    limb(0, shY + 4, Math.sin(armA1 * Math.PI / 180) * 22, shY + 24, skin, 7);
    limb(0, shY + 4, Math.sin(armA2 * Math.PI / 180) * 22, shY + 24, skin, 7);
    head(ctx, lean * 0.3, headY, skin, back);
    ctx.restore();
  }

  function head(ctx, x, y, skin, back) {
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill();
    if (!back) {
      ctx.fillStyle = '#2d3436';
      ctx.beginPath(); ctx.arc(x + 5, y - 2, 2, 0, TAU); ctx.fill();
    }
  }

  function drawWings(ctx, x, y, t, flapSpeed, color) {
    const a = Math.sin(t * TAU * (flapSpeed || 2)) * 45;   // ±45° 扇动
    ctx.save();
    ctx.translate(x, y);
    [-1, 1].forEach(side => {
      ctx.save();
      ctx.rotate(side * a * Math.PI / 180);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(side * 16, -6, 18, 7, side * -0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------- 鸟类 ---------- */
  function drawBird(ctx, state, t, speed, body, skin, back) {
    const hop = state === 'walk' ? Math.abs(Math.sin(t * TAU * 2 * speed)) * 6 : 0;
    const cy = -95 - hop;
    if (state === 'swim') {
      // 漂浮：只画水线以上
      ctx.save(); ctx.translate(0, -80);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 6, 26, 12, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(22, -2, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f6b93b';
      ctx.beginPath(); ctx.moveTo(30, -2); ctx.lineTo(42, 1); ctx.lineTo(30, 5); ctx.fill();
      drawWings(ctx, -4, 2, t, 1.2 * speed, skin);
      ctx.restore();
      return;
    }
    drawWings(ctx, 0, cy - 4, t, state === 'fly' ? 2.6 * speed : 0.8 * speed, skin);
    // 身体
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, cy, 20, 14, 0, 0, TAU); ctx.fill();
    // 头 + 喙
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(16, cy - 10, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f6b93b';
    ctx.beginPath(); ctx.moveTo(24, cy - 10); ctx.lineTo(36, cy - 7); ctx.lineTo(24, cy - 4); ctx.fill();
    if (!back) { ctx.fillStyle = '#2d3436'; ctx.beginPath(); ctx.arc(18, cy - 12, 1.8, 0, TAU); ctx.fill(); }
    // 尾羽 + 腿
    ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-18, cy); ctx.lineTo(-32, cy - 6); ctx.stroke();
    if (state !== 'fly') {
      ctx.strokeStyle = '#f6b93b'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-4, cy + 12); ctx.lineTo(-4, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, cy + 12); ctx.lineTo(6, 0); ctx.stroke();
    }
  }

  /* ---------- 鱼类 ---------- */
  function drawFish(ctx, state, t, speed, body, skin) {
    const cy = state === 'swim' ? -100 : -60;
    const swimA = state === 'swim' ? Math.sin(t * TAU * 2.4 * speed) : Math.sin(t * 10);
    // 尾鳍
    ctx.strokeStyle = skin; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-20, cy);
    ctx.lineTo(-36, cy + swimA * 12); ctx.stroke();
    // 身体
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, cy, 26, 13, 0, 0, TAU); ctx.fill();
    // 背鳍 / 腹鳍
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.moveTo(-4, cy - 12); ctx.lineTo(4, cy - 24); ctx.lineTo(10, cy - 11); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, cy + 12); ctx.lineTo(2, cy + 22); ctx.lineTo(8, cy + 12); ctx.fill();
    // 眼睛
    ctx.fillStyle = '#2d3436';
    ctx.beginPath(); ctx.arc(16, cy - 3, 2.2, 0, TAU); ctx.fill();
    // 游泳气泡
    if (state === 'swim') {
      ctx.strokeStyle = 'rgba(180,220,255,0.8)'; ctx.lineWidth = 1.3;
      for (let i = 0; i < 2; i++) {
        const bt = (t * 0.8 + i * 0.5) % 1;
        ctx.globalAlpha = 1 - bt;
        ctx.beginPath(); ctx.arc(26 + i * 4, cy - 16 - bt * 24, 2 + i, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ==================== 属性面板（换装 / 状态机 / 物理） ==================== */
  function pickPng(cb) {
    const inp = h('input', { type: 'file', accept: 'image/png,image/*' });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => cb(r.result);
      r.readAsDataURL(f);
    });
    inp.click();
  }

  function outfitRow(label, el, key, rebuild) {
    const o = el.char.outfit;
    const status = h('span', { style: 'color:var(--txt-dim);font-size:11px;' }, o[key] ? '已上传' : '未上传');
    const body = h('div', {});
    body.appendChild(h('div', { class: 'prow' },
      h('span', { class: 'plabel' }, label),
      h('button', {
        class: 'mini',
        onclick: () => pickPng(url => {
          o[key] = url; AFX.buildStage(); AFX.applyFrame(S().t); rebuild();
        })
      }, '上传 PNG'),
      h('button', {
        class: 'mini danger',
        onclick: () => { o[key] = ''; AFX.buildStage(); AFX.applyFrame(S().t); rebuild(); }
      }, '清除'),
      status
    ));
    body.appendChild(prow('偏移X/Y',
      numInput(o[key + 'X'] || 0, v => { o[key + 'X'] = v; AFX.applyFrame(S().t); }, { step: 1 }),
      numInput(o[key + 'Y'] || 0, v => { o[key + 'Y'] = v; AFX.applyFrame(S().t); }, { step: 1 })
    ));
    body.appendChild(prow('缩放',
      numInput(o[key + 'Scale'] == null ? 1 : o[key + 'Scale'], v => {
        o[key + 'Scale'] = Math.max(0.05, v); AFX.applyFrame(S().t);
      }, { step: 0.05, min: 0.05 })
    ));
    return body;
  }

  function charGroups(el) {
    const c = el.char;
    const groups = [];
    let cueRebuild = null;

    /* --- 状态机 --- */
    const cueBody = h('div', {});
    function rebuildCues() {
      cueBody.innerHTML = '';
      (c.cues || []).forEach((u, i) => {
        const stateOpts = Object.assign({ '': '不变' }, AFX.CHAR_STATES);
        const dirOpts = Object.assign({ '': '不变' }, AFX.DIRECTION_LABELS);
        cueBody.appendChild(h('div', { class: 'seg-row' },
          h('span', { class: 'plabel', style: 'width:46px;color:var(--txt-dim);' }, 'T+' + (u.t).toFixed(1)),
          numInput(u.t, v => { u.t = Math.max(0, v); AFX.applyFrame(S().t); }, { step: 0.1, min: 0 }),
          selectInput(stateOpts, u.state || '', v => {
            if (v) u.state = v; else delete u.state;
            if (!u.state && !u.direction) { c.cues.splice(i, 1); rebuildCues(); }
            AFX.applyFrame(S().t);
          }),
          selectInput(dirOpts, u.direction || '', v => {
            if (v) u.direction = v; else delete u.direction;
            if (!u.state && !u.direction) { c.cues.splice(i, 1); rebuildCues(); }
            AFX.applyFrame(S().t);
          }),
          h('button', { class: 'mini danger', onclick: () => { c.cues.splice(i, 1); rebuildCues(); AFX.applyFrame(S().t); } }, '✕')
        ));
      });
    }
    rebuildCues();
    cueRebuild = rebuildCues;

    groups.push(group('角色动作（状态机）', [
      prow('种族', selectInput(AFX.CHAR_RACES, c.race, v => { c.race = v; AFX.applyFrame(S().t); })),
      prow('默认状态', selectInput(AFX.CHAR_STATES, c.state, v => { c.state = v; AFX.applyFrame(S().t); })),
      prow('默认朝向', selectInput(AFX.DIRECTION_LABELS, c.direction, v => { c.direction = v; AFX.applyFrame(S().t); })),
      prow('动作速度', numInput(c.speed, v => { c.speed = Math.max(0.1, v); AFX.applyFrame(S().t); }, { step: 0.1, min: 0.1 })),
      prow('肤色', colorInput(c.skin, v => { c.skin = v; AFX.applyFrame(S().t); })),
      prow('主色', colorInput(c.shirt, v => { c.shirt = v; AFX.applyFrame(S().t); })),
      prow('辅色', colorInput(c.pants, v => { c.pants = v; AFX.applyFrame(S().t); })),
      h('div', { style: 'color:var(--txt-dim);font-size:11px;margin:2px 0;' }, '状态时间轴（到指定秒自动切换状态/朝向）：'),
      cueBody,
      prow('',
        h('button', {
          class: 'mini',
          onclick: () => {
            c.cues.push({ t: +(S().t.toFixed(1)), state: 'walk', direction: null });
            c.cues.sort((a, b) => a.t - b.t);
            rebuildCues(); AFX.applyFrame(S().t);
          }
        }, '＋ 在播放头添加状态切换')
      )
    ]));

    /* --- 飞行 / 游泳物理 --- */
    groups.push(group('环境适配（飞行 / 游泳）', [
      prow('飞行悬浮(px)', numInput(c.fly.hover, v => { c.fly.hover = v; AFX.applyFrame(S().t); }, { step: 5, min: 0, max: 400 })),
      prow('翅膀频率(Hz)', numInput(c.fly.flapSpeed, v => { c.fly.flapSpeed = Math.max(0.2, v); AFX.applyFrame(S().t); }, { step: 0.2, min: 0.2 })),
      prow('水深(0~1)', rangeInput(c.swim.depth, v => { c.swim.depth = v; AFX.applyFrame(S().t); }, 0, 1, 0.05)),
      prow('阻力(0~1)', rangeInput(c.swim.drag, v => { c.swim.drag = v; AFX.applyFrame(S().t); }, 0, 1, 0.05)),
      h('div', { style: 'color:var(--txt-dim);font-size:11px;' }, '飞行忽略重力并悬浮；游泳按水深叠加层级/雾化，阻力影响浮动节奏')
    ]));

    /* --- 换装系统（分层渲染） --- */
    const outfitBody = h('div', {});
    function rebuildOutfit() {
      outfitBody.innerHTML = '';
      outfitBody.appendChild(outfitRow('衣服层', el, 'clothes', rebuildOutfit));
      outfitBody.appendChild(outfitRow('配饰层', el, 'accessory', rebuildOutfit));
      outfitBody.appendChild(h('div', { style: 'color:var(--txt-dim);font-size:11px;' },
        '请上传透明背景 PNG，覆盖在角色身体之上；偏移量可适配不同体型'));
    }
    rebuildOutfit();
    groups.push(group('外观自定义（换装）', [outfitBody]));

    return groups;
  }

  /* 面板扩展点：panels.js 在刷新属性面板后发出 'panel:build' */
  AFX.bus.on('panel:build', ({ el, panel }) => {
    if (!el || el.type !== 'character') return;
    charGroups(el).forEach(g => panel.appendChild(g));
  });
})();

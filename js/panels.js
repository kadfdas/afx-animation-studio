/* ============================================================
 * panels.js — 左侧元素列表 + 右侧属性编辑面板
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const S = () => AFX.state;
  AFX.panelRefs = { id: null, x: null, y: null };

  /* ---------------- DOM 小工具 ---------------- */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'checked') el.checked = v;
      else if (k === 'value') el.value = v;
      else if (k === 'title') el.title = v;
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

  function numInput(value, onChange, opt = {}) {
    const inp = h('input', {
      type: 'number',
      value: String(value),
      step: opt.step != null ? String(opt.step) : '1'
    });
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

  function chk(value, onChange, label) {
    const wrap = h('label', { style: 'display:flex;align-items:center;gap:4px;cursor:pointer;' });
    const box = h('input', { type: 'checkbox' });
    box.checked = !!value;
    box.addEventListener('change', () => onChange(box.checked));
    wrap.appendChild(box);
    if (label) wrap.appendChild(h('span', {}, label));
    return wrap;
  }

  function group(title, bodyChildren, headerExtra) {
    const head = h('div', { class: 'pg-head' }, h('span', {}, title));
    if (headerExtra) head.appendChild(headerExtra);
    const body = h('div', { class: 'pg-body' }, ...bodyChildren);
    return h('div', { class: 'prop-group' }, head, body);
  }

  const clampT = v => Math.max(0, v);

  /* ==================== 左侧元素列表 ==================== */
  AFX.refreshElementList = function () {
    const list = document.getElementById('elementList');
    list.innerHTML = '';
    const scene = S().scene;
    if (!scene.elements.length) {
      list.appendChild(h('div', { class: 'el-empty' }, '暂无元素，请从上方添加'));
      return;
    }
    scene.elements.forEach(el => {
      const item = h('div', {
        class: 'el-item' + (S().sel === el.id ? ' selected' : ''),
        onclick: () => AFX.select(el.id)
      },
        h('span', { class: 'el-badge' }, AFX.TYPE_NAMES[el.type]),
        h('span', { class: 'el-name' }, el.name),
        h('button', {
          class: 'el-del', title: '删除元素',
          onclick: (e) => { e.stopPropagation(); AFX.deleteElement(el.id); }
        }, '✕')
      );
      list.appendChild(item);
    });
  };

  /* ---------------- 层级操作 ---------------- */
  AFX.reorderElement = function (id, dir) {
    const els = S().scene.elements;
    const i = els.findIndex(e => e.id === id);
    if (i < 0) return;
    const [el] = els.splice(i, 1);
    if (dir === 'top') els.push(el);
    else if (dir === 'bottom') els.unshift(el);
    else if (dir === 'up') els.splice(Math.min(els.length, i + 1), 0, el);
    else if (dir === 'down') els.splice(Math.max(0, i - 1), 0, el);
    AFX.afterStructureChange();
  };

  AFX.deleteElement = function (id) {
    const scene = S().scene;
    const i = scene.elements.findIndex(e => e.id === id);
    if (i < 0) return;
    scene.elements.splice(i, 1);
    if (S().sel === id) S().sel = null;
    AFX.afterStructureChange();
  };

  AFX.afterStructureChange = function () {
    AFX.buildStage();
    AFX.refreshElementList();
    AFX.refreshPropPanel();
    AFX.refreshTimeline();
    AFX.applyFrame(S().t);
  };

  /* ---------------- 添加元素（含媒体文件选择） ---------------- */
  AFX.addElement = function (type) {
    if (type === 'image' || type === 'video' || type === 'audio') {
      pickMediaFile(type, (dataUrl, file) => {
        createAndSelect(type, el => {
          el.content.src = dataUrl;
          if (type === 'audio') el.content.fileName = file.name;
          if (type === 'image') fitImageSize(el, dataUrl);
        });
      });
    } else {
      createAndSelect(type);
    }
  };

  function createAndSelect(type, customize) {
    const el = AFX.createElement(type, S().scene);
    if (customize) customize(el);
    S().scene.elements.push(el);
    S().sel = el.id;
    AFX.afterStructureChange();
  }

  function fitImageSize(el, dataUrl) {
    const img = new Image();
    img.onload = () => {
      const maxW = 300;
      if (img.width > maxW) {
        el.style.height = Math.round(img.height * maxW / img.width);
        el.style.width = maxW;
      } else {
        el.style.width = img.width; el.style.height = img.height;
      }
      AFX.afterStructureChange();
    };
    img.src = dataUrl;
  }

  const fileInput = () => document.getElementById('fileMedia');
  let pendingType = null;

  function pickMediaFile(type, cb) {
    pendingType = type;
    const inp = fileInput();
    inp.value = '';
    inp.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*';
    inp.onchange = () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => cb(reader.result, file);
      reader.readAsDataURL(file);
    };
    inp.click();
  }

  function changeMediaFile(el, cb) {
    pickMediaFile(el.type, (dataUrl, file) => {
      cb(dataUrl, file);
      AFX.buildStage();
      AFX.applyFrame(S().t);
    });
  }

  /* ==================== 右侧属性面板 ==================== */
  AFX.refreshPropPanel = function () {
    const panel = document.getElementById('propPanel');
    panel.innerHTML = '';
    AFX.panelRefs = { id: null, x: null, y: null };

    const el = S().scene.elements.find(e => e.id === S().sel);
    if (!el) {
      panel.appendChild(h('div', { class: 'prop-empty' }, '请选择一个元素'));
      // 场景级设置扩展点（环境.js：风声环境音轨 / 全局风力）
      if (AFX.bus) AFX.bus.emit('panel:empty', { panel });
      return;
    }
    AFX.panelRefs.id = el.id;

    panel.appendChild(basicGroup(el));
    panel.appendChild(transformGroup(el));
    panel.appendChild(contentGroup(el));
    panel.appendChild(visibilityGroup(el));
    panel.appendChild(moveGroup(el));
    panel.appendChild(scaleGroup(el));
    panel.appendChild(opacityGroup(el));
    panel.appendChild(rotateGroup(el));
    if (el.type === 'audio' || el.type === 'video') panel.appendChild(audioGroup(el));
    // 模块扩展点（character.js / environment.js 追加各自的编辑组）
    if (AFX.bus) AFX.bus.emit('panel:build', { el, panel });
  };

  AFX.updateXYInputs = function (el) {
    if (AFX.panelRefs.id === el.id) {
      if (AFX.panelRefs.x) AFX.panelRefs.x.value = String(el.style.x);
      if (AFX.panelRefs.y) AFX.panelRefs.y.value = String(el.style.y);
    }
  };

  /* ---------- 基础 ---------- */
  function basicGroup(el) {
    const nameInp = h('input', { type: 'text', value: el.name });
    nameInp.addEventListener('input', () => {
      el.name = nameInp.value;
      AFX.refreshElementList();
      AFX.refreshTimeline();
    });
    return group('基础信息', [
      prow('名称', nameInp),
      prow('类型', h('span', {}, AFX.TYPE_NAMES[el.type])),
      prow('层级',
        h('button', { class: 'mini', onclick: () => AFX.reorderElement(el.id, 'top') }, '置顶'),
        h('button', { class: 'mini', onclick: () => AFX.reorderElement(el.id, 'up') }, '上移'),
        h('button', { class: 'mini', onclick: () => AFX.reorderElement(el.id, 'down') }, '下移'),
        h('button', { class: 'mini', onclick: () => AFX.reorderElement(el.id, 'bottom') }, '置底')
      ),
      prow('操作',
        h('button', { class: 'mini danger', onclick: () => AFX.deleteElement(el.id) }, '删除元素')
      )
    ]);
  }

  /* ---------- 变换（位置 / 尺寸 / 旋转 / 不透明度） ---------- */
  function transformGroup(el) {
    const st = el.style;
    let lockRatio = false, ratio = st.width / st.height;

    const xInp = numInput(st.x, v => { st.x = Math.round(v); AFX.applyFrame(S().t); });
    const yInp = numInput(st.y, v => { st.y = Math.round(v); AFX.applyFrame(S().t); });
    AFX.panelRefs.x = xInp; AFX.panelRefs.y = yInp;

    const wInp = numInput(st.width, v => {
      st.width = Math.max(4, Math.round(v));
      if (lockRatio) { st.height = Math.max(4, Math.round(st.width / ratio)); refreshDims(); }
      AFX.applyFrame(S().t);
    });
    const hInp = numInput(st.height, v => {
      st.height = Math.max(4, Math.round(v));
      if (lockRatio) { st.width = Math.max(4, Math.round(st.height * ratio)); refreshDims(); }
      AFX.applyFrame(S().t);
    });
    function refreshDims() { wInp.value = String(st.width); hInp.value = String(st.height); }

    const lockChk = chk(lockRatio, on => {
      lockRatio = on;
      if (on) ratio = st.width / st.height;
    }, '等比');

    return group('变换（位置 / 尺寸）', [
      prow('X 坐标(px)', xInp),
      prow('Y 坐标(px)', yInp),
      prow('宽度(px)', wInp, lockChk),
      prow('高度(px)', hInp),
      prow('旋转(°)', numInput(st.rotation, v => { st.rotation = v; AFX.applyFrame(S().t); }, { min: -360, max: 360, step: 1 })),
      prow('不透明度', numInput(st.opacity, v => { st.opacity = Math.min(1, Math.max(0, v)); AFX.applyFrame(S().t); }, { min: 0, max: 1, step: 0.05 })),
      h('div', { style: 'color:var(--txt-dim);font-size:11px;' }, '提示：画布中可直接拖动元素，双击文字可直接编辑')
    ]);
  }

  /* ---------- 内容 ---------- */
  function contentGroup(el) {
    const body = [];
    if (el.type === 'text') {
      const ta = h('textarea', { rows: '3', style: 'width:100%;resize:vertical;' });
      ta.value = el.content.text || '';
      ta.addEventListener('input', () => {
        el.content.text = ta.value;
        AFX.buildStage(); AFX.applyFrame(S().t);
      });
      body.push(prow('文字内容', ta));
      body.push(prow('字号(px)', numInput(el.content.fontSize, v => { el.content.fontSize = v; AFX.buildStage(); AFX.applyFrame(S().t); }, { min: 8, step: 1 })));
      const color = h('input', { type: 'color', value: el.content.color || '#333333' });
      color.addEventListener('input', () => { el.content.color = color.value; AFX.buildStage(); AFX.applyFrame(S().t); });
      body.push(prow('颜色', color));
      body.push(prow('加粗', chk(el.content.bold, on => { el.content.bold = on; AFX.buildStage(); AFX.applyFrame(S().t); })));
      body.push(prow('气泡样式', chk(el.content.bubble, on => { el.content.bubble = on; AFX.buildStage(); AFX.applyFrame(S().t); }, '台词气泡')));
    } else if (el.type === 'image') {
      body.push(prow('图片文件',
        h('button', { class: 'mini', onclick: () => changeMediaFile(el, (url) => { el.content.src = url; }) }, '更换图片')
      ));
      body.push(h('div', { style: 'color:var(--txt-dim);font-size:11px;word-break:break-all;' },
        el.content.src ? '已加载（' + Math.round(el.content.src.length / 1365) + ' KB）' : '未选择文件'));
    } else if (el.type === 'video') {
      body.push(prow('视频文件',
        h('button', { class: 'mini', onclick: () => changeMediaFile(el, (url) => { el.content.src = url; }) }, '更换视频')
      ));
    } else if (el.type === 'audio') {
      body.push(prow('音频文件',
        h('button', { class: 'mini', onclick: () => changeMediaFile(el, (url, file) => { el.content.src = url; el.content.fileName = file.name; }) }, '更换音频')
      ));
      body.push(h('div', { style: 'color:var(--txt-dim);font-size:11px;' }, el.content.fileName || '未选择文件'));
    } else if (el.type === 'svg') {
      const presetSel = selectInput({
        star: '★ 星形', circle: '● 圆形', rect: '■ 矩形',
        triangle: '▲ 三角形', heart: '♥ 爱心', custom: '自定义 SVG'
      }, el.content.preset || 'star', v => {
        el.content.preset = v;
        if (v !== 'custom') { el.content.svg = AFX.SVG_PRESETS[v]; ta.value = el.content.svg; }
        AFX.buildStage(); AFX.applyFrame(S().t);
      });
      body.push(prow('预设图形', presetSel));
      const ta = h('textarea', { rows: '5', style: 'width:100%;resize:vertical;font-size:11px;' });
      ta.value = el.content.svg || '';
      ta.addEventListener('change', () => {
        el.content.svg = ta.value;
        el.content.preset = 'custom';
        AFX.buildStage(); AFX.applyFrame(S().t);
      });
      body.push(prow('SVG 源码', ta));
    }
    return group('内容', body);
  }

  /* ---------- 显隐时间轴（多段） ---------- */
  function visibilityGroup(el) {
    const body = h('div', {});

    function rebuild() {
      body.innerHTML = '';
      if (!el.visibility.length) {
        body.appendChild(h('div', { style: 'color:var(--txt-dim);font-size:11px;' }, '当前为始终显示（无显隐段）'));
      }
      el.visibility.forEach((seg, i) => {
        const sInp = numInput(seg.start, v => {
          seg.start = clampT(v);
          if (seg.end <= seg.start) seg.end = seg.start + 0.1;
          AFX.applyFrame(S().t); AFX.refreshTimeline(); rebuildInputs();
        }, { step: 0.1, min: 0 });
        const eInp = numInput(seg.end, v => {
          seg.end = Math.max(seg.start + 0.1, v);
          AFX.applyFrame(S().t); AFX.refreshTimeline(); rebuildInputs();
        }, { step: 0.1, min: 0 });
        const fiInp = numInput(seg.fadeIn, v => { seg.fadeIn = Math.max(0, v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 });
        const foInp = numInput(seg.fadeOut, v => { seg.fadeOut = Math.max(0, v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 });

        function rebuildInputs() { sInp.value = String(seg.start); eInp.value = String(seg.end); }

        body.appendChild(h('div', { class: 'seg-row' },
          h('span', { class: 'plabel', style: 'width:52px;color:var(--txt-dim);' }, '段' + (i + 1)),
          sInp, h('span', { class: 'seg-x' }, '→'), eInp,
          h('button', {
            class: 'mini danger', title: '删除该段',
            onclick: () => { el.visibility.splice(i, 1); AFX.applyFrame(S().t); AFX.refreshTimeline(); rebuild(); }
          }, '✕')
        ));
        body.appendChild(h('div', { class: 'seg-row' },
          h('span', { class: 'plabel', style: 'width:52px;color:var(--txt-dim);' }, '淡入/出'),
          fiInp, h('span', { class: 'seg-x' }, '/'), foInp
        ));
      });
    }
    rebuild();

    body.appendChild(prow('',
      h('button', {
        class: 'mini',
        onclick: () => {
          const dur = S().scene.meta.duration;
          const last = el.visibility.length ? el.visibility[el.visibility.length - 1].end : 0;
          el.visibility.push({ start: Math.min(last, dur - 0.5), end: dur, fadeIn: 0.2, fadeOut: 0.2 });
          AFX.applyFrame(S().t); AFX.refreshTimeline(); rebuild();
        }
      }, '＋ 添加显隐段'),
      h('button', {
        class: 'mini',
        title: '重置为全程显示',
        onclick: () => {
          el.visibility = [{ start: 0, end: S().scene.meta.duration, fadeIn: 0, fadeOut: 0 }];
          AFX.applyFrame(S().t); AFX.refreshTimeline(); rebuild();
        }
      }, '全程显示')
    ));
    return group('显隐时间轴（秒）', [body]);
  }

  /* ---------- 通用动画组构建 ---------- */
  function animGroup(title, anim, enabledChange, rows) {
    const headChk = chk(anim.enabled, on => { anim.enabled = on; enabledChange(on); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, '启用');
    const g = group(title, rows(), headChk);
    return g;
  }

  function easingSelect(anim) {
    return selectInput(AFX.EASING_LABELS, anim.easing, v => { anim.easing = v; AFX.applyFrame(S().t); });
  }

  /* ---------- 移动动画 ---------- */
  function moveGroup(el) {
    const mv = el.animations.move;
    return animGroup('移动动画（位移）', mv,
      () => {},
      () => [
        prow('方向', selectInput(AFX.DIRECTION_LABELS, mv.direction, v => { mv.direction = v; AFX.applyFrame(S().t); })),
        prow('距离(px)', numInput(mv.distance, v => { mv.distance = v; AFX.applyFrame(S().t); }, { step: 5 })),
        prow('持续(s)', numInput(mv.duration, v => { mv.duration = Math.max(0.05, v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 })),
        prow('延迟(s)', numInput(mv.delay, v => { mv.delay = clampT(v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 })),
        prow('速度曲线', easingSelect(mv)),
        prow('结束后', selectInput({ stay: '停在终点', back: '回到起点' }, mv.after, v => { mv.after = v; AFX.applyFrame(S().t); }))
      ]
    );
  }

  /* ---------- 缩放动画 ---------- */
  function scaleGroup(el) {
    const sc = el.animations.scale;
    return animGroup('缩放动画（尺寸 A→B）', sc,
      (on) => {
        if (on) {   // 启用时以当前尺寸为起点
          sc.fromWidth = el.style.width; sc.fromHeight = el.style.height;
          sc.toWidth = Math.round(el.style.width * 1.3);
          sc.toHeight = Math.round(el.style.height * 1.3);
          AFX.refreshPropPanel();
        }
      },
      () => [
        prow('起始宽', numInput(sc.fromWidth, v => { sc.fromWidth = Math.max(4, v); AFX.applyFrame(S().t); }, { step: 5, min: 4 })),
        prow('起始高', numInput(sc.fromHeight, v => { sc.fromHeight = Math.max(4, v); AFX.applyFrame(S().t); }, { step: 5, min: 4 })),
        prow('目标宽', numInput(sc.toWidth, v => { sc.toWidth = Math.max(4, v); AFX.applyFrame(S().t); }, { step: 5, min: 4 })),
        prow('目标高', numInput(sc.toHeight, v => { sc.toHeight = Math.max(4, v); AFX.applyFrame(S().t); }, { step: 5, min: 4 })),
        prow('持续(s)', numInput(sc.duration, v => { sc.duration = Math.max(0.05, v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 })),
        prow('延迟(s)', numInput(sc.delay, v => { sc.delay = clampT(v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 })),
        prow('速度曲线', easingSelect(sc))
      ]
    );
  }

  /* ---------- 不透明度动画 ---------- */
  function opacityGroup(el) {
    const op = el.animations.opacity;
    return animGroup('不透明度动画（渐变）', op,
      (on) => { if (on) { op.from = 0; op.to = 1; AFX.refreshPropPanel(); } },
      () => [
        prow('起始值', numInput(op.from, v => { op.from = Math.min(1, Math.max(0, v)); AFX.applyFrame(S().t); }, { step: 0.05, min: 0, max: 1 })),
        prow('结束值', numInput(op.to, v => { op.to = Math.min(1, Math.max(0, v)); AFX.applyFrame(S().t); }, { step: 0.05, min: 0, max: 1 })),
        prow('持续(s)', numInput(op.duration, v => { op.duration = Math.max(0.05, v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 })),
        prow('延迟(s)', numInput(op.delay, v => { op.delay = clampT(v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 })),
        prow('速度曲线', easingSelect(op))
      ]
    );
  }

  /* ---------- 旋转动画 ---------- */
  function rotateGroup(el) {
    const ro = el.animations.rotate;
    return animGroup('旋转动画', ro,
      () => {},
      () => [
        prow('角度(°)', numInput(ro.angle, v => { ro.angle = v; AFX.applyFrame(S().t); }, { step: 15, min: -3600, max: 3600 })),
        prow('方向', selectInput({ cw: '顺时针', ccw: '逆时针' }, ro.direction, v => { ro.direction = v; AFX.applyFrame(S().t); })),
        prow('持续(s)', numInput(ro.duration, v => { ro.duration = Math.max(0.05, v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 })),
        prow('延迟(s)', numInput(ro.delay, v => { ro.delay = clampT(v); AFX.applyFrame(S().t); AFX.refreshTimeline(); }, { step: 0.1, min: 0 })),
        prow('速度曲线', easingSelect(ro))
      ]
    );
  }

  /* ---------- 音频设置 ---------- */
  function audioGroup(el) {
    const au = el.audio;
    const isVideo = el.type === 'video';
    return group(isVideo ? '视频播放窗口（秒）' : '音频播放设置（秒）', [
      prow('开始时间', numInput(au.start, v => {
        au.start = clampT(v);
        if (au.end <= au.start) au.end = au.start + 0.5;
        AFX.refreshTimeline();
      }, { step: 0.1, min: 0 })),
      prow('结束时间', numInput(au.end, v => {
        au.end = Math.max(au.start + 0.1, Math.min(v, S().scene.meta.duration));
        AFX.refreshTimeline();
      }, { step: 0.1, min: 0 })),
      prow('音量', numInput(au.volume, v => { au.volume = Math.min(1, Math.max(0, v)); }, { step: 0.05, min: 0, max: 1 })),
      prow('淡入(s)', numInput(au.fadeIn, v => { au.fadeIn = Math.max(0, v); }, { step: 0.1, min: 0 })),
      prow('淡出(s)', numInput(au.fadeOut, v => { au.fadeOut = Math.max(0, v); }, { step: 0.1, min: 0 })),
      h('div', { style: 'color:var(--txt-dim);font-size:11px;' }, '音频窗口与动画时间轴同步播放')
    ]);
  }
})();

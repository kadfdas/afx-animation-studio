/* ============================================================
 * render.js — 画布渲染引擎
 *  - 元素 DOM 节点创建 / 重建
 *  - elementStateAt(t)：计算某元素在时间 t 的最终渲染状态
 *  - applyFrame(t)：逐帧渲染（编辑与播放共用同一条渲染路径）
 *  - 画布拖拽移动 / 双击编辑文字
 *  - 音频 / 视频与时间轴同步
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  AFX.nodes = {};   // id -> 画布 DOM 节点
  AFX.media = {};   // id -> HTMLMediaElement（audio 用 Audio 对象，video 用节点本身）

  const S = () => AFX.state;

  /* ---------------- 计算元素在时间 t 的状态 ---------------- */
  AFX.elementStateAt = function (el, t) {
    const st = el.style;
    const a = el.animations;

    let x = st.x, y = st.y;
    let w = st.width, h = st.height;
    let rot = st.rotation;
    let opacity = st.opacity;

    // ---- 移动动画（位移）----
    const mv = a.move;
    if (mv && mv.enabled) {
      const vec = AFX.DIRECTIONS[mv.direction] || [1, 0];
      let offset = 0;
      const end = mv.delay + mv.duration;
      if (t >= end) {
        offset = mv.after === 'back' ? 0 : 1;   // 结束后回到起点 或 停在终点
      } else if (t > mv.delay) {
        offset = AFX.progress(t, mv.delay, mv.duration, mv.easing);
      }
      x += vec[0] * mv.distance * offset;
      y += vec[1] * mv.distance * offset;
    }

    // ---- 角色行走/跑动自动位移 ----
    // 当角色状态为 walk/run 且未启用移动动画时，按朝向自动移动
    if (el.type === 'character' && el.char && !(mv && mv.enabled)) {
      const cs = AFX.charStateAt(el, t);
      if (cs.state === 'walk' || cs.state === 'run') {
        const vec = AFX.DIRECTIONS[cs.direction] || [1, 0];
        const pxPerSec = (cs.state === 'run' ? 90 : 45) * (el.char.speed || 1);
        x += vec[0] * pxPerSec * t;
        y += vec[1] * pxPerSec * t;
      }
    }

    // ---- 缩放动画（尺寸 A → B）----
    const sc = a.scale;
    if (sc && sc.enabled) {
      const p = AFX.progress(t, sc.delay, sc.duration, sc.easing);
      w = sc.fromWidth + (sc.toWidth - sc.fromWidth) * p;
      h = sc.fromHeight + (sc.toHeight - sc.fromHeight) * p;
    }

    // ---- 旋转动画 ----
    const ro = a.rotate;
    if (ro && ro.enabled) {
      const dir = ro.direction === 'ccw' ? -1 : 1;
      const p = AFX.progress(t, ro.delay, ro.duration, ro.easing);
      rot = st.rotation + dir * ro.angle * p;
    }

    // ---- 不透明度动画 ----
    const op = a.opacity;
    if (op && op.enabled) {
      const p = AFX.progress(t, op.delay, op.duration, op.easing);
      opacity *= op.from + (op.to - op.from) * p;
    }

    // ---- 分段显隐 + 段内淡入淡出 ----
    const visible = AFX.isVisibleAt(el, t);
    opacity *= AFX.segmentFadeAt(el, t);

    return { visible, x, y, w, h, rot, opacity: Math.max(0, Math.min(1, opacity)) };
  };

  /* ---------------- 元素节点创建 ---------------- */
  function buildContent(el, node) {
    if (el.type === 'text') {
      const div = document.createElement('div');
      div.className = 'el-text';
      div.textContent = el.content.text || '';
      div.style.fontSize = (el.content.fontSize || 28) + 'px';
      div.style.color = el.content.color || '#333';
      div.style.fontWeight = el.content.bold ? '700' : '400';
      node.appendChild(div);
      // 台词气泡样式
      node.classList.toggle('el-bubble', !!el.content.bubble);
    } else if (el.type === 'image') {
      const img = document.createElement('img');
      img.src = el.content.src || '';
      img.draggable = false;
      node.appendChild(img);
    } else if (el.type === 'video') {
      const v = document.createElement('video');
      v.src = el.content.src || '';
      v.preload = 'auto';
      v.playsInline = true;
      node.appendChild(v);
      AFX.media[el.id] = v;
    } else if (el.type === 'svg') {
      node.innerHTML = el.content.svg || '';
    } else if (el.type === 'character') {
      // 角色：程序化 Canvas 绘制（每帧由 applyFrame 重绘）
      const canvas = document.createElement('canvas');
      canvas.className = 'el-char-canvas';
      node.appendChild(canvas);
    }
  }

  function attachDrag(el, node) {
    node.addEventListener('pointerdown', (e) => {
      if (S().mode !== 'edit') return;
      if (node.isContentEditable) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      AFX.select(el.id);

      const startX = e.clientX, startY = e.clientY;
      const origX = el.style.x, origY = el.style.y;
      let moved = false;

      const onMove = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
        moved = true;
        el.style.x = Math.round(origX + dx);
        el.style.y = Math.round(origY + dy);
        AFX.applyFrame(S().t);
        AFX.updateXYInputs(el);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (moved) AFX.refreshTimeline();   // 位置变化不影响轨道，此处仅保持一致性
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    // 双击文字元素 → 画布内直接编辑
    node.addEventListener('dblclick', (e) => {
      if (el.type !== 'text' || S().mode !== 'edit') return;
      const div = node.querySelector('.el-text');
      if (!div) return;
      e.stopPropagation();
      node.classList.add('editing');
      div.contentEditable = 'true';
      div.focus();
      document.getSelection().selectAllChildren(div);
      const finish = () => {
        div.contentEditable = 'false';
        node.classList.remove('editing');
        el.content.text = div.innerText.replace(/\n$/, '');
        div.removeEventListener('blur', finish);
        AFX.refreshPropPanel();
      };
      div.addEventListener('blur', finish);
    });
  }

  AFX.createNode = function (el) {
    const node = document.createElement('div');
    node.className = 'element';
    node.dataset.id = el.id;
    buildContent(el, node);
    attachDrag(el, node);
    return node;
  };

  /* ---------------- 重建整个画布 ---------------- */
  AFX.buildStage = function () {
    const stage = document.getElementById('stage');
    stage.innerHTML = '';
    AFX.nodes = {};
    AFX.media = {};

    // 隐藏的媒体容器：把音频元素挂到 DOM 上，提高 autoplay 兼容性
    let mediaBox = document.getElementById('afx-media-box');
    if (!mediaBox) {
      mediaBox = document.createElement('div');
      mediaBox.id = 'afx-media-box';
      mediaBox.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;left:-9999px;top:0;';
      document.body.appendChild(mediaBox);
    } else {
      mediaBox.innerHTML = '';
    }

    const scene = S().scene;
    stage.style.width = scene.meta.width + 'px';
    stage.style.height = scene.meta.height + 'px';
    stage.style.background = scene.meta.background;
    scene.elements.forEach(el => {
      if (el.type === 'audio') {
        const a = document.createElement('audio');
        a.src = el.content.src || '';
        a.preload = 'auto';
        a.dataset.id = el.id;
        mediaBox.appendChild(a);
        a.addEventListener('error', (ev) => {
          console.warn('[AFX] 音频加载失败:', el.name, a.error && a.error.message, el.content.src ? '(已选择文件)' : '(空 src)');
        });
        AFX.media[el.id] = a;
        return;
      }
      const node = AFX.createNode(el);
      AFX.nodes[el.id] = node;
      stage.appendChild(node);
    });
    // 点击画布区域任意空白处（舞台内空白 / 四周留白）取消选择，
    // 从而展示场景级设置（环境风声/全局风力）。元素自身的 pointerdown
    // 已 stopPropagation，点击元素不会误触发。
    const center = document.getElementById('center');
    if (center) center.onpointerdown = (e) => {
      if (S().mode !== 'edit') return;
      if (e.target.closest && e.target.closest('.element')) return;
      AFX.select(null);
    };
  };

  /* ---------------- 逐帧渲染 ---------------- */
  let _lastFrameNow = performance.now();
  AFX.applyFrame = function (t) {
    const scene = S().scene;
    // 帧间隔：播放时为真实 dt，编辑/拖动时为 0（插件静态重绘）
    const now = performance.now();
    const dt = S().playing ? Math.min(0.1, (now - _lastFrameNow) / 1000) : 0;
    _lastFrameNow = now;

    scene.elements.forEach((el, idx) => {
      const st = AFX.elementStateAt(el, t);
      const node = AFX.nodes[el.id];
      // 音频/视频同步（无画布节点也要同步）
      if (el.type === 'audio' || el.type === 'video') {
        syncMedia(el, t, st.visible && !(el.type === 'video' && !st.visible));
      }
      if (!node) return;
      if (!st.visible) {
        node.style.display = 'none';
      } else {
        // 角色物理（飞行悬浮 / 游泳阻力与水深）
        let dx = 0, dy = 0, extraRot = 0, zBoost = 0, blurPx = 0, opMul = 1;
        if (el.char && AFX.charFxAt) {
          const fx = AFX.charFxAt(el, t);
          dx = fx.dx; dy = fx.dy; extraRot = fx.extraRot;
          zBoost = fx.zBoost; blurPx = fx.blurPx; opMul = fx.opMul;
          if (AFX.drawCharacterNode) AFX.drawCharacterNode(node, el, t, st);
        }
        // 植物摇摆（SwayController：绕底部轴心的正弦摆动）
        let swayRot = 0;
        if (el.env && el.env.sway && el.env.sway.enabled && AFX.swayAngleAt) {
          swayRot = AFX.swayAngleAt(el, t);
          node.style.transformOrigin = '50% 100%';
        } else if (node.style.transformOrigin) {
          node.style.transformOrigin = '';
        }
        node.style.display = '';
        node.style.left = (st.x + dx) + 'px';
        node.style.top = (st.y + dy) + 'px';
        node.style.width = st.w + 'px';
        node.style.height = st.h + 'px';
        node.style.opacity = st.opacity * opMul;
        node.style.zIndex = idx + 1 + zBoost;
        node.style.filter = blurPx > 0 ? 'blur(' + blurPx.toFixed(2) + 'px)' : '';
        node.style.transform =
          'translate(0px,0px) rotate(' + (st.rot + extraRot + swayRot) + 'deg)';
      }
      node.classList.toggle('selected', S().sel === el.id);
    });

    // 环境音轨（风声）音量随时间/摇摆能量调制
    if (AFX.envUpdate) AFX.envUpdate(t);
    // AI 生成插件：清屏特效层并驱动所有已启用插件
    if (AFX.plugins) AFX.plugins.frame(dt, t);
  };

  /* ---------------- 音频 / 视频时间轴同步 ----------------
   * 播放窗口：el.audio.start ~ el.audio.end
   * 音量包络：基础音量 × 淡入 × 淡出
   * ------------------------------------------------------ */
  function syncMedia(el, t, active) {
    const m = AFX.media[el.id];
    if (!m) return;
    const conf = el.audio || {};
    const start = conf.start || 0;
    const end = (conf.end != null ? conf.end : S().scene.meta.duration);
    const playing = S().playing;

    if (active && playing && t >= start && t < end) {
      const dur = (m.duration && isFinite(m.duration)) ? m.duration : Infinity;
      const desired = Math.min(Math.max(0, t - start), Math.max(0, dur - 0.05));

      // 媒体文件已播完（或媒体短于播放窗口末尾）：确保停在结尾，不循环
      if (t - start >= dur - 0.05) {
        if (!m.paused) m.pause();
      } else {
        if (Math.abs(m.currentTime - desired) > 0.28) {
          try { m.currentTime = desired; } catch (_) {}
        }
        // 音量包络
        let vol = conf.volume != null ? conf.volume : 1;
        const dt = t - start, remain = end - t;
        if (conf.fadeIn > 0 && dt < conf.fadeIn) vol *= dt / conf.fadeIn;
        if (conf.fadeOut > 0 && remain < conf.fadeOut) vol *= remain / conf.fadeOut;
        m.volume = Math.max(0, Math.min(1, vol));
        // paused 或 ended（如时间轴回拖）时都需要（重新）播放
        if (m.paused || m.ended) {
          const pr = m.play();
          if (pr && pr.catch) pr.catch(err => {
            // 仅在非频繁时记录，避免每帧刷屏
            if (!m.__lastPlayErr || Date.now() - m.__lastPlayErr > 3000) {
              m.__lastPlayErr = Date.now();
              console.warn('[AFX] 音频播放被拦截（', el.name, '）：', err.name, '— 请点击播放按钮或页面任意处解锁');
            }
          });
        }
      }
    } else {
      if (!m.paused) m.pause();
      if (t < start && m.currentTime !== 0) {
        try { m.currentTime = 0; } catch (_) {}
      }
      if (active && !playing && t >= start && t < end) {
        // 编辑模式 / 拖动播放头：定位到对应媒体帧
        const dur = (m.duration && isFinite(m.duration)) ? m.duration : Infinity;
        const desired = Math.min(Math.max(0, t - start), Math.max(0, dur - 0.05));
        if (Math.abs(m.currentTime - desired) > 0.08) {
          try { m.currentTime = desired; } catch (_) {}
        }
      }
    }
  }

  /* ---------------- 用户手势解锁所有媒体 ----------------
   * 浏览器 autoplay 策略要求 play() 在用户手势同步栈内调用。
   * 在播放按钮点击等真实交互中调用此函数，预先建立媒体会话。
   * ------------------------------------------------------ */
  AFX.unlockMedia = function () {
    Object.values(AFX.media || {}).forEach(m => {
      if (!m || !m.src) return;
      // 短暂播放后立即暂停，以建立已解锁的媒体会话
      const wasPaused = m.paused;
      m.volume = 0;
      const p = m.play();
      if (p && p.then) {
        p.then(() => {
          if (wasPaused) {
            setTimeout(() => { try { m.pause(); m.currentTime = 0; } catch (_) {} }, 30);
          }
        }).catch(() => {});
      }
    });
  };
})();

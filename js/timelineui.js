/* ============================================================
 * timelineui.js — 底部时间轴轨道
 *  - 秒刻度尺 / 每元素一行轨道
 *  - 轨道内容：显隐时间段(蓝框) + 各动画条(彩条) + 音频窗口(绿条)
 *  - 点击轨道跳转播放头；拖动条身移动；拖动边缘改变长度
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const S = () => AFX.state;
  const ROW_H = 30;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'value') el[k] = v;
      else el.setAttribute(k, v);
    });
    children.flat().forEach(c => {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  /* ---------------- 整体重建 ---------------- */
  AFX.refreshTimeline = function () {
    const scene = S().scene;
    const pxs = S().pxs;
    const content = document.getElementById('tlContent');
    const width = Math.max(scene.meta.duration * pxs + 60, 100);

    content.style.width = width + 'px';

    /* 刻度尺 */
    const ruler = document.getElementById('tlRuler');
    ruler.innerHTML = '';
    for (let s = 0; s <= Math.ceil(scene.meta.duration); s++) {
      const x = s * pxs;
      ruler.appendChild(h('div', {
        class: 'tick' + (s % 5 === 0 ? '' : ''),
        style: `left:${x}px;`
      }, s + 's'));
      if (s < scene.meta.duration) {
        ruler.appendChild(h('div', {
          class: 'tick minor',
          style: `left:${x + pxs / 2}px;`
        }));
      }
    }

    /* 左侧标签列 */
    const labels = document.getElementById('tlLabels');
    labels.innerHTML = '';
    labels.appendChild(h('div', { class: 'lbl-ruler-space' }));
    scene.elements.forEach(el => {
      labels.appendChild(h('div', {
        class: 'tl-label' + (S().sel === el.id ? ' selected' : ''),
        onclick: () => AFX.select(el.id)
      },
        h('span', { class: 'el-badge' }, AFX.TYPE_NAMES[el.type]),
        h('span', { class: 'el-name' }, el.name)
      ));
    });

    /* 轨道行 */
    const rows = document.getElementById('tlRows');
    rows.innerHTML = '';
    scene.elements.forEach(el => {
      const row = h('div', { class: 'tl-row' + (S().sel === el.id ? ' selected' : '') });
      row.style.height = ROW_H + 'px';

      // 显隐时间段
      (el.visibility || []).forEach((seg, i) => {
        const bar = h('div', {
          class: 'tl-seg',
          title: `显隐段${i + 1}: ${seg.start.toFixed(1)}s → ${seg.end.toFixed(1)}s`
        });
        place(bar, seg.start, seg.end - seg.start, pxs);
        makeDraggable(bar, el, {
          get: () => [seg.start, seg.end],
          set: (a, b) => {
            seg.start = clamp(a, 0, scene.meta.duration);
            seg.end = clamp(Math.max(seg.start + 0.1, b), 0, scene.meta.duration);
          },
          kind: 'span'
        });
        row.appendChild(bar);
      });

      // 动画条
      const a = el.animations;
      const animBars = [
        { key: 'move', cls: 'anim-move', name: '移动', start: a.move.delay, dur: a.move.duration, enabled: a.move.enabled },
        { key: 'scale', cls: 'anim-scale', name: '缩放', start: a.scale.delay, dur: a.scale.duration, enabled: a.scale.enabled },
        { key: 'opacity', cls: 'anim-opacity', name: '透明', start: a.opacity.delay, dur: a.opacity.duration, enabled: a.opacity.enabled },
        { key: 'rotate', cls: 'anim-rotate', name: '旋转', start: a.rotate.delay, dur: a.rotate.duration, enabled: a.rotate.enabled }
      ];
      animBars.forEach(b => {
        if (!b.enabled || b.dur <= 0) return;
        const bar = h('div', { class: 'tl-anim ' + b.cls, title: `${b.name}动画: 延迟 ${b.start.toFixed(1)}s / 时长 ${b.dur.toFixed(1)}s` });
        place(bar, b.start, b.dur, pxs);
        const anim = a[b.key];
        makeDraggable(bar, el, {
          get: () => [anim.delay, anim.delay + anim.duration],
          set: (st, en) => {
            if (b.key === 'rotate') anim.delay = clamp(st, 0, 9999);
            else anim.delay = clamp(st, 0, 9999);
            anim.duration = Math.max(0.05, en - anim.delay);
          },
          kind: 'anim'
        });
        row.appendChild(bar);
      });

      // 音频/视频播放窗口
      if (el.type === 'audio' || el.type === 'video') {
        const bar = h('div', {
          class: 'tl-anim anim-audio',
          title: `${AFX.TYPE_NAMES[el.type]}: ${el.audio.start.toFixed(1)}s → ${el.audio.end.toFixed(1)}s`
        });
        place(bar, el.audio.start, el.audio.end - el.audio.start, pxs);
        makeDraggable(bar, el, {
          get: () => [el.audio.start, el.audio.end],
          set: (st, en) => {
            el.audio.start = clamp(st, 0, scene.meta.duration);
            el.audio.end = clamp(Math.max(el.audio.start + 0.1, en), 0, scene.meta.duration);
          },
          kind: 'span'
        });
        row.appendChild(bar);
      }

      rows.appendChild(row);
    });

    AFX.updatePlayhead();
  };

  function place(bar, start, dur, pxs) {
    bar.style.left = (start * pxs) + 'px';
    bar.style.width = Math.max(4, dur * pxs) + 'px';
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------------- 拖动 / 缩放轨道条 ---------------- */
  function makeDraggable(bar, el, opt) {
    bar.addEventListener('pointerdown', (e) => {
      if (S().mode !== 'edit') return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      AFX.select(el.id);

      const pxs = S().pxs;
      const rect = bar.getBoundingClientRect();
      const zone = e.clientX - rect.left < 7 ? 'w'
        : rect.right - e.clientX < 7 ? 'e' : 'body';
      const [s0, e0] = opt.get();
      const x0 = e.clientX;
      bar.style.cursor = 'grabbing';

      const onMove = (ev) => {
        const dx = (ev.clientX - x0) / pxs;
        if (opt.kind === 'span') {
          if (zone === 'w') opt.set(s0 + dx, e0);
          else if (zone === 'e') opt.set(s0, e0 + dx);
          else opt.set(s0 + dx, e0 + dx);
        } else {   // 动画条：拖身 = 移动延迟，拖右缘 = 改时长
          if (zone === 'e') opt.set(s0, e0 + dx);
          else opt.set(s0 + dx, e0 + dx);
        }
        AFX.refreshTimeline();
        AFX.applyFrame(S().t);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        bar.style.cursor = '';
        AFX.refreshTimeline();
        AFX.refreshPropPanel();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  /* ---------------- 播放头 & 跳转 ---------------- */
  AFX.updatePlayhead = function () {
    const ph = document.getElementById('tlPlayhead');
    const scene = S().scene;
    const clamped = Math.min(S().t, scene.meta.duration);
    ph.style.left = (clamped * S().pxs) + 'px';
    ph.style.height = '100%';
  };

  function seekFromEvent(e) {
    const content = document.getElementById('tlContent');
    const rect = content.getBoundingClientRect();
    const t = clamp((e.clientX - rect.left) / S().pxs, 0, S().scene.meta.duration);
    AFX.seek(t);
  }

  AFX.initTimelineEvents = function () {
    const ruler = document.getElementById('tlRuler');
    ruler.addEventListener('pointerdown', (e) => {
      if (S().mode !== 'edit') return;
      seekFromEvent(e);
      const onMove = (ev) => seekFromEvent(ev);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    // 轨道空白处点击也可跳转
    document.getElementById('tlRows').addEventListener('pointerdown', (e) => {
      if (e.target.classList && e.target.classList.contains('tl-row') && S().mode === 'edit') {
        seekFromEvent(e);
      }
    });

    document.getElementById('tlZoom').addEventListener('input', (e) => {
      S().pxs = parseInt(e.target.value, 10);
      AFX.refreshTimeline();
    });
  };
})();

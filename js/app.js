/* ============================================================
 * app.js — 播放引擎 + 顶部工具栏 + 全局设置 + 模式切换 + 持久化
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  /* ---------------- 全局状态 ---------------- */
  AFX.state = {
    scene: null,
    sel: null,        // 当前选中元素 id
    t: 0,             // 当前播放头（秒）
    playing: false,
    mode: 'edit',     // edit | play
    pxs: 90           // 时间轴每秒像素
  };
  const S = AFX.state;

  let rafId = null;
  let epoch = 0;      // performance.now() 对应 t=0 的时刻

  const $ = id => document.getElementById(id);

  /* ---------------- 选择 ---------------- */
  AFX.select = function (id) {
    S.sel = id;
    AFX.refreshElementList();
    AFX.refreshPropPanel();
    AFX.refreshTimeline();
    AFX.applyFrame(S.t);
  };

  /* ---------------- 播放引擎 ---------------- */
  function tick(now) {
    if (!S.playing) return;
    let t = (now - epoch) / 1000;
    if (t >= S.scene.meta.duration) {
      S.t = S.scene.meta.duration;
      AFX.applyFrame(S.t);
      updateTimeLabel();
      pause();     // 播到结尾自动暂停（媒体同步会复位）
      return;
    }
    S.t = t;
    AFX.applyFrame(t);
    AFX.updatePlayhead();
    updateTimeLabel();
    rafId = requestAnimationFrame(tick);
  }

  AFX.play = function () {
    if (S.playing) return;
    if (S.t >= S.scene.meta.duration) S.t = 0;
    S.playing = true;
    // 关键：在用户点击「播放」的同步手势栈内解锁所有媒体，
    // 否则 rAF 异步回调里的 play() 会被 autoplay 策略拦截。
    if (AFX.unlockMedia) AFX.unlockMedia();
    // 风声环境音轨（WebAudio）同样需要手势栈内 resume
    if (AFX.unlockEnvAudio) AFX.unlockEnvAudio();
    // 统一资源预加载（防播放卡顿，异步不阻塞）
    if (AFX.loader) AFX.loader.preload(S.scene);
    epoch = performance.now() - S.t * 1000;
    rafId = requestAnimationFrame(tick);
    setTransportUI();
  };

  function pause() {
    S.playing = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (AFX.envAudio) AFX.envAudio.suspend();   // 环境音轨随播放停止
    AFX.applyFrame(S.t);   // 让媒体进入暂停/复位
    setTransportUI();
  }
  AFX.pause = pause;

  AFX.stop = function () {
    pause();
    S.t = 0;
    AFX.applyFrame(0);
    AFX.updatePlayhead();
    updateTimeLabel();
  };

  AFX.seek = function (t) {
    S.t = Math.min(t, S.scene.meta.duration);
    if (S.playing) epoch = performance.now() - S.t * 1000;
    AFX.applyFrame(S.t);
    AFX.updatePlayhead();
    updateTimeLabel();
  };

  function updateTimeLabel() {
    $('timeLabel').textContent =
      S.t.toFixed(1) + ' / ' + S.scene.meta.duration.toFixed(1) + 's';
  }

  function setTransportUI() {
    $('btnPlay').disabled = S.playing;
    $('btnPause').disabled = !S.playing;
  }

  /* ---------------- 全量刷新 ---------------- */
  AFX.refreshAll = function () {
    AFX.buildStage();
    AFX.refreshElementList();
    AFX.refreshPropPanel();
    AFX.refreshTimeline();
    AFX.applyFrame(S.t);
    updateTimeLabel();
  };

  /* ---------------- 全局设置 ---------------- */
  function bindSettings() {
    $('setWidth').value = S.scene.meta.width;
    $('setHeight').value = S.scene.meta.height;
    $('setDuration').value = S.scene.meta.duration;
    $('setBg').value = S.scene.meta.background;

    $('setWidth').addEventListener('change', () => {
      S.scene.meta.width = Math.max(200, parseInt($('setWidth').value, 10) || 960);
      $('setWidth').value = S.scene.meta.width;
      AFX.buildStage(); AFX.applyFrame(S.t);
    });
    $('setHeight').addEventListener('change', () => {
      S.scene.meta.height = Math.max(200, parseInt($('setHeight').value, 10) || 540);
      $('setHeight').value = S.scene.meta.height;
      AFX.buildStage(); AFX.applyFrame(S.t);
    });
    $('setDuration').addEventListener('change', () => {
      const d = Math.max(1, parseFloat($('setDuration').value) || 8);
      S.scene.meta.duration = d;
      $('setDuration').value = d;
      clampSceneToDuration();
      AFX.refreshTimeline(); AFX.applyFrame(S.t); updateTimeLabel();
    });
    $('setBg').addEventListener('input', () => {
      S.scene.meta.background = $('setBg').value;
      document.getElementById('stage').style.background = S.scene.meta.background;
    });
  }

  function clampSceneToDuration() {
    const d = S.scene.meta.duration;
    S.scene.elements.forEach(el => {
      (el.visibility || []).forEach(sg => { sg.end = Math.min(sg.end, d); sg.start = Math.min(sg.start, Math.max(0, d - 0.1)); });
      if (el.audio) el.audio.end = Math.min(el.audio.end, d);
    });
    if (S.t > d) S.t = d;
  }

  /* ---------------- 保存 / 导入 / 新建 ---------------- */
  async function saveJSON(filePath) {
    const data = AFX.serializeScene(S.scene);
    // 桌面端：通过 electron-integration 写入指定路径
    if (filePath && window.electronAPI) {
      const r = await window.electronAPI.saveFile(filePath, data);
      if (!r.ok) alert('保存失败：' + r.error);
      return;
    }
    // 浏览器：Blob 下载
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.scene.meta.name || 'scene') + '.afx.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  AFX.saveJSON = saveJSON;   // 暴露给 electron-integration 调用

  function loadJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        S.scene = AFX.normalizeScene(JSON.parse(reader.result));
        S.sel = null;
        AFX.stop();
        bindSettings();
        AFX.refreshAll();
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- 预览模式 ---------------- */
  function enterPreview() {
    S.mode = 'play';
    document.body.classList.add('play-mode');
    $('btnExitPreview').hidden = false;
    AFX.select(null);
    S.t = 0;
    AFX.play();
  }

  function exitPreview() {
    S.mode = 'edit';
    document.body.classList.remove('play-mode');
    $('btnExitPreview').hidden = true;
    AFX.stop();
  }
  AFX.exitPreview = exitPreview;

  /* ---------------- 快捷键 ---------------- */
  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || document.activeElement.isContentEditable;
      if (e.key === 'Escape' && S.mode === 'play') { exitPreview(); return; }
      if (typing) return;
      if (e.code === 'Space') {
        e.preventDefault();
        S.playing ? pause() : AFX.play();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel && S.mode === 'edit') {
        AFX.deleteElement(S.sel);
      }
    });
  }

  /* ---------------- 首次交互解锁媒体 ----------------
   * 浏览器自动播放策略：用户与页面交互后才能播放媒体。
   * 在首次 pointerdown / keydown 时尝试解锁所有音频。
   * ------------------------------------------------ */
  function bindMediaUnlock() {
    let unlocked = false;
    const handler = () => {
      if (unlocked) return;
      unlocked = true;
      if (AFX.unlockMedia) AFX.unlockMedia();
      if (AFX.unlockEnvAudio) AFX.unlockEnvAudio();   // WebAudio 上下文手势解锁
    };
    document.addEventListener('pointerdown', handler, { once: false });
    document.addEventListener('keydown', handler, { once: false });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    S.scene = AFX.demoScene();

    $('btnPlay').addEventListener('click', AFX.play);
    $('btnPause').addEventListener('click', pause);
    $('btnStop').addEventListener('click', AFX.stop);

    $('btnSave').addEventListener('click', saveJSON);
    $('btnLoad').addEventListener('click', () => $('fileLoad').click());
    $('fileLoad').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) loadJSONFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btnNew').addEventListener('click', () => {
      if (!confirm('新建将清空当前场景，确定继续？')) return;
      S.scene = AFX.emptyScene();
      S.sel = null;
      AFX.stop();
      bindSettings();
      AFX.refreshAll();
    });

    $('btnPreview').addEventListener('click', enterPreview);
    $('btnExitPreview').addEventListener('click', exitPreview);

    // 左侧添加按钮
    document.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', () => AFX.addElement(btn.dataset.type));
    });

    bindSettings();
    bindKeyboard();
    bindMediaUnlock();
    AFX.initTimelineEvents();
    AFX.refreshAll();
    setTransportUI();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

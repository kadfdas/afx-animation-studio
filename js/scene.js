/* ============================================================
 * scene.js — 场景数据模型（JSON Schema 定义 / 元素工厂 / 序列化）
 * 全局命名空间 AFX
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  let _uid = 0;
  AFX.uid = function (prefix) {
    _uid += 1;
    return (prefix || 'el') + '_' + Date.now().toString(36) + '_' + _uid;
  };

  /* ---------------- 元素类型中文名 ---------------- */
  AFX.TYPE_NAMES = {
    text: '文字', image: '图片', video: '视频', audio: '音频', svg: '图形', character: '角色'
  };

  /* ---------------- 角色系统标签 ---------------- */
  AFX.CHAR_STATES = {
    idle: '站立', sit: '坐下', walk: '行走', run: '跑动', fly: '飞行', swim: '游泳'
  };
  AFX.CHAR_RACES = { human: '人类', bird: '鸟类', fish: '鱼类' };
  // 8 方向 → 角色渲染翻转（含水平分量即镜像）
  AFX.CHAR_FACING = {
    right: 1, downRight: 1, upRight: 1,
    left: -1, downLeft: -1, upLeft: -1,
    up: 1, down: 1
  };

  /* ---------------- 动画方向向量 ---------------- */
  AFX.DIRECTIONS = {
    right:      [1, 0],
    left:       [-1, 0],
    up:         [0, -1],
    down:       [0, 1],
    upRight:    [0.7071, -0.7071],
    upLeft:     [-0.7071, -0.7071],
    downRight:  [0.7071, 0.7071],
    downLeft:   [-0.7071, 0.7071]
  };
  AFX.DIRECTION_LABELS = {
    right: '向右 →', left: '向左 ←', up: '向上 ↑', down: '向下 ↓',
    upRight: '右上 ↗', upLeft: '左上 ↖', downRight: '右下 ↘', downLeft: '左下 ↙'
  };

  /* ---------------- 默认动画参数 ---------------- */
  function defaultAnimations() {
    return {
      move:    { enabled: false, direction: 'right', distance: 120, duration: 1.5, delay: 0, easing: 'easeInOutQuad', after: 'stay' },
      scale:   { enabled: false, fromWidth: 100, fromHeight: 100, toWidth: 160, toHeight: 160, duration: 1.5, delay: 0, easing: 'easeInOutQuad' },
      opacity: { enabled: false, from: 0, to: 1, duration: 1, delay: 0, easing: 'easeInOutQuad' },
      rotate:  { enabled: false, angle: 360, direction: 'cw', duration: 3, delay: 0, easing: 'linear' }
    };
  }

  /* ---------------- SVG 预设图形 ---------------- */
  AFX.SVG_PRESETS = {
    circle: '<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" fill="#6c5ce7"/></svg>',
    rect:   '<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="84" height="84" rx="12" fill="#00b894"/></svg>',
    triangle:'<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><polygon points="50,6 94,92 6,92" fill="#e17055"/></svg>',
    star:   '<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><polygon points="50,4 61,38 98,38 68,60 79,95 50,73 21,95 32,60 2,38 39,38" fill="#fdcb6e" stroke="#e6a817" stroke-width="2"/></svg>',
    heart:  '<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M50 88 C20 64 6 46 6 30 C6 16 17 6 30 6 C39 6 46 11 50 18 C54 11 61 6 70 6 C83 6 94 16 94 30 C94 46 80 64 50 88 Z" fill="#e84393"/></svg>'
  };

  /* ---------------- 元素工厂 ---------------- */
  // scene 参数用于读取画布尺寸 / 总时长
  AFX.createElement = function (type, scene) {
    const W = scene.meta.width, H = scene.meta.height;
    const base = {
      id: AFX.uid(type),
      type,
      name: AFX.TYPE_NAMES[type] + ' ' + (scene.elements.length + 1),
      style: { x: Math.round(W / 2 - 80), y: Math.round(H / 2 - 40), width: 160, height: 80, opacity: 1, rotation: 0 },
      visibility: [{ start: 0, end: scene.meta.duration, fadeIn: 0, fadeOut: 0 }],
      animations: defaultAnimations(),
      audio: { start: 0, end: Math.min(5, scene.meta.duration), volume: 1, fadeIn: 0, fadeOut: 0 },
      // 环境适配配置（植被摇摆等，默认关闭）
      env: { sway: { enabled: false, speed: 0.5, strength: 6, phase: 0 } }
    };
    switch (type) {
      case 'text':
        base.content = { text: '双击画布中的文字可直接编辑', fontSize: 28, color: '#2d3436', bold: true, bubble: false };
        base.style.width = 320; base.style.height = 48;
        base.style.x = Math.round(W / 2 - 160); base.style.y = Math.round(H / 2 - 60);
        break;
      case 'image':
        base.content = { src: '' };
        base.style.width = 240; base.style.height = 160;
        break;
      case 'video':
        base.content = { src: '' };
        base.style.width = 320; base.style.height = 180;
        break;
      case 'audio':
        base.content = { src: '', fileName: '未选择文件' };
        base.audio.end = Math.min(4, scene.meta.duration);
        break;
      case 'svg':
        base.content = { svg: AFX.SVG_PRESETS.star, preset: 'star' };
        base.style.width = 120; base.style.height = 120;
        break;
      case 'character':
        // 角色 = 智能体：状态机 + 方向 + 外观分层 + 飞行/游泳物理
        base.content = {};
        base.char = {
          race: 'human',            // human | bird | fish
          state: 'idle',            // 默认状态：idle/sit/walk/run/fly/swim
          direction: 'right',       // 朝向（上/下/左/右/斜向）
          speed: 1,                 // 动作播放速度倍率
          skin: '#ffd9b3', shirt: '#4f9cff', pants: '#34495e',
          cues: [],                 // 状态时间轴：[{t, state?, direction?}]
          outfit: {                 // 换装系统（分层渲染）
            clothes: '', clothesX: 0, clothesY: 0, clothesScale: 1,
            accessory: '', accessoryX: 0, accessoryY: 0, accessoryScale: 1
          },
          fly: { hover: 40, flapSpeed: 2.2 },   // 飞行：Y 轴悬浮(px) / 翅膀频率(Hz)
          swim: { depth: 0.35, drag: 0.6 }      // 游泳：水深0~1(层级/雾化) / 阻力0~1
        };
        base.style.width = 120; base.style.height = 220;
        base.style.x = Math.round(W / 2 - 60); base.style.y = Math.round(H / 2 - 160);
        break;
    }
    return base;
  };

  /* ---------------- 空场景 / 演示场景 ---------------- */
  AFX.emptyScene = function () {
    return {
      version: 1,
      meta: { name: '未命名项目', duration: 8, width: 960, height: 540, background: '#ffffff' },
      // 场景级环境（环境音轨等）
      env: {
        wind: { enabled: false, volume: 0.4, gustiness: 0.5, linkSway: true, masterStrength: 1, masterSpeed: 1 }
      },
      elements: []
    };
  };

  AFX.demoScene = function () {
    const scene = AFX.emptyScene();
    scene.meta.name = '演示项目';

    const title = AFX.createElement('text', scene);
    title.name = '标题文字';
    title.content.text = '你好，动画世界';
    title.content.fontSize = 42;
    title.style.x = 250; title.style.y = 70; title.style.width = 460; title.style.height = 60;
    title.animations.move.enabled = true;
    title.animations.move.direction = 'right';
    title.animations.move.distance = 200;
    title.animations.move.duration = 1.2;
    title.animations.move.easing = 'easeOutCubic';
    title.animations.opacity.enabled = true;
    title.animations.opacity.from = 0; title.animations.opacity.to = 1;
    title.animations.opacity.duration = 1;

    const star = AFX.createElement('svg', scene);
    star.name = '旋转星星';
    star.content.preset = 'star';
    star.content.svg = AFX.SVG_PRESETS.star;
    star.style.x = 130; star.style.y = 200; star.style.width = 120; star.style.height = 120;
    star.animations.rotate.enabled = true;
    star.animations.rotate.angle = 360;
    star.animations.rotate.duration = 4;
    star.animations.rotate.direction = 'cw';
    star.animations.scale.enabled = true;
    star.animations.scale.fromWidth = 120; star.animations.scale.fromHeight = 120;
    star.animations.scale.toWidth = 170; star.animations.scale.toHeight = 170;
    star.animations.scale.duration = 2; star.animations.scale.delay = 0.5;

    const ball = AFX.createElement('svg', scene);
    ball.name = '弹跳圆球';
    ball.content.preset = 'circle';
    ball.content.svg = AFX.SVG_PRESETS.circle;
    ball.style.x = 660; ball.style.y = 180; ball.style.width = 90; ball.style.height = 90;
    ball.animations.move.enabled = true;
    ball.animations.move.direction = 'downRight';
    ball.animations.move.distance = 150;
    ball.animations.move.duration = 2;
    ball.animations.move.delay = 1;
    ball.animations.move.easing = 'easeOutBounce';
    ball.animations.move.after = 'back';

    const sub = AFX.createElement('text', scene);
    sub.name = '副标题(分段显隐)';
    sub.content.text = '多段显隐：0~3s 显示，4~8s 再现';
    sub.content.fontSize = 20;
    sub.content.color = '#636e72';
    sub.style.x = 250; sub.style.y = 440; sub.style.width = 460; sub.style.height = 36;
    sub.visibility = [
      { start: 0, end: 3, fadeIn: 0.3, fadeOut: 0.3 },
      { start: 4, end: 8, fadeIn: 0.3, fadeOut: 0.3 }
    ];

    // 树木：程序化风吹摇摆（SwayController）
    const tree = AFX.createElement('svg', scene);
    tree.name = '老树(风吹摇摆)';
    tree.content.preset = 'custom';
    tree.content.svg = '<svg viewBox="0 0 100 160" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="44" y="70" width="12" height="86" rx="4" fill="#8d6134"/>' +
      '<circle cx="50" cy="48" r="34" fill="#3fa86a"/>' +
      '<circle cx="26" cy="62" r="20" fill="#49bd77"/>' +
      '<circle cx="74" cy="62" r="20" fill="#37965d"/></svg>';
    tree.style.x = 60; tree.style.y = 220; tree.style.width = 150; tree.style.height = 240;
    tree.env.sway = { enabled: true, speed: 0.6, strength: 5, phase: 0 };

    // 角色：状态机 + 状态时间轴（5s 处切入跑动）
    const hero = AFX.createElement('character', scene);
    hero.name = '小勇(走路→跑)';
    hero.char.state = 'walk';
    hero.char.direction = 'right';
    hero.char.cues = [{ t: 5, state: 'run', direction: 'right' }];
    hero.style.x = 120; hero.style.y = 300; hero.style.width = 110; hero.style.height = 210;
    hero.animations.move.enabled = true;
    hero.animations.move.direction = 'right';
    hero.animations.move.distance = 300;
    hero.animations.move.duration = 6;
    hero.animations.move.delay = 0.5;
    hero.animations.move.easing = 'linear';

    scene.elements.push(title, star, ball, sub, tree, hero);
    return scene;
  };

  /* ---------------- 校验 / 反序列化 ---------------- */
  function num(v, def) { const n = Number(v); return isFinite(n) ? n : def; }

  AFX.normalizeScene = function (data) {
    const scene = AFX.emptyScene();
    if (!data || typeof data !== 'object') throw new Error('不是合法的场景 JSON');
    if (data.meta) Object.assign(scene.meta, {
      name: String(data.meta.name || scene.meta.name),
      duration: Math.max(1, num(data.meta.duration, 8)),
      width: Math.max(200, num(data.meta.width, 960)),
      height: Math.max(200, num(data.meta.height, 540)),
      background: data.meta.background || '#ffffff'
    });
    if (Array.isArray(data.elements)) {
      data.elements.forEach(e => {
        if (!e || !e.type || !AFX.TYPE_NAMES[e.type]) return;
        const el = AFX.createElement(e.type, scene);
        el.id = e.id || AFX.uid(e.type);
        if (e.name) el.name = String(e.name);
        if (e.content) Object.assign(el.content, e.content);
        if (e.style) Object.assign(el.style, {
          x: num(e.style.x, el.style.x), y: num(e.style.y, el.style.y),
          width: Math.max(4, num(e.style.width, el.style.width)),
          height: Math.max(4, num(e.style.height, el.style.height)),
          opacity: Math.min(1, Math.max(0, num(e.style.opacity, 1))),
          rotation: num(e.style.rotation, 0)
        });
        if (Array.isArray(e.visibility) && e.visibility.length) {
          el.visibility = e.visibility.map(s => ({
            start: Math.max(0, num(s.start, 0)),
            end: num(s.end, scene.meta.duration),
            fadeIn: Math.max(0, num(s.fadeIn, 0)),
            fadeOut: Math.max(0, num(s.fadeOut, 0))
          })).filter(s => s.end > s.start);
        }
        if (e.animations) {
          ['move', 'scale', 'opacity', 'rotate'].forEach(k => {
            if (e.animations[k]) Object.assign(el.animations[k], e.animations[k]);
          });
        }
        if (e.audio) Object.assign(el.audio, e.audio);
        if (e.env) {
          if (e.env.sway) Object.assign(el.env.sway, e.env.sway);
        }
        if (e.char && el.type === 'character') {
          const c = e.char;
          ['race', 'state', 'direction', 'skin', 'shirt', 'pants'].forEach(k => {
            if (c[k] != null) el.char[k] = String(c[k]);
          });
          ['speed'].forEach(k => { if (c[k] != null) el.char[k] = num(c[k], 1); });
          if (Array.isArray(c.cues)) {
            el.char.cues = c.cues.map(u => ({
              t: Math.max(0, num(u.t, 0)),
              state: u.state || null,
              direction: u.direction || null
            })).filter(u => u.state || u.direction).sort((a, b) => a.t - b.t);
          }
          if (c.outfit) Object.assign(el.char.outfit, c.outfit);
          if (c.fly) Object.assign(el.char.fly, c.fly);
          if (c.swim) Object.assign(el.char.swim, c.swim);
        }
        scene.elements.push(el);
      });
    }
    if (data.env && data.env.wind) Object.assign(scene.env.wind, data.env.wind);
    return scene;
  };

  AFX.serializeScene = function (scene) {
    return JSON.stringify(scene, null, 2);
  };

  /* ---------------- 时间轴工具 ---------------- */
  AFX.isVisibleAt = function (el, t) {
    if (!el.visibility || el.visibility.length === 0) return true;
    return el.visibility.some(s => t >= s.start && t < s.end);
  };

  // 分段淡入淡出系数
  AFX.segmentFadeAt = function (el, t) {
    if (!el.visibility || el.visibility.length === 0) return 1;
    for (const s of el.visibility) {
      if (t >= s.start && t < s.end) {
        let m = 1;
        if (s.fadeIn > 0 && t - s.start < s.fadeIn) m *= (t - s.start) / s.fadeIn;
        if (s.fadeOut > 0 && s.end - t < s.fadeOut) m *= (s.end - t) / s.fadeOut;
        return m;
      }
    }
    return 0;
  };

  // 通用动画进度：返回 0~1 已缓动
  AFX.progress = function (t, delay, duration, easing) {
    if (t < delay) return 0;
    if (duration <= 0) return 1;
    const p = (t - delay) / duration;
    if (p >= 1) return 1;
    return (AFX.easing[easing] || AFX.easing.linear)(p);
  };

  /* ---------------- 角色状态时间轴解析 ----------------
   * cues: [{t, state?, direction?}] 按 t 升序；
   * 返回 { state, direction }：取 ≤t 的最近 cue 覆盖默认值。
   * ------------------------------------------------------ */
  AFX.charStateAt = function (el, t) {
    const c = el.char || {};
    let state = c.state || 'idle';
    let direction = c.direction || 'right';
    (c.cues || []).forEach(u => {
      if (t >= u.t) {
        if (u.state) state = u.state;
        if (u.direction) direction = u.direction;
      }
    });
    return { state, direction };
  };
})();

/* ============================================================
 * easing.js — 缓动函数库（桌面端/移动端共享，零 DOM 依赖）
 * ============================================================ */

const easing = {
  linear(p) { return p; },

  easeInQuad(p) { return p * p; },
  easeOutQuad(p) { return 1 - (1 - p) * (1 - p); },
  easeInOutQuad(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },

  easeInCubic(p) { return p * p * p; },
  easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); },
  easeInOutCubic(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },

  easeOutQuart(p) { return 1 - Math.pow(1 - p, 4); },
  easeInOutQuart(p) { return p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2; },

  easeOutBack(p) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  },

  easeOutBounce(p) {
    const n1 = 7.5625, d1 = 2.75;
    if (p < 1 / d1) return n1 * p * p;
    if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
    if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
    return n1 * (p -= 2.625 / d1) * p + 0.984375;
  },

  easeOutElastic(p) {
    const c4 = (2 * Math.PI) / 3;
    if (p === 0 || p === 1) return p;
    return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
  }
};

const EASING_LABELS = {
  linear: '线性',
  easeInQuad: '缓入', easeOutQuad: '缓出', easeInOutQuad: '缓入缓出',
  easeInCubic: '缓入(强)', easeOutCubic: '缓出(强)', easeInOutCubic: '缓入缓出(强)',
  easeOutQuart: '缓出(四级)', easeInOutQuart: '缓入缓出(四级)',
  easeOutBack: '回弹', easeOutBounce: '弹跳', easeOutElastic: '弹性'
};

module.exports = { easing, EASING_LABELS };

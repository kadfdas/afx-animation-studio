/* ============================================================
 * components/Stage.js — 画布渲染组件（对应桌面端 render.js）
 * 用绝对定位 View 渲染元素，替代 DOM 操作
 * ============================================================ */
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { easing } from 'afx-core';
import { useAppStore } from '../store/app-store';

// 计算元素在时间 t 的状态（从桌面端 render.js 的 elementStateAt 抽取）
function elementStateAt(el, t) {
  const st = { x: 0, y: 0, opacity: 1, scale: 1, rotation: 0, visible: true };
  const anims = el.animations || {};
  const dur = el._duration || 10;

  // 可见性
  if (el.visibility) {
    if (el.visibility.in !== undefined && t < el.visibility.in) { st.visible = false; return st; }
    if (el.visibility.out !== undefined && t > el.visibility.out) { st.visible = false; return st; }
  }

  // 移动动画
  if (anims.move && anims.move.enabled) {
    const m = anims.move;
    const p = Math.max(0, Math.min(1, t / dur));
    const eased = m.easing && easing[m.easing] ? easing[m.easing](p) : p;
    if (m.direction === 'left') st.x = -m.distance * eased;
    if (m.direction === 'right') st.x = m.distance * eased;
    if (m.direction === 'up') st.y = -m.distance * eased;
    if (m.direction === 'down') st.y = m.distance * eased;
  }

  // 淡入淡出
  if (anims.fade && anims.fade.enabled) {
    const f = anims.fade;
    if (f.type === 'in' && t < f.duration) st.opacity = (t / f.duration);
    if (f.type === 'out' && t > dur - f.duration) st.opacity = (dur - t) / f.duration;
  }

  return st;
}

export default function Stage() {
  const { scene, t } = useAppStore();

  return React.createElement(View, { style: styles.stage },
    scene.elements.map(el => {
      const st = elementStateAt(el, t);
      if (!st.visible) return null;

      const style = {
        position: 'absolute',
        left: (el.style.x + st.x),
        top: (el.style.y + st.y),
        width: el.style.width,
        height: el.style.height,
        opacity: st.opacity,
        transform: [{ scale: st.scale }, { rotate: st.rotation + 'deg' }],
      };

      if (el.type === 'text') {
        return React.createElement(Text, {
          key: el.id,
          style: { ...style, color: el.content.color || '#fff', fontSize: el.content.size || 16 }
        }, el.content.text);
      }

      if (el.type === 'image') {
        return React.createElement(Image, {
          key: el.id,
          source: { uri: el.content.src },
          style
        });
      }

      return React.createElement(View, { key: el.id, style });
    })
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: '#16181d',
    overflow: 'hidden',
  },
});

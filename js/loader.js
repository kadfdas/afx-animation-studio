/* ============================================================
 * loader.js — 统一资源预加载器
 * 播放前批量预解码图片 / 音频 / 视频 / 角色服装图，防止播放卡顿。
 *   AFX.loader.preload(scene, onProgress) -> Promise<{ok, failed}>
 *   AFX.loader.getImage(src) -> HTMLImageElement | null（已解码缓存）
 * ============================================================ */
window.AFX = window.AFX || {};

(function () {
  'use strict';

  const imageCache = new Map();   // src -> HTMLImageElement（complete 即已可用）
  const audioCache = new Map();   // src -> HTMLAudioElement（仅预热 metadata）

  function loadImage(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const hit = imageCache.get(src);
      if (hit && hit.complete && hit.naturalWidth > 0) return resolve(hit);
      const img = new Image();
      img.onload = () => { imageCache.set(src, img); resolve(img); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function warmAudio(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      let a = audioCache.get(src);
      if (!a) {
        a = document.createElement('audio');
        a.preload = 'auto';
        a.src = src;
        audioCache.set(src, a);
      }
      if (a.readyState >= 1) return resolve(a);
      const done = () => resolve(a);
      a.addEventListener('loadedmetadata', done, { once: true });
      a.addEventListener('error', () => resolve(null), { once: true });
      setTimeout(() => resolve(a), 4000);   // 兜底：不阻塞播放
    });
  }

  function warmVideo(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const v = document.createElement('video');
      v.preload = 'auto';
      v.src = src;
      v.addEventListener('loadedmetadata', () => resolve(v), { once: true });
      v.addEventListener('error', () => resolve(null), { once: true });
      setTimeout(() => resolve(v), 4000);
    });
  }

  /* 收集场景中所有需要预加载的资源 */
  AFX.loader = {
    preload(scene, onProgress) {
      const tasks = [];
      const list = [];
      function add(label, promise) { list.push(label); tasks.push(promise); }

      (scene.elements || []).forEach(el => {
        if (el.type === 'image' && el.content.src) add('图片:' + el.name, loadImage(el.content.src));
        if (el.type === 'video' && el.content.src) add('视频:' + el.name, warmVideo(el.content.src));
        if (el.type === 'audio' && el.content.src) add('音频:' + el.name, warmAudio(el.content.src));
        if (el.type === 'character' && el.char && el.char.outfit) {
          const o = el.char.outfit;
          if (o.clothes) add('服装:' + el.name, loadImage(o.clothes));
          if (o.accessory) add('配饰:' + el.name, loadImage(o.accessory));
        }
      });

      let done = 0;
      const total = tasks.length;
      if (onProgress && total === 0) onProgress(1, 0);

      return Promise.all(tasks.map(p =>
        p.then(r => { done += 1; if (onProgress) onProgress(done / total, total); return r; })
      )).then(results => {
        const failed = [];
        results.forEach((r, i) => { if (r === null) failed.push(list[i]); });
        if (failed.length) console.warn('[AFX.loader] 预加载失败:', failed);
        return { ok: failed.length === 0, failed };
      });
    },

    getImage(src) {
      if (!src) return null;
      const hit = imageCache.get(src);
      return (hit && hit.complete && hit.naturalWidth > 0) ? hit : null;
    }
  };
})();

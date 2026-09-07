/* ============================================================
 * routes/projects.js — 项目 CRUD + 乐观锁同步
 * GET    /api/projects       列出当前用户所有项目
 * GET    /api/projects/:id   获取单个项目
 * POST   /api/projects       新建项目
 * PUT    /api/projects/:id   更新项目（带乐观锁）
 * DELETE /api/projects/:id   删除项目
 * ============================================================ */
const express = require('express');
const router = express.Router();
const db = require('../db');
const jwtMiddleware = require('../middleware/jwt');

router.use(jwtMiddleware);

// 列出所有项目（不返回 data，太大了）
router.get('/', (req, res) => {
  const rows = db.projects
    .filter(p => p.user_id === req.user.uid)
    .map(p => ({
      id: p.id, name: p.name, version: p.version,
      updated_at: p.updated_at, created_at: p.created_at
    }))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  res.json(rows);
});

// 获取单个项目
router.get('/:id', (req, res) => {
  const project = db.projects.find(
    p => p.id === req.params.id && p.user_id === req.user.uid
  );
  if (!project) return res.status(404).json({ error: '项目不存在' });
  res.json({
    id: project.id,
    name: project.name,
    data: project.data,
    version: project.version,
    updated_at: project.updated_at
  });
});

// 新建项目
router.post('/', (req, res) => {
  const { id, name, data } = req.body;
  if (!id || !data) return res.status(400).json({ error: '缺少 id 或 data' });
  if (db.projects.find(p => p.id === id)) {
    return res.status(409).json({ error: '项目 ID 已存在' });
  }
  const projectName = name || (data.meta && data.meta.name) || '未命名项目';
  const now = new Date().toISOString();
  db.projects.push({
    id, user_id: req.user.uid, name: projectName,
    data, version: 1, created_at: now, updated_at: now
  });
  db.save();
  res.json({ id, version: 1 });
});

// 更新项目（乐观锁）
router.put('/:id', (req, res) => {
  const { data, version } = req.body;
  if (!data) return res.status(400).json({ error: '缺少 data' });
  const expectedVersion = version || 1;
  const projectName = data.meta && data.meta.name ? data.meta.name : '未命名项目';

  const project = db.projects.find(
    p => p.id === req.params.id && p.user_id === req.user.uid
  );
  if (!project) return res.status(404).json({ error: '项目不存在' });

  // 乐观锁：版本不匹配 → 冲突
  if (project.version !== expectedVersion) {
    return res.status(409).json({
      error: 'version_conflict',
      message: '项目已被其他端修改',
      server_version: project.version,
      server_data: project.data
    });
  }

  project.data = data;
  project.name = projectName;
  project.version = expectedVersion + 1;
  project.updated_at = new Date().toISOString();
  db.save();

  res.json({ id: req.params.id, version: expectedVersion + 1 });
});

// 删除项目
router.delete('/:id', (req, res) => {
  const idx = db.projects.findIndex(
    p => p.id === req.params.id && p.user_id === req.user.uid
  );
  if (idx === -1) return res.status(404).json({ error: '项目不存在' });
  db.projects.splice(idx, 1);
  db.save();
  res.json({ ok: true });
});

module.exports = router;

/* ============================================================
 * routes/auth.js — 认证路由
 * POST /api/auth/register  注册
 * POST /api/auth/login     登录
 * GET  /api/auth/me         获取当前用户
 * ============================================================ */
const express = require('express');
const router = express.Router();
const auth = require('../auth');
const jwtMiddleware = require('../middleware/jwt');
const db = require('../db');

router.post('/register', (req, res) => {
  try {
    const { username, password, email } = req.body;
    const result = auth.register(username, password, email);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const result = auth.login(username, password);
    res.json(result);
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

router.get('/me', jwtMiddleware, (req, res) => {
  const user = db.users.find(u => u.id === req.user.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: { id: user.id, username: user.username, email: user.email } });
});

module.exports = router;

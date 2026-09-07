/* ============================================================
 * index.js — Express 服务器启动入口
 * 路由：/api/auth/* /api/projects/*
 * 默认端口 3000，可通过 .env PORT 配置
 * ============================================================ */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// 中间件
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));  // 项目 JSON 可能含 base64 图片

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }));

// 启动
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AFX Cloud] 服务器已启动: http://0.0.0.0:${PORT}`);
});

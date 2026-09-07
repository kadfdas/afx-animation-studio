/* ============================================================
 * jwt.js — JWT 验证中间件
 * ============================================================ */
const { verify } = require('../auth');

module.exports = function jwtMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  const token = auth.slice(7);
  const payload = verify(token);
  if (!payload) {
    return res.status(401).json({ error: 'token 无效或已过期' });
  }
  req.user = payload;
  next();
};

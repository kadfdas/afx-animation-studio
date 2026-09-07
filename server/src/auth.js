/* ============================================================
 * auth.js — 注册 / 登录 / JWT 签发
 * ============================================================ */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'afx-dev-secret';

function register(username, password, email) {
  if (!username || !password) throw new Error('用户名和密码不能为空');
  if (username.length < 2) throw new Error('用户名至少 2 个字符');
  if (password.length < 6) throw new Error('密码至少 6 个字符');

  if (db.users.find(u => u.username === username)) {
    throw new Error('用户名已存在');
  }

  const hash = bcrypt.hashSync(password, 10);
  const id = db.nextUserId;
  db.users.push({ id, username, email: email || null, password_hash: hash, created_at: new Date().toISOString() });
  db.incrementUserId();

  const token = jwt.sign({ uid: id }, SECRET, { expiresIn: '30d' });
  return { token, user: { id, username } };
}

function login(username, password) {
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new Error('用户名或密码错误');
  }
  const token = jwt.sign({ uid: user.id }, SECRET, { expiresIn: '30d' });
  return { token, user: { id: user.id, username: user.username } };
}

function verify(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

module.exports = { register, login, verify };

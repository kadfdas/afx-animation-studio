/* ============================================================
 * db.js — JSON 文件存储（零原生编译依赖）
 * 表：users / projects
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'afx-db.json');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 初始化数据库
let db;
function load() {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } else {
    db = { users: [], projects: [], nextUserId: 1 };
    save();
  }
}

let saveTimer = null;
function save() {
  // 延迟写入，合并多次操作
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    saveTimer = null;
  }, 100);
}

// 同步保存（用于注册等关键操作）
function saveSync() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

load();

module.exports = {
  get users() { return db.users; },
  get projects() { return db.projects; },
  get nextUserId() { return db.nextUserId; },
  incrementUserId() { db.nextUserId++; saveSync(); },
  save,
  saveSync,
  reload: load
};

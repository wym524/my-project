const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const DATA_DIR = '/data';
const DB_PATH = path.join(DATA_DIR, 'users.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const adminUsername = '001';
const adminPassword = '141242';
const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get(adminUsername);
if (!existingAdmin) {
  const hashed = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(adminUsername, hashed, 'admin');
  console.log('管理员账号已创建: 001');
}

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function parseSession(req) {
  const sessionCookie = req.cookies.session;
  if (!sessionCookie) return null;
  try {
    return JSON.parse(sessionCookie);
  } catch (e) {
    return null;
  }
}

app.get('/', (req, res) => {
  const session = parseSession(req);
  if (!session) {
    return res.redirect('/login.html');
  }
  if (session.role === 'admin') {
    return res.redirect('/admin.html');
  }
  return res.redirect('/dashboard.html');
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }
  if (password.length < 3) {
    return res.status(400).json({ success: false, message: '密码至少需要 3 位' });
  }
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ success: false, message: '用户名已存在' });
  }
  try {
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashed, 'user');
    return res.json({ success: true, message: '注册成功' });
  } catch (err) {
    return res.status(500).json({ success: false, message: '注册失败: ' + err.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  const session = JSON.stringify({ username: user.username, role: user.role });
  res.cookie('session', session, { httpOnly: true, path: '/', sameSite: 'lax' });
  return res.json({ success: true, role: user.role });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session', { path: '/' });
  return res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  const session = parseSession(req);
  if (!session) {
    return res.status(401).json({ loggedIn: false });
  }
  return res.json({ username: session.username, role: session.role, loggedIn: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器已启动，监听 http://0.0.0.0:${PORT}`);
});

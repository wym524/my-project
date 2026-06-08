const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ---------- 数据库初始化 ----------
const DATA_DIR = '/data';
const DB_PATH = path.join(DATA_DIR, 'users.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// users 表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// words 单词表
db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    meaning TEXT NOT NULL,
    example TEXT,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// questions 真题题库
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    options TEXT,
    answer TEXT,
    explanation TEXT,
    difficulty INTEGER DEFAULT 2,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// speaking_topics 口语话题
db.exec(`
  CREATE TABLE IF NOT EXISTS speaking_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    part TEXT NOT NULL,
    prompts TEXT,
    sample_answer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// writing_topics 写作题目
db.exec(`
  CREATE TABLE IF NOT EXISTS writing_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    sample_outline TEXT,
    sample_essay TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// tasks 任务表
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    module TEXT NOT NULL,
    config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// task_assignments 任务分配
db.exec(`
  CREATE TABLE IF NOT EXISTS task_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    score INTEGER DEFAULT 0,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// user_progress 用户学习进度
db.exec(`
  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    module TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    correct INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// user_words 用户单词掌握
db.exec(`
  CREATE TABLE IF NOT EXISTS user_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    word_id INTEGER NOT NULL,
    known INTEGER DEFAULT 0,
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------- 管理员账号初始化 ----------
const adminUsername = '001';
const adminPassword = '141242';
const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get(adminUsername);
if (!existingAdmin) {
  const hashed = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(adminUsername, hashed, 'admin');
  console.log('管理员账号已创建: 001');
}

// ---------- 初始数据：单词 ----------
const initialWords = [
  ['abandon', '放弃，抛弃', 'He abandoned his family.', '高频'],
  ['ability', '能力，才能', 'She has the ability to learn quickly.', '高频'],
  ['absolute', '绝对的，完全的', 'That is an absolute fact.', '高频'],
  ['academic', '学术的，学院的', 'Academic research is important.', '学术'],
  ['accept', '接受', 'I accept your apology.', '高频'],
  ['access', '进入，使用权', 'Students have access to the library.', '高频'],
  ['achieve', '达到，完成', 'He achieved his goal.', '高频'],
  ['acquire', '获得，取得', 'She acquired new skills.', '高频'],
  ['adapt', '适应', 'Animals adapt to their environment.', '高频'],
  ['adequate', '足够的，充分的', 'We need adequate supplies.', '写作'],
  ['administer', '管理，执行', 'She administers the program.', '学术'],
  ['advocate', '提倡，拥护', 'He advocates for change.', '写作'],
  ['affect', '影响', 'The news affected her deeply.', '高频'],
  ['aggregate', '总计，集合的', 'The aggregate score was high.', '学术'],
  ['alternative', '替代的，选择', 'There is no alternative.', '高频'],
  ['ambiguous', '模糊的，含糊的', 'The message was ambiguous.', '写作'],
  ['analyze', '分析', 'Scientists analyze data.', '学术'],
  ['approach', '方法，接近', 'Try a different approach.', '高频'],
  ['appropriate', '适当的', 'Is this appropriate for work?', '写作'],
  ['arbitrary', '任意的，武断的', 'The decision seemed arbitrary.', '学术']
];
{
  const count = db.prepare('SELECT COUNT(*) AS c FROM words').get().c;
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO words (word, meaning, example, category) VALUES (?, ?, ?, ?)');
    const tx = db.transaction((words) => {
      for (const w of words) stmt.run(w[0], w[1], w[2], w[3]);
    });
    tx(initialWords);
    console.log('初始单词数据已插入');
  }
}

// ---------- 初始数据：真题 ----------
const initialQuestions = [
  { module: 'reading', type: 'choice', prompt: 'According to the passage, what is the main cause of climate change?', options: JSON.stringify(['Natural disasters', 'Human activities', 'Solar radiation', 'Ocean currents']), answer: '1', explanation: '文章主要讨论人类活动导致气候变化', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'The word "substantial" in paragraph 2 is closest in meaning to:', options: JSON.stringify(['small', 'significant', 'unusual', 'recent']), answer: '1', explanation: 'substantial 意为大量的、重要的', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'Which of the following is NOT mentioned as a benefit of exercise?', options: JSON.stringify(['Improved health', 'Better sleep', 'Higher income', 'Stress relief']), answer: '2', explanation: '收入提高未被提及', difficulty: 1 },
  { module: 'reading', type: 'choice', prompt: 'Based on the article, technology has made communication:', options: JSON.stringify(['slower', 'more expensive', 'faster and easier', 'less important']), answer: '2', explanation: '科技使沟通更快更方便', difficulty: 1 },
  { module: 'reading', type: 'choice', prompt: "The author's attitude towards remote work is:", options: JSON.stringify(['strongly negative', 'mostly positive', 'completely neutral', 'very critical']), answer: '1', explanation: '作者总体上持积极态度', difficulty: 3 },
  { module: 'reading', type: 'choice', prompt: 'What can be inferred about the future of AI?', options: JSON.stringify(['It will disappear soon', 'It will continue to grow', 'It will replace all jobs', 'It is already outdated']), answer: '1', explanation: '从文章可推断AI将持续发展', difficulty: 3 },
  { module: 'reading', type: 'choice', prompt: 'The primary purpose of the passage is to:', options: JSON.stringify(['entertain readers', 'describe a phenomenon', 'criticize scientists', 'promote a product']), answer: '1', explanation: '文章主要目的是描述现象', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'Which statement best summarizes the main idea?', options: JSON.stringify(['Education is expensive', 'Learning changes lives', 'Schools are old-fashioned', 'Teachers are underpaid']), answer: '1', explanation: '文章主旨是学习改变生活', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'The word "utopia" most likely refers to:', options: JSON.stringify(['a perfect place', 'a type of food', 'a machine', 'a city in Europe']), answer: '0', explanation: '乌托邦指理想完美的地方', difficulty: 3 },
  { module: 'reading', type: 'choice', prompt: 'Why does the author mention "the industrial revolution"?', options: JSON.stringify(['To criticize factories', 'To give historical context', 'To praise workers', 'To describe a building']), answer: '1', explanation: '用于提供历史背景', difficulty: 2 },
  { module: 'listening', type: 'blank', prompt: "The meeting will begin at _______ o'clock.", options: null, answer: 'nine', explanation: '听力原文提到九点钟', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'Students must submit their _______ by Friday.', options: null, answer: 'assignment', explanation: '提交作业', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'The _______ of the research will be published next month.', options: null, answer: 'results', explanation: '研究结果将于下月发表', difficulty: 2 },
  { module: 'listening', type: 'blank', prompt: 'She is _______ in environmental science.', options: null, answer: 'interested', explanation: '对...感兴趣', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'The library is _______ from here.', options: null, answer: 'far', explanation: '图书馆离这儿很远', difficulty: 1 }
];
{
  const count = db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO questions (module, type, prompt, options, answer, explanation, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const tx = db.transaction((items) => {
      for (const q of items) stmt.run(q.module, q.type, q.prompt, q.options, q.answer, q.explanation, q.difficulty);
    });
    tx(initialQuestions);
    console.log('初始真题数据已插入');
  }
}

// ---------- 初始数据：口语话题 ----------
const initialSpeaking = [
  { topic: 'Describe a book that had a major influence on you', part: 'part2', prompts: JSON.stringify(['What was the book?', 'When did you read it?', 'What was it about?', 'How did it influence you?']), sample_answer: 'The book that influenced me most is "Sapiens". I read it during university. It explains the history of humankind from a unique perspective. It changed the way I think about society and our place in history.' },
  { topic: 'Do you like watching films?', part: 'part1', prompts: JSON.stringify(['What type of films do you like?', 'How often do you watch films?', 'Do you prefer watching films at home or in the cinema?']), sample_answer: 'Yes, I love watching films. I particularly enjoy science fiction and dramas. I usually watch a film at the cinema once or twice a month.' },
  { topic: 'Describe a place you would like to visit', part: 'part2', prompts: JSON.stringify(['Where is it?', 'Why do you want to go there?', 'Who would you go with?', 'What would you do there?']), sample_answer: 'I would love to visit Iceland. It has stunning natural landscapes including glaciers and the Northern Lights. I would go with my family and spend a week exploring the countryside.' },
  { topic: 'How important is music in our lives?', part: 'part3', prompts: JSON.stringify(['What role does music play in different cultures?', 'Is traditional music still important today?', 'How does music affect people\'s emotions?']), sample_answer: 'Music is extremely important in our lives. It connects people across cultures and can express emotions that words cannot. Traditional music helps preserve our cultural heritage.' },
  { topic: 'Describe a skill you would like to learn', part: 'part2', prompts: JSON.stringify(['What skill is it?', 'Why do you want to learn it?', 'How would you learn it?', 'How difficult would it be?']), sample_answer: 'I would like to learn how to play the piano. I have always admired people who can play. I would take lessons from a teacher and practice every day. It would be challenging but very rewarding.' },
  { topic: 'Do you prefer living in a city or the countryside?', part: 'part1', prompts: JSON.stringify(['What are the advantages of each?', 'Which do you prefer and why?', 'How has this changed over time?']), sample_answer: 'I prefer living in a city because there are more job opportunities and things to do. However, I sometimes miss the peace and quiet of the countryside.' },
  { topic: 'Describe someone who has had an important influence on your life', part: 'part2', prompts: JSON.stringify(['Who is this person?', 'How long have you known them?', 'What qualities do they have?', 'How have they influenced you?']), sample_answer: 'My mother has had the greatest influence on me. She taught me the value of hard work and kindness. Her example shaped who I am today.' },
  { topic: 'What is the best way to learn a second language?', part: 'part3', prompts: JSON.stringify(['Is immersion the best method?', 'How important is grammar?', 'Should learning be fun?']), sample_answer: 'The best way is immersion in my opinion. When you live in the country and speak the language daily, you learn much faster. Grammar is important but communication should be the priority.' }
];
{
  const count = db.prepare('SELECT COUNT(*) AS c FROM speaking_topics').get().c;
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO speaking_topics (topic, part, prompts, sample_answer) VALUES (?, ?, ?, ?)');
    const tx = db.transaction((items) => {
      for (const s of items) stmt.run(s.topic, s.part, s.prompts, s.sample_answer);
    });
    tx(initialSpeaking);
    console.log('初始口语话题数据已插入');
  }
}

// ---------- 初始数据：写作题目 ----------
const initialWriting = [
  { type: '大作文', prompt: 'Some people believe that technology has made our lives more complicated, while others argue that it has made life easier. Discuss both views and give your own opinion.', sample_outline: JSON.stringify({ introduction: '引入话题：科技既简化也复杂化了生活', paragraph1: '赞成简化：通讯便捷、工作效率、信息获取', paragraph2: '反对：信息过载、隐私问题、依赖问题', conclusion: '总体上利大于弊，但需谨慎使用' }), sample_essay: 'In recent decades, technology has transformed almost every aspect of our daily lives. While some argue that it has introduced unnecessary complexity, others believe life has become significantly easier as a result...' },
  { type: '大作文', prompt: 'In many countries, the amount of crime is increasing. What do you think are the main causes of crime? How can we deal with this problem?', sample_outline: JSON.stringify({ introduction: '犯罪率上升是社会重要问题', paragraph1: '主要原因：贫困、教育缺失、媒体暴力影响', paragraph2: '解决方案：提高教育水平、创造就业、加强社区建设', conclusion: '多方面措施才能有效解决' }), sample_essay: 'The rising crime rate in many societies is a pressing concern that requires careful analysis. While the reasons behind this trend are complex, several key factors stand out...' },
  { type: '小作文', prompt: 'The chart below shows the percentage of people using different modes of transport in a European city in 1990 and 2020. Summarize the information by selecting and reporting the main features, and make comparisons where relevant.', sample_outline: JSON.stringify({ introduction: '描述图表内容：1990年和2020年城市交通方式对比', paragraph1: '主要趋势：私家车大幅增长，步行和自行车下降', paragraph2: '具体数据：公共交通变化较小', conclusion: '总体趋势反映城市扩张和生活方式变化' }), sample_essay: 'The bar chart illustrates how transportation patterns changed in a European city between 1990 and 2020...' },
  { type: '大作文', prompt: 'Nowadays, more and more people decide to have children later in life. What are the reasons? Do the advantages of this trend outweigh the disadvantages?', sample_outline: JSON.stringify({ introduction: '晚育现象日益普遍', paragraph1: '原因：职业发展、经济压力、个人成熟度', paragraph2: '利弊分析：利：经济稳定、育儿更理性；弊：健康风险、代沟', conclusion: '利大于弊但需关注健康问题' }), sample_essay: 'Delayed parenthood has become increasingly common in modern societies. This trend reflects significant social and economic changes...' },
  { type: '大作文', prompt: 'Some people think that governments should invest in public health, while others believe that the money should be spent on new roads instead. Discuss both views and give your opinion.', sample_outline: JSON.stringify({ introduction: '政府资源分配问题', paragraph1: '公共卫生的重要性：预防疾病、提高生活质量', paragraph2: '道路建设：促进经济发展、改善交通', conclusion: '两者都重要，但公共卫生优先级更高' }), sample_essay: 'The allocation of government resources between public health and infrastructure is a common debate...' },
  { type: '小作文', prompt: 'The two maps below show an island, before and after the construction of some tourist facilities. Summarize the information by selecting and reporting the main features.', sample_outline: JSON.stringify({ introduction: '描述岛屿在旅游设施建设前后的变化', paragraph1: '主要变化：新增酒店、餐厅、码头', paragraph2: '细节：道路连接、植被变化', conclusion: '岛屿从原始变为功能完善的旅游目的地' }), sample_essay: 'The two maps illustrate developments that occurred on an island following the construction of tourist facilities...' }
];
{
  const count = db.prepare('SELECT COUNT(*) AS c FROM writing_topics').get().c;
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO writing_topics (type, prompt, sample_outline, sample_essay) VALUES (?, ?, ?, ?)');
    const tx = db.transaction((items) => {
      for (const w of items) stmt.run(w.type, w.prompt, w.sample_outline, w.sample_essay);
    });
    tx(initialWriting);
    console.log('初始写作题目数据已插入');
  }
}

// ---------- Express 中间件 ----------
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Session 解析工具 ----------
const parseSession = (req) => {
  const sessionCookie = req.cookies.session;
  if (!sessionCookie) return null;
  try {
    return JSON.parse(sessionCookie);
  } catch (e) {
    return null;
  }
};

// 要求已登录
const requireLogin = (req, res) => {
  const session = parseSession(req);
  if (!session) {
    res.status(401).json({ success: false, message: '未登录' });
    return null;
  }
  return session;
};

// 要求管理员
const requireAdmin = (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return null;
  if (session.role !== 'admin') {
    res.status(403).json({ success: false, message: '无权限，需要管理员' });
    return null;
  }
  return session;
};

// 将数据库记录的 JSON 字段解析
const formatQuestion = (q) => {
  if (!q) return q;
  return { ...q, options: q.options ? JSON.parse(q.options) : null };
};

const formatSpeaking = (s) => {
  if (!s) return s;
  return { ...s, prompts: s.prompts ? JSON.parse(s.prompts) : null };
};

const formatWriting = (w) => {
  if (!w) return w;
  return { ...w, sample_outline: w.sample_outline ? JSON.parse(w.sample_outline) : null };
};

const formatTask = (t) => {
  if (!t) return t;
  return { ...t, config: t.config ? JSON.parse(t.config) : null };
};

// ---------- 首页路由 ----------
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

// ========== 认证 API ==========
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
  const session = requireLogin(req, res);
  if (!session) return;
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

// ========== 单词学习 API ==========
app.get('/api/words', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { category, limit, offset } = req.query;
  let sql = 'SELECT * FROM words WHERE 1=1';
  const params = [];
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY id ASC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(Number(limit));
    if (offset) {
      sql += ' OFFSET ?';
      params.push(Number(offset));
    }
  }
  const rows = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) AS c FROM words WHERE 1=1' + (category ? ' AND category = ?' : '')).get(...(category ? [category] : [])).c;
  return res.json({ success: true, data: rows, total });
});

app.get('/api/words/:id', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const row = db.prepare('SELECT * FROM words WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ success: false, message: '单词不存在' });
  return res.json({ success: true, data: row });
});

app.post('/api/words', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { word, meaning, example, category } = req.body || {};
  if (!word || !meaning) return res.status(400).json({ success: false, message: '单词和释义必填' });
  const info = db.prepare('INSERT INTO words (word, meaning, example, category) VALUES (?, ?, ?, ?)').run(word, meaning, example || '', category || '高频');
  return res.json({ success: true, id: info.lastInsertRowid });
});

app.put('/api/words/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { word, meaning, example, category } = req.body || {};
  const existing = db.prepare('SELECT * FROM words WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ success: false, message: '单词不存在' });
  db.prepare('UPDATE words SET word=?, meaning=?, example=?, category=? WHERE id=?').run(word || existing.word, meaning || existing.meaning, example !== undefined ? example : existing.example, category !== undefined ? category : existing.category, Number(req.params.id));
  return res.json({ success: true });
});

app.delete('/api/words/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  db.prepare('DELETE FROM words WHERE id = ?').run(Number(req.params.id));
  return res.json({ success: true });
});

app.post('/api/words/:id/known', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const wordId = Number(req.params.id);
  const word = db.prepare('SELECT * FROM words WHERE id = ?').get(wordId);
  if (!word) return res.status(404).json({ success: false, message: '单词不存在' });
  const existing = db.prepare('SELECT * FROM user_words WHERE username = ? AND word_id = ?').get(session.username, wordId);
  if (existing) {
    db.prepare('UPDATE user_words SET known=1, reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(existing.id);
  } else {
    db.prepare('INSERT INTO user_words (username, word_id, known) VALUES (?, ?, 1)').run(session.username, wordId);
  }
  return res.json({ success: true });
});

// ========== 真题 API ==========
app.get('/api/questions', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { module, type, limit, offset } = req.query;
  let sql = 'SELECT * FROM questions WHERE 1=1';
  const params = [];
  if (module) { sql += ' AND module = ?'; params.push(module); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY id ASC';
  if (limit) {
    sql += ' LIMIT ?'; params.push(Number(limit));
    if (offset) { sql += ' OFFSET ?'; params.push(Number(offset)); }
  }
  const rows = db.prepare(sql).all(...params).map(formatQuestion);
  return res.json({ success: true, data: rows });
});

app.get('/api/questions/:id', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ success: false, message: '题目不存在' });
  return res.json({ success: true, data: formatQuestion(row) });
});

app.post('/api/questions', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { module, type, prompt, options, answer, explanation, difficulty } = req.body || {};
  if (!module || !type || !prompt || answer === undefined || answer === null) {
    return res.status(400).json({ success: false, message: '字段不完整' });
  }
  const optionsStr = Array.isArray(options) ? JSON.stringify(options) : (options || null);
  const answerStr = typeof answer === 'number' ? String(answer) : answer;
  const info = db.prepare('INSERT INTO questions (module, type, prompt, options, answer, explanation, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)').run(module, type, prompt, optionsStr, answerStr, explanation || '', Number(difficulty) || 2);
  return res.json({ success: true, id: info.lastInsertRowid });
});

app.delete('/api/questions/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  db.prepare('DELETE FROM questions WHERE id = ?').run(Number(req.params.id));
  return res.json({ success: true });
});

app.post('/api/questions/:id/answer', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { answer } = req.body || {};
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(req.params.id));
  if (!q) return res.status(404).json({ success: false, message: '题目不存在' });
  const userAns = typeof answer === 'number' ? String(answer) : String(answer || '').trim();
  const correctAns = String(q.answer || '').trim();
  const correct = userAns.toLowerCase() === correctAns.toLowerCase() ? 1 : 0;
  db.prepare('INSERT INTO user_progress (username, module, item_id, correct) VALUES (?, ?, ?, ?)').run(session.username, 'question', q.id, correct);
  return res.json({ success: true, correct: correct === 1, answer: q.answer, explanation: q.explanation });
});

// ========== 口语 API ==========
app.get('/api/speaking', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { part, limit } = req.query;
  let sql = 'SELECT * FROM speaking_topics WHERE 1=1';
  const params = [];
  if (part) { sql += ' AND part = ?'; params.push(part); }
  sql += ' ORDER BY id ASC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
  const rows = db.prepare(sql).all(...params).map(formatSpeaking);
  return res.json({ success: true, data: rows });
});

app.get('/api/speaking/:id', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const row = db.prepare('SELECT * FROM speaking_topics WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ success: false, message: '话题不存在' });
  return res.json({ success: true, data: formatSpeaking(row) });
});

app.post('/api/speaking', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { topic, part, prompts, sample_answer } = req.body || {};
  if (!topic || !part) return res.status(400).json({ success: false, message: '话题和部分必填' });
  const promptsStr = Array.isArray(prompts) ? JSON.stringify(prompts) : (prompts || null);
  const info = db.prepare('INSERT INTO speaking_topics (topic, part, prompts, sample_answer) VALUES (?, ?, ?, ?)').run(topic, part, promptsStr, sample_answer || '');
  return res.json({ success: true, id: info.lastInsertRowid });
});

app.delete('/api/speaking/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  db.prepare('DELETE FROM speaking_topics WHERE id = ?').run(Number(req.params.id));
  return res.json({ success: true });
});

app.post('/api/speaking/:id/practice', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const id = Number(req.params.id);
  const s = db.prepare('SELECT * FROM speaking_topics WHERE id = ?').get(id);
  if (!s) return res.status(404).json({ success: false, message: '话题不存在' });
  db.prepare('INSERT INTO user_progress (username, module, item_id, correct) VALUES (?, ?, ?, 1)').run(session.username, 'speaking', id);
  return res.json({ success: true });
});

// ========== 写作 API ==========
app.get('/api/writing', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { type, limit } = req.query;
  let sql = 'SELECT * FROM writing_topics WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY id ASC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
  const rows = db.prepare(sql).all(...params).map(formatWriting);
  return res.json({ success: true, data: rows });
});

app.get('/api/writing/:id', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const row = db.prepare('SELECT * FROM writing_topics WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ success: false, message: '题目不存在' });
  return res.json({ success: true, data: formatWriting(row) });
});

app.post('/api/writing', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { type, prompt, sample_outline, sample_essay } = req.body || {};
  if (!type || !prompt) return res.status(400).json({ success: false, message: '类型和题目必填' });
  const outlineStr = typeof sample_outline === 'object' ? JSON.stringify(sample_outline) : (sample_outline || null);
  const info = db.prepare('INSERT INTO writing_topics (type, prompt, sample_outline, sample_essay) VALUES (?, ?, ?, ?)').run(type, prompt, outlineStr, sample_essay || '');
  return res.json({ success: true, id: info.lastInsertRowid });
});

app.delete('/api/writing/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  db.prepare('DELETE FROM writing_topics WHERE id = ?').run(Number(req.params.id));
  return res.json({ success: true });
});

// ========== 任务系统 API ==========
app.get('/api/tasks', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  if (session.role === 'admin') {
    const rows = db.prepare('SELECT * FROM tasks ORDER BY id DESC').all().map(formatTask);
    const withAssignments = rows.map((t) => {
      const as = db.prepare('SELECT * FROM task_assignments WHERE task_id = ?').all(t.id);
      return { ...t, assignments: as };
    });
    return res.json({ success: true, data: withAssignments });
  }
  const assignments = db.prepare('SELECT ta.*, t.title, t.description, t.module, t.config, t.created_at AS task_created FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id WHERE ta.username = ? ORDER BY ta.id DESC').all(session.username);
  const data = assignments.map((a) => ({
    id: a.task_id,
    title: a.title,
    description: a.description,
    module: a.module,
    config: a.config ? JSON.parse(a.config) : null,
    status: a.status,
    score: a.score,
    created_at: a.task_created,
    completed_at: a.completed_at
  }));
  return res.json({ success: true, data });
});

app.post('/api/tasks', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { title, description, module, config } = req.body || {};
  if (!title || !module) return res.status(400).json({ success: false, message: '标题和模块必填' });
  const adminUser = db.prepare('SELECT * FROM users WHERE username = ?').get(session.username);
  const configStr = typeof config === 'object' ? JSON.stringify(config) : (config || null);
  const info = db.prepare('INSERT INTO tasks (creator_id, title, description, module, config) VALUES (?, ?, ?, ?, ?)').run(adminUser ? adminUser.id : null, title, description || '', module, configStr);
  return res.json({ success: true, id: info.lastInsertRowid });
});

app.delete('/api/tasks/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM task_assignments WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return res.json({ success: true });
});

app.post('/api/tasks/:id/assign', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { username } = req.body || {};
  const taskId = Number(req.params.id);
  if (!username) return res.status(400).json({ success: false, message: '用户名必填' });
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  const existing = db.prepare('SELECT * FROM task_assignments WHERE task_id = ? AND username = ?').get(taskId, username);
  if (existing) return res.status(400).json({ success: false, message: '该用户已被分配此任务' });
  db.prepare('INSERT INTO task_assignments (task_id, username, status, score) VALUES (?, ?, \'pending\', 0)').run(taskId, username);
  return res.json({ success: true });
});

app.get('/api/tasks/:id', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const id = Number(req.params.id);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
  const formatted = formatTask(task);
  const assignments = db.prepare('SELECT * FROM task_assignments WHERE task_id = ?').all(id);
  if (session.role === 'admin') {
    return res.json({ success: true, data: { ...formatted, assignments } });
  }
  const myAssignment = assignments.find((a) => a.username === session.username);
  if (!myAssignment) return res.status(403).json({ success: false, message: '此任务未分配给你' });
  return res.json({ success: true, data: { ...formatted, assignment: myAssignment } });
});

app.post('/api/tasks/:id/complete', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const taskId = Number(req.params.id);
  const { score } = req.body || {};
  const as = db.prepare('SELECT * FROM task_assignments WHERE task_id = ? AND username = ?').get(taskId, session.username);
  if (!as) return res.status(404).json({ success: false, message: '未找到分配记录' });
  const finalScore = typeof score === 'number' ? score : (score ? Number(score) : (as.score || 0));
  db.prepare('UPDATE task_assignments SET status=\'completed\', score=?, completed_at=CURRENT_TIMESTAMP WHERE id=?').run(finalScore, as.id);
  return res.json({ success: true });
});

// ========== 学习统计 API ==========
app.get('/api/stats', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const totalTasks = db.prepare('SELECT COUNT(*) AS c FROM task_assignments WHERE username = ?').get(session.username).c;
  const completedTasks = db.prepare('SELECT COUNT(*) AS c FROM task_assignments WHERE username = ? AND status = \'completed\'').get(session.username).c;
  const knownWords = db.prepare('SELECT COUNT(*) AS c FROM user_words WHERE username = ? AND known = 1').get(session.username).c;
  const answeredQuestions = db.prepare('SELECT COUNT(*) AS c FROM user_progress WHERE username = ? AND module = \'question\'').get(session.username).c;
  const correctQuestions = db.prepare('SELECT COUNT(*) AS c FROM user_progress WHERE username = ? AND module = \'question\' AND correct = 1').get(session.username).c;
  return res.json({
    success: true,
    data: {
      totalTasks,
      completedTasks,
      knownWords,
      answeredQuestions,
      correctQuestions
    }
  });
});

// ---------- 启动服务 ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器已启动，监听 http://0.0.0.0:${PORT}`);
});

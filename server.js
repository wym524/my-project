const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

// ---------- 实时视频流（纯内存，不保存任何文件）----------
// { username: { frame: 'data:image/jpeg;base64,...', ts: 毫秒 } }
const liveFrames = new Map();
const studentConnections = new Map(); // username -> WebSocket
const adminConnections = new Set();   // 管理员 WebSocket 集合

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

// daily_checkins 用户打卡
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// study_sessions 学习会话记录
db.exec(`
  CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    module TEXT NOT NULL,
    item_id INTEGER,
    duration_seconds INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ai_configs AI 配置
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'qwen',
    api_key TEXT NOT NULL,
    base_url TEXT,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ai_conversations AI 对话记录
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    module TEXT NOT NULL DEFAULT 'chat',
    prompt TEXT NOT NULL,
    ai_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// quizzes 管理员出的卷子
db.exec(`
  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER,
    title TEXT NOT NULL,
    target_username TEXT,
    description TEXT,
    total_words INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    config TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// quiz_items 卷子包含的题目/单词
db.exec(`
  CREATE TABLE IF NOT EXISTS quiz_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// quiz_answers 用户答题记录
db.exec(`
  CREATE TABLE IF NOT EXISTS quiz_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    user_answer TEXT,
    correct INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// posts 用户日记/心情
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    mood TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// comments 评论（管理员/用户都可以评论）
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// likes 点赞
db.exec(`
  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, username)
  );
`);

// notifications 管理员强制弹窗/提醒
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_username TEXT DEFAULT '',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    level TEXT DEFAULT 'normal',
    sound_enabled INTEGER DEFAULT 1,
    created_by TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged TEXT DEFAULT ''
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
  ['abandon', '放弃，抛弃', 'He abandoned his family and moved abroad.', '高频'],
  ['ability', '能力，才能', 'She has the ability to solve complex problems.', '高频'],
  ['absolute', '绝对的，完全的', 'There is no absolute answer to this question.', '高频'],
  ['academic', '学术的', 'Academic writing requires careful analysis.', '学术'],
  ['accept', '接受，承认', 'Universities accept thousands of students each year.', '高频'],
  ['access', '进入，使用权', 'Students have access to the online library.', '高频'],
  ['achieve', '达到，完成', 'She achieved a high score on the IELTS test.', '高频'],
  ['acquire', '获得，取得', 'Many people acquire new skills through study.', '高频'],
  ['adapt', '适应', 'Students must adapt to new learning environments.', '高频'],
  ['adequate', '足够的，充分的', 'The room provides adequate space for study.', '写作'],
  ['administrate', '管理，执行', 'He helps administrate the school programs.', '学术'],
  ['advocate', '提倡，拥护', 'Environmental groups advocate green policies.', '写作'],
  ['affect', '影响', 'Weather conditions can affect exam performance.', '高频'],
  ['aggregate', '总计，集合的', 'The aggregate data showed clear trends.', '学术'],
  ['alternative', '替代的，选择', 'We explored alternative solutions.', '高频'],
  ['ambiguous', '模糊的，含糊的', 'The instructions were ambiguous and confusing.', '写作'],
  ['analyze', '分析', 'Scientists analyze data to find patterns.', '学术'],
  ['approach', '方法，接近', 'Try a different approach to solve the problem.', '高频'],
  ['appropriate', '适当的', 'Formal attire is appropriate for the event.', '写作'],
  ['arbitrary', '任意的，武断的', 'The grading seemed arbitrary and unfair.', '学术'],
  ['aspect', '方面，外观', 'We examined every aspect of the research.', '高频'],
  ['assess', '评估，评定', 'Teachers assess student progress each term.', '写作'],
  ['assume', '假定，承担', 'We assume the data is correct.', '学术'],
  ['authority', '权威，当局', 'The authority issued new guidelines.', '学术'],
  ['available', '可用的，可得到的', 'More study materials are available online.', '高频'],
  ['beneficial', '有益的', 'Regular exercise is beneficial to health.', '写作'],
  ['bias', '偏见，倾向', 'The report showed clear gender bias.', '学术'],
  ['capacity', '容量，能力', 'The hall has a capacity of 500 students.', '高频'],
  ['category', '类别，种类', 'Books are organized by category.', '高频'],
  ['challenge', '挑战', 'Learning a new language is a challenge.', '高频'],
  ['character', '性格，角色', 'Good character is important in leadership.', '写作'],
  ['circumstance', '情况，环境', 'His circumstances prevented him from studying.', '高频'],
  ['cite', '引用', 'You must cite your sources in essays.', '写作'],
  ['civil', '公民的，文明的', 'Civil society plays an important role.', '写作'],
  ['clarify', '澄清，说明', 'Please clarify the meaning of this word.', '写作'],
  ['coherent', '连贯的，一致的', 'She presented a coherent argument.', '写作'],
  ['collapse', '倒塌，崩溃', 'The building collapsed after the earthquake.', '听力'],
  ['column', '专栏，栏', 'The data is arranged in columns.', '学术'],
  ['commit', '承诺，致力于', 'She is committed to her studies.', '高频'],
  ['communicate', '沟通，交流', 'Effective communication is essential.', '口语'],
  ['compare', '比较', 'Compare the two passages carefully.', '阅读'],
  ['compete', '竞争', 'Students compete for scholarships.', '高频'],
  ['complex', '复杂的', 'The issue is more complex than it seems.', '学术'],
  ['concept', '概念', 'The concept of climate change is important.', '学术'],
  ['conclude', '得出结论，结束', 'The study concluded with findings.', '写作'],
  ['conduct', '进行，行为', 'Scientists conduct experiments.', '学术'],
  ['confirm', '确认，证实', 'Please confirm your attendance.', '高频'],
  ['conscious', '有意识的，清醒的', 'He was conscious of the importance.', '写作'],
  ['consider', '考虑', 'You should consider all options.', '高频'],
  ['consistent', '一致的，始终如一的', 'He is consistent in his work.', '写作'],
  ['constitute', '构成，组成', 'Women constitute 50 percent of the class.', '学术'],
  ['construct', '建造，构建', 'They plan to construct a new lab.', '学术'],
  ['consult', '咨询，商议', 'You should consult an expert.', '写作'],
  ['contemporary', '当代的，现代的', 'Contemporary artists challenge traditions.', '学术'],
  ['context', '上下文，背景', 'Consider the context of the passage.', '阅读'],
  ['continue', '继续', 'She continued her studies at university.', '高频'],
  ['contract', '合同，收缩', 'He signed a two-year contract.', '高频'],
  ['contrast', '对比，对照', 'There is a sharp contrast between them.', '阅读'],
  ['contribute', '贡献', 'Regular exercise contributes to good health.', '写作'],
  ['control', '控制，管理', 'Governments try to control pollution.', '高频'],
  ['convince', '说服，使确信', 'He convinced me to change my mind.', '写作'],
  ['corporate', '公司的，企业的', 'Corporate culture affects productivity.', '学术'],
  ['correspond', '对应，通信', 'The numbers correspond to each other.', '学术'],
  ['credible', '可信的', 'The source is highly credible.', '写作'],
  ['critical', '关键的，批评的', 'This is a critical moment for our team.', '写作'],
  ['crucial', '至关重要的', 'Water is crucial for survival.', '写作'],
  ['culture', '文化', 'Culture shapes how people think.', '口语'],
  ['current', '当前的，流行的', 'Current events are discussed in class.', '高频'],
  ['decline', '下降，拒绝', 'Population numbers began to decline.', '阅读'],
  ['define', '定义，规定', 'Dictionary defines words clearly.', '学术'],
  ['definite', '明确的，一定的', 'There is a definite need for more resources.', '写作'],
  ['demonstrate', '证明，演示', 'The study demonstrates the effects.', '写作'],
  ['derive', '派生，得出', 'He derived conclusions from data.', '学术'],
  ['design', '设计', 'Engineers design new buildings.', '高频'],
  ['despite', '尽管', 'Despite the weather, the event continued.', '写作'],
  ['determine', '确定，决定', 'Scientists determine causes of disease.', '学术'],
  ['develop', '发展，开发', 'Cities develop rapidly today.', '高频'],
  ['differentiate', '区分，区别', 'It is hard to differentiate the two.', '学术'],
  ['difficult', '困难的', 'The exam was more difficult than expected.', '高频'],
  ['dimension', '维度，方面', 'There is another dimension to this issue.', '学术'],
  ['direct', '直接的，指导', 'Please give me a direct answer.', '高频'],
  ['discipline', '纪律，学科', 'Every discipline has its own methods.', '学术'],
  ['discover', '发现', 'Scientists discover new species.', '高频'],
  ['discuss', '讨论', 'Students discuss topics in groups.', '口语'],
  ['dismiss', '解散，驳回', 'The judge dismissed the case.', '学术'],
  ['distinct', '独特的，明显的', 'Each region has distinct features.', '阅读'],
  ['distribute', '分发，分布', 'Resources are distributed equally.', '学术'],
  ['document', '文件，记录', 'Please read the document carefully.', '高频'],
  ['dominate', '占主导地位', 'One company dominates the market.', '写作'],
  ['dynamic', '动态的，有活力的', 'Cities are dynamic places.', '写作'],
  ['economy', '经济', 'The economy grew last year.', '高频'],
  ['effective', '有效的', 'The method proved effective.', '写作'],
  ['efficient', '高效的', 'Modern technology is more efficient.', '写作'],
  ['eliminate', '消除，排除', 'We need to eliminate waste.', '学术'],
  ['emphasize', '强调', 'He emphasized the importance of study.', '写作'],
  ['enable', '使能够', 'Education enables people to succeed.', '写作'],
  ['encourage', '鼓励', 'Teachers encourage students to try harder.', '高频'],
  ['enforce', '执行，强制', 'Laws are enforced by police.', '写作'],
  ['enhance', '提高，加强', 'Exercise enhances well-being.', '写作'],
  ['enormous', '巨大的，庞大的', 'The task required enormous effort.', '写作'],
  ['ensure', '确保', 'Please ensure doors are closed.', '写作'],
  ['establish', '建立，确立', 'They established a new university.', '学术'],
  ['estimate', '估计', 'Scientists estimate the costs.', '学术'],
  ['evaluate', '评价，评估', 'Teachers evaluate essays carefully.', '写作'],
  ['event', '事件', 'The event drew hundreds of people.', '高频'],
  ['evident', '明显的', 'The effects were immediately evident.', '写作'],
  ['evolve', '演变，发展', 'Languages evolve over time.', '学术'],
  ['exceed', '超过，超出', 'Demand exceeds supply.', '学术'],
  ['exclude', '排除', 'We exclude irrelevant data.', '学术'],
  ['expand', '扩展，膨胀', 'Cities expand into rural areas.', '高频'],
  ['expect', '期望', 'Students expect good results.', '高频'],
  ['experience', '经验，经历', 'Travel is a valuable experience.', '口语'],
  ['experiment', '实验', 'Scientists perform experiments in labs.', '学术'],
  ['explore', '探索，探讨', 'We explored different ideas.', '写作'],
  ['expression', '表达，表情', 'Her expression showed surprise.', '口语'],
  ['extend', '延伸，延长', 'We extended our study for two months.', '写作'],
  ['external', '外部的', 'External factors influence results.', '学术'],
  ['factor', '因素', 'Age is one important factor.', '学术'],
  ['feature', '特征，特色', 'The website has useful features.', '高频'],
  ['figure', '数字，人物', 'The figures show clear trends.', '高频'],
  ['final', '最后的，最终的', 'The final exam is next week.', '高频'],
  ['finance', '财务，金融', 'He works in international finance.', '高频'],
  ['flexible', '灵活的', 'Online learning is more flexible.', '写作'],
  ['focus', '集中，焦点', 'We need to focus on key issues.', '写作'],
  ['follow', '跟随，遵循', 'Please follow the instructions.', '高频'],
  ['format', '格式', 'The essay must follow this format.', '写作'],
  ['former', '前者，以前的', 'The former option seems better.', '写作'],
  ['foundation', '基础，基金会', 'Education is the foundation of society.', '写作'],
  ['function', '功能，作用', 'Each tool has a specific function.', '学术'],
  ['fundamental', '基本的，根本的', 'This is a fundamental principle.', '写作'],
  ['generate', '产生，生成', 'Solar power generates electricity.', '学术'],
  ['genuine', '真正的，真诚的', 'She showed genuine concern.', '写作'],
  ['global', '全球的', 'Climate change is a global issue.', '高频'],
  ['government', '政府', 'Governments fund public education.', '高频'],
  ['guarantee', '保证', 'The company guarantees satisfaction.', '写作'],
  ['hypothesis', '假设', 'Scientists test hypotheses.', '学术'],
  ['identify', '识别，确认', 'Researchers identify key patterns.', '学术'],
  ['illustrate', '说明，举例', 'Examples illustrate the point.', '写作'],
  ['image', '图像，形象', 'Images help students remember.', '高频'],
  ['immediate', '立即的', 'The situation requires immediate action.', '写作'],
  ['impact', '影响，冲击', 'Technology has a strong impact.', '高频'],
  ['implement', '实施，执行', 'Schools implement new policies.', '学术'],
  ['imply', '暗示，意味着', 'The results imply further study.', '学术'],
  ['impose', '强加，征收', 'Laws impose limits on behavior.', '写作'],
  ['improve', '改进，提高', 'Daily practice improves your English.', '高频'],
  ['include', '包括', 'The course includes speaking practice.', '高频'],
  ['indicate', '表明，指示', 'Studies indicate health benefits.', '写作'],
  ['individual', '个人的', 'Each individual has different needs.', '写作'],
  ['industry', '工业，行业', 'The industry creates many jobs.', '高频'],
  ['influence', '影响', 'Teachers influence their students.', '高频'],
  ['inform', '通知，告知', 'Please inform me of changes.', '高频'],
  ['inherent', '固有的，内在的', 'There are inherent risks.', '学术'],
  ['innovation', '创新', 'Innovation drives economic growth.', '写作'],
  ['insight', '洞察，见解', 'She gained insight into the topic.', '写作'],
  ['instance', '实例，情况', 'There are many instances of this.', '写作'],
  ['institution', '机构，制度', 'Educational institutions need support.', '学术'],
  ['integrate', '整合，融合', 'Schools integrate technology into lessons.', '学术'],
  ['intense', '强烈的', 'Students face intense pressure.', '写作'],
  ['interpret', '解释，口译', 'She can interpret Chinese to English.', '学术'],
  ['introduce', '介绍，引入', 'The school introduced new courses.', '高频'],
  ['investigate', '调查，研究', 'Police investigate crime scenes.', '学术'],
  ['involve', '涉及，包含', 'The project involves many people.', '高频'],
  ['issue', '问题，发行', 'Pollution is a serious issue.', '高频'],
  ['justify', '证明...正当', 'Can you justify your argument?', '写作'],
  ['knowledge', '知识', 'Knowledge is gained through study.', '高频'],
  ['labor', '劳动，劳动力', 'Workers contribute their labor.', '学术'],
  ['legal', '合法的，法律的', 'The legal system needs reform.', '写作'],
  ['legitimate', '合法的，正当的', 'He claimed legitimate rights.', '学术'],
  ['level', '水平，级别', 'There are four IELTS levels.', '高频'],
  ['liberal', '自由的，开明的', 'They hold liberal views.', '写作'],
  ['limit', '限制，限度', 'Time limits apply to the test.', '高频'],
  ['local', '当地的', 'Local businesses support schools.', '高频'],
  ['logic', '逻辑', 'His argument follows clear logic.', '写作'],
  ['maintain', '维持，保持', 'We must maintain good health.', '高频'],
  ['majority', '多数', 'The majority voted yes.', '写作'],
  ['manage', '管理，设法', 'She manages her time well.', '高频'],
  ['manifest', '显示，明显的', 'Concern manifested in her face.', '学术'],
  ['margin', '边缘，利润', 'Write notes in the margin.', '阅读'],
  ['massive', '巨大的，大规模的', 'There was massive construction.', '写作'],
  ['maximum', '最大值', 'The maximum score is 9.', '高频'],
  ['measure', '测量，措施', 'We measure learning outcomes.', '高频'],
  ['media', '媒体', 'The media reports on current events.', '高频'],
  ['medium', '媒介，中等', 'Air is a medium for sound.', '学术'],
  ['mental', '精神的，智力的', 'Students need mental rest too.', '写作'],
  ['method', '方法', 'His teaching method works well.', '高频'],
  ['military', '军事的', 'The military has strict rules.', '高频'],
  ['minimum', '最小值', 'The minimum age is 18.', '高频'],
  ['mobile', '移动的，流动的', 'Mobile devices are common now.', '高频'],
  ['mode', '方式，模式', 'Switch to silent mode in class.', '学术'],
  ['model', '模型，榜样', 'She is a role model for students.', '高频'],
  ['modify', '修改，修饰', 'Teachers modify lessons for students.', '学术'],
  ['monitor', '监控，班长', 'Parents monitor their children online.', '学术'],
  ['motivate', '激励', 'Good teachers motivate students.', '写作'],
  ['multiple', '多种的，多倍的', 'There are multiple answer choices.', '阅读'],
  ['nation', '国家，民族', 'The nation celebrates its history.', '高频'],
  ['native', '本地的，天生的', 'She is a native English speaker.', '口语'],
  ['natural', '自然的', 'It is natural to feel nervous before exams.', '高频'],
  ['negative', '消极的，负面的', 'Avoid negative thinking about tests.', '写作'],
  ['network', '网络', 'Computers connect through a network.', '高频'],
  ['normal', '正常的', 'It is normal to make mistakes.', '高频'],
  ['notion', '概念，观念', 'The notion of success varies.', '写作'],
  ['objective', '目标，客观的', 'Our objective is clear.', '写作'],
  ['observe', '观察', 'Scientists observe natural phenomena.', '学术'],
  ['obtain', '获得', 'She obtained her degree last year.', '高频'],
  ['obvious', '明显的', 'The answer seems obvious now.', '写作'],
  ['official', '官方的，官员', 'Official documents require signatures.', '高频'],
  ['operate', '操作，运转', 'Machines operate automatically.', '学术'],
  ['opportunity', '机会', 'Education provides opportunity.', '高频'],
  ['option', '选择', 'You have two options: write or speak.', '阅读'],
  ['organize', '组织', 'Teachers organize study groups.', '高频'],
  ['output', '输出，产量', 'The output has increased.', '学术'],
  ['overall', '总体的，全面的', 'The overall result was positive.', '写作'],
  ['participate', '参与', 'Students participate in discussions.', '口语'],
  ['particular', '特殊的，特别的', 'Pay attention to particular words.', '阅读'],
  ['perceive', '感知，察觉', 'People perceive beauty differently.', '学术'],
  ['perform', '执行，表演', 'She performs well under pressure.', '口语'],
  ['period', '时期，周期', 'The study period is 12 weeks.', '高频'],
  ['permit', '允许，许可证', 'No permits are required today.', '高频'],
  ['persistent', '坚持的，持续的', 'Persistent practice improves speaking.', '写作'],
  ['phenomenon', '现象', 'Aurora is a natural phenomenon.', '学术'],
  ['philosophy', '哲学', 'Eastern philosophy influences many.', '写作'],
  ['physical', '身体的，物理的', 'Physical health matters for study.', '高频'],
  ['policy', '政策', 'The policy helps many students.', '高频'],
  ['political', '政治的', 'Political issues affect education.', '写作'],
  ['positive', '积极的，正面的', 'Positive thinking helps learning.', '写作'],
  ['potential', '潜力，潜在的', 'Every student has potential.', '写作'],
  ['power', '权力，电力', 'Solar power is cleaner.', '高频'],
  ['practice', '实践，练习', 'Practice makes your English fluent.', '口语'],
  ['precise', '精确的', 'Academic writing must be precise.', '写作'],
  ['predict', '预测', 'Economists predict future growth.', '学术'],
  ['prefer', '更喜欢', 'Many prefer listening to reading.', '口语'],
  ['prepare', '准备', 'Prepare well before the exam.', '高频'],
  ['present', '呈现，现在的', 'She presents her ideas clearly.', '写作'],
  ['preserve', '保护，保存', 'We must preserve natural resources.', '写作'],
  ['primary', '主要的，初级的', 'The primary reason is cost.', '写作'],
  ['principle', '原则，原理', 'Basic principles guide researchers.', '学术'],
  ['priority', '优先', 'Study is our priority now.', '写作'],
  ['procedure', '程序，步骤', 'Follow the standard procedure.', '学术'],
  ['process', '过程，处理', 'The learning process takes time.', '高频'],
  ['produce', '生产，产生', 'Study produces good results.', '高频'],
  ['professional', '专业的', 'She is a professional teacher.', '高频'],
  ['profit', '利润，收益', 'Non-profits do not seek profit.', '学术'],
  ['progress', '进步，进展', 'Your English progress is visible.', '高频'],
  ['project', '项目，投射', 'Students work on group projects.', '高频'],
  ['promote', '促进，提升', 'Teachers promote healthy habits.', '写作'],
  ['proper', '适当的，恰当的', 'Use proper grammar in writing.', '写作'],
  ['property', '财产，特性', 'Water has unique properties.', '学术'],
  ['propose', '提议，建议', 'They proposed a new plan.', '写作'],
  ['prospect', '前景，展望', 'Job prospects are improving.', '写作'],
  ['provide', '提供', 'Schools provide books and materials.', '高频'],
  ['public', '公共的，公开的', 'Public libraries serve everyone.', '高频'],
  ['purpose', '目的，用途', 'The purpose is to practice English.', '写作'],
  ['qualify', '有资格，取得资格', 'She qualified for university.', '写作'],
  ['quality', '质量，品质', 'Quality of education is important.', '高频'],
  ['question', '问题，质疑', 'You may ask questions during class.', '高频'],
  ['rapid', '快速的', 'There was rapid economic growth.', '写作'],
  ['ratio', '比率', 'The student-teacher ratio is good.', '学术'],
  ['reason', '原因，推理', 'There are many reasons to study.', '高频'],
  ['receive', '收到，接收', 'She received a scholarship.', '高频'],
  ['recent', '最近的', 'Recent studies show interesting data.', '学术'],
  ['recognize', '认出，承认', 'I recognize her from the photo.', '高频'],
  ['recommend', '推荐', 'Teachers recommend this book.', '写作'],
  ['recover', '恢复，痊愈', 'He recovered from the flu quickly.', '高频'],
  ['reduce', '减少', 'We should reduce plastic waste.', '写作'],
  ['refer', '参考，涉及', 'Please refer to page five.', '写作'],
  ['reflect', '反映，反思', 'The results reflect hard work.', '写作'],
  ['regard', '认为，看待', 'She is regarded as a good teacher.', '写作'],
  ['region', '地区', 'The region has many universities.', '高频'],
  ['regulate', '调节，规范', 'Governments regulate industries.', '写作'],
  ['relate', '关联，涉及', 'This relates to our earlier topic.', '高频'],
  ['relax', '放松', 'Take breaks to relax your mind.', '口语'],
  ['release', '释放，发布', 'The report was released today.', '学术'],
  ['remain', '保持，剩余', 'Many questions remain unanswered.', '高频'],
  ['remarkable', '卓越的，显著的', 'Her progress is remarkable.', '写作'],
  ['remember', '记住', 'Remember to review new words daily.', '高频'],
  ['remove', '移除，删除', 'Please remove irrelevant details.', '写作'],
  ['renew', '更新，续期', 'They renewed their library cards.', '高频'],
  ['require', '要求', 'The course requires weekly essays.', '高频'],
  ['research', '研究', 'He does research in medicine.', '学术'],
  ['resource', '资源', 'We should use resources wisely.', '高频'],
  ['respond', '回应', 'Please respond to the email quickly.', '高频'],
  ['result', '结果', 'The result was better than expected.', '高频'],
  ['retain', '保留，记住', 'Students retain more through practice.', '学术'],
  ['return', '返回，归还', 'Return the books to the library.', '高频'],
  ['reveal', '揭示，显示', 'The data reveals new patterns.', '学术'],
  ['review', '复习，评论', 'Review your notes before tests.', '高频'],
  ['revolution', '革命，重大变革', 'Technology caused a revolution.', '写作'],
  ['role', '角色，作用', 'Education plays a vital role.', '高频'],
  ['route', '路线，路径', 'What is the fastest route to campus?', '高频'],
  ['rule', '规则，统治', 'Follow the test rules carefully.', '高频'],
  ['safe', '安全的', 'Feel safe to practice speaking.', '高频'],
  ['sample', '样本，样品', 'Read the sample essay first.', '写作'],
  ['satisfy', '满足，使满意', 'Good grades satisfy parents.', '高频'],
  ['scale', '规模，比例', 'Economies grow in scale.', '学术'],
  ['scene', '场景，情景', 'The scene shows a busy market.', '听力'],
  ['schedule', '时间表，安排', 'My schedule is very busy.', '高频'],
  ['scheme', '方案，计划', 'They proposed a new scheme.', '学术'],
  ['science', '科学', 'Science helps us understand nature.', '高频'],
  ['section', '部分，章节', 'Section two is about grammar.', '阅读'],
  ['seek', '寻求', 'Students seek knowledge.', '写作'],
  ['select', '选择', 'Select the best answer from choices.', '阅读'],
  ['sense', '感觉，意义', 'It makes sense to study daily.', '高频'],
  ['separate', '分开的，分开', 'Keep reading and writing separate.', '学术'],
  ['series', '系列，连续', 'There will be a series of lectures.', '高频'],
  ['serious', '严肃的，认真的', 'Take your study seriously.', '高频'],
  ['serve', '服务，担任', 'Libraries serve students well.', '高频'],
  ['shift', '转变，移动', 'There was a shift in policy.', '写作'],
  ['significant', '重要的，显著的', 'The progress is significant.', '写作'],
  ['similar', '相似的', 'The two passages are similar.', '阅读'],
  ['simple', '简单的', 'Use simple words when speaking.', '口语'],
  ['site', '地点，网站', 'Visit the school website for info.', '高频'],
  ['situation', '情况，形势', 'The situation requires careful handling.', '高频'],
  ['size', '大小，尺寸', 'Class size affects learning.', '高频'],
  ['skill', '技能，技巧', 'Writing skills develop over time.', '高频'],
  ['society', '社会', 'Society values educated people.', '写作'],
  ['solution', '解决方案', 'We found a solution to the problem.', '写作'],
  ['solve', '解决', 'Practice helps solve language problems.', '高频'],
  ['sort', '种类，分类', 'Sort words by category.', '高频'],
  ['source', '来源', 'Always cite your sources.', '写作'],
  ['specific', '具体的', 'Give specific examples in essays.', '写作'],
  ['specify', '具体说明', 'Please specify which chapter.', '学术'],
  ['spectrum', '光谱，范围', 'There is a spectrum of opinions.', '学术'],
  ['stage', '阶段，舞台', 'IELTS has four stages.', '高频'],
  ['standard', '标准的', 'Write in standard English.', '写作'],
  ['start', '开始', 'Start your preparation early.', '高频'],
  ['state', '状态，陈述', 'State your opinion clearly.', '写作'],
  ['statement', '声明，陈述', 'Read each statement carefully.', '阅读'],
  ['status', '状态，地位', 'Marital status is not important.', '高频'],
  ['step', '步骤，脚步', 'Follow each step in the process.', '高频'],
  ['strategy', '策略', 'Develop a study strategy.', '写作'],
  ['structure', '结构', 'A good essay has clear structure.', '写作'],
  ['style', '风格，样式', 'Academic writing has its own style.', '写作'],
  ['subject', '主题，学科', 'She studies three subjects.', '高频'],
  ['succeed', '成功', 'With practice, you will succeed.', '口语'],
  ['success', '成功', 'Hard work leads to success.', '高频'],
  ['sufficient', '足够的', 'Two hours is sufficient for the task.', '写作'],
  ['suggest', '建议，表明', 'I suggest you read the passage again.', '高频'],
  ['summary', '摘要，总结', 'Write a summary of the article.', '写作'],
  ['supply', '供应', 'The library supplies many books.', '高频'],
  ['support', '支持', 'Family support helps students.', '高频'],
  ['suppose', '假设，认为', 'Suppose the answer is option B.', '阅读'],
  ['surface', '表面', 'The surface of the page is smooth.', '学术'],
  ['survey', '调查', 'The survey covered 200 students.', '学术'],
  ['system', '系统', 'The education system needs reform.', '高频'],
  ['target', '目标', 'Our target is band seven.', '写作'],
  ['task', '任务', 'Complete the writing task in 40 minutes.', '写作'],
  ['tendency', '倾向，趋势', 'There is a tendency to use simpler words.', '写作'],
  ['term', '术语，学期', 'Academic terms need explanation.', '学术'],
  ['theory', '理论', 'Economic theories help understand the world.', '学术'],
  ['therefore', '因此', 'Practice is important; therefore, practice daily.', '写作'],
  ['traditional', '传统的', 'Traditional methods still work well.', '写作'],
  ['transfer', '转移，调动', 'Knowledge transfers across subjects.', '学术'],
  ['travel', '旅行', 'Traveling helps you learn English.', '口语'],
  ['treat', '对待，治疗', 'Teachers treat students fairly.', '高频'],
  ['treatment', '治疗，处理', 'Water treatment protects health.', '学术'],
  ['trend', '趋势', 'The trend is toward online learning.', '写作'],
  ['typical', '典型的', 'This is a typical IELTS question.', '阅读'],
  ['unique', '独特的', 'Every student has a unique style.', '写作'],
  ['universal', '普遍的，通用的', 'English is a universal language.', '写作'],
  ['vary', '变化，不同', 'Opinions vary on this issue.', '写作'],
  ['version', '版本', 'There is an online version of the test.', '高频'],
  ['virtual', '虚拟的', 'Virtual learning is becoming popular.', '写作'],
  ['vital', '至关重要的', 'Reading is vital for vocabulary.', '写作'],
  ['volume', '音量，体积', 'Speak at a comfortable volume.', '口语'],
  ['welfare', '福利', 'Social welfare programs help families.', '写作'],
  ['whereas', '然而，鉴于', 'I like reading whereas he likes speaking.', '写作'],
  ['widespread', '广泛的', 'There is widespread support for reform.', '写作'],
  ['yield', '产生，屈服', 'The study yields important results.', '学术']
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
  { module: 'reading', type: 'choice', prompt: 'The word "predominantly" is closest in meaning to:', options: JSON.stringify(['never', 'mostly', 'rarely', 'partially']), answer: '1', explanation: 'predominantly 意为主要地', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'According to the passage, renewable energy:', options: JSON.stringify(['is too expensive', 'is growing rapidly', 'will be banned', 'cannot replace fossil fuels']), answer: '1', explanation: '可再生能源正在快速发展', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'The main idea of paragraph 3 is that:', options: JSON.stringify(['education is costly', 'online learning has benefits', 'students dislike tests', 'teachers need training']), answer: '1', explanation: '第三段主要讲述在线学习的好处', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'The author implies that:', options: JSON.stringify(['everyone should study abroad', 'practice leads to improvement', 'reading is not important', 'grammar is useless']), answer: '1', explanation: '作者暗示练习带来进步', difficulty: 3 },
  { module: 'reading', type: 'choice', prompt: 'The word "inevitable" means:', options: JSON.stringify(['avoidable', 'certain', 'surprising', 'expensive']), answer: '1', explanation: 'inevitable 意为不可避免的、必然的', difficulty: 3 },
  { module: 'reading', type: 'choice', prompt: 'Which of the following best describes urbanization?', options: JSON.stringify(['People moving from cities to countryside', 'People moving from countryside to cities', 'People stopping work', 'People returning to farms']), answer: '1', explanation: '城市化是人口从农村迁移到城市', difficulty: 1 },
  { module: 'reading', type: 'choice', prompt: 'The passage suggests that globalization:', options: JSON.stringify(['has only negative effects', 'has both positive and negative effects', 'is a new idea', 'will end soon']), answer: '1', explanation: '全球化既有积极影响也有消极影响', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'The word "corresponds" means:', options: JSON.stringify(['disagrees', 'matches', 'opposes', 'changes']), answer: '1', explanation: 'corresponds 意为对应、相符', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'What is the author\'s view on recycling?', options: JSON.stringify(['It is a waste of time', 'It helps protect the environment', 'It is too expensive', 'It should be banned']), answer: '1', explanation: '作者认为回收有助于保护环境', difficulty: 2 },
  { module: 'reading', type: 'choice', prompt: 'The word "significant" could be replaced by:', options: JSON.stringify(['tiny', 'important', 'boring', 'recent']), answer: '1', explanation: 'significant 意为重要的、显著的', difficulty: 1 },
  { module: 'listening', type: 'choice', prompt: 'What time does the library close on weekends?', options: JSON.stringify(['At 5 pm', 'At 6 pm', 'At 7 pm', 'At 8 pm']), answer: '2', explanation: '图书馆周末七点关门', difficulty: 1 },
  { module: 'listening', type: 'choice', prompt: 'Where will the students meet tomorrow?', options: JSON.stringify(['At the main entrance', 'In the classroom', 'At the cafeteria', 'In the library']), answer: '0', explanation: '约定在主入口处见面', difficulty: 1 },
  { module: 'listening', type: 'choice', prompt: 'Why is the student talking to the professor?', options: JSON.stringify(['To complain about grades', 'To discuss the assignment', 'To ask about lunch', 'To borrow a book']), answer: '1', explanation: '学生是来讨论作业的', difficulty: 2 },
  { module: 'listening', type: 'choice', prompt: 'How much does the ticket cost?', options: JSON.stringify(['10 dollars', '15 dollars', '20 dollars', '25 dollars']), answer: '1', explanation: '票价是15美元', difficulty: 1 },
  { module: 'listening', type: 'choice', prompt: 'What is the woman\'s opinion of the course?', options: JSON.stringify(['She finds it too easy', 'She finds it interesting but difficult', 'She hates it', 'She thinks it is useless']), answer: '1', explanation: '她觉得课程有趣但很难', difficulty: 2 },
  { module: 'listening', type: 'choice', prompt: 'When does the conversation take place?', options: JSON.stringify(['On Monday morning', 'On Friday afternoon', 'On Sunday evening', 'On Wednesday night']), answer: '1', explanation: '对话发生在周五下午', difficulty: 2 },
  { module: 'listening', type: 'choice', prompt: 'What subject are they discussing?', options: JSON.stringify(['Mathematics', 'History', 'English Literature', 'Chemistry']), answer: '2', explanation: '他们讨论的是英国文学', difficulty: 1 },
  { module: 'listening', type: 'choice', prompt: 'Why is the man late?', options: JSON.stringify(['He forgot the time', 'His bus was late', 'He overslept', 'He got lost']), answer: '1', explanation: '他乘坐的公交车晚点了', difficulty: 2 },
  { module: 'listening', type: 'choice', prompt: 'What does the woman suggest?', options: JSON.stringify(['Giving up on the project', 'Working together on the project', 'Ignoring the deadline', 'Asking for an extension']), answer: '3', explanation: '她建议申请延期', difficulty: 2 },
  { module: 'listening', type: 'choice', prompt: 'Where does this conversation occur?', options: JSON.stringify(['In a restaurant', 'In a bookstore', 'At a university', 'At a hospital']), answer: '2', explanation: '对话发生在大学里', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: "The meeting will begin at _______ o'clock.", options: null, answer: 'nine', explanation: '听力原文提到九点钟', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'Students must submit their _______ by Friday.', options: null, answer: 'assignment', explanation: '提交作业', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'The _______ of the research will be published next month.', options: null, answer: 'results', explanation: '研究结果将于下月发表', difficulty: 2 },
  { module: 'listening', type: 'blank', prompt: 'She is _______ in environmental science.', options: null, answer: 'interested', explanation: '对...感兴趣', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'The library is _______ from here.', options: null, answer: 'far', explanation: '图书馆离这儿很远', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'Please bring your student _______ to the exam.', options: null, answer: 'card', explanation: '考试请携带学生卡', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'The lecture starts at half past _______.', options: null, answer: 'ten', explanation: '讲座十点半开始', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'There are _______ students in the class.', options: null, answer: 'thirty', explanation: '班里有三十名学生', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'She will arrive on _______ morning.', options: null, answer: 'Monday', explanation: '她周一早上到达', difficulty: 1 },
  { module: 'listening', type: 'blank', prompt: 'The book costs _______ pounds.', options: null, answer: 'fifteen', explanation: '这本书十五英镑', difficulty: 1 }
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
  { topic: 'What is the best way to learn a second language?', part: 'part3', prompts: JSON.stringify(['Is immersion the best method?', 'How important is grammar?', 'Should learning be fun?']), sample_answer: 'The best way is immersion in my opinion. When you live in the country and speak the language daily, you learn much faster. Grammar is important but communication should be the priority.' },
  { topic: 'Do you like traveling?', part: 'part1', prompts: JSON.stringify(['Where have you been?', 'Where would you like to go?', 'What do you enjoy most about traveling?']), sample_answer: 'Yes, I love traveling. I have visited several Asian countries. I would like to visit Europe next. What I enjoy most is experiencing different cultures and trying local food.' },
  { topic: 'Describe a memorable event from your childhood', part: 'part2', prompts: JSON.stringify(['What was the event?', 'When did it happen?', 'Who was there?', 'Why is it memorable?']), sample_answer: 'One memorable event was my tenth birthday party. It happened at our home. All my friends and family came. We played games, ate cake, and had a wonderful time. It was special because everyone I loved was there.' },
  { topic: 'Is technology making people less social?', part: 'part3', prompts: JSON.stringify(['What are the positive effects?', 'What are the negative effects?', 'Should people limit screen time?']), sample_answer: 'Technology has both positive and negative effects. While it helps us stay connected, it can also reduce face-to-face interaction. I think people should balance screen time with real-world socializing.' },
  { topic: 'Describe your favorite food', part: 'part2', prompts: JSON.stringify(['What is it?', 'How is it made?', 'How often do you eat it?', 'Why do you like it?']), sample_answer: 'My favorite food is noodles. They are made from flour and water. I eat noodles about twice a week. I like them because they are delicious, simple to prepare, and remind me of home.' },
  { topic: 'What do you do in your free time?', part: 'part1', prompts: JSON.stringify(['What are your hobbies?', 'How often do you practice them?', 'Why do you enjoy them?']), sample_answer: 'In my free time, I enjoy reading, playing sports, and listening to music. I read every evening and play basketball twice a week. These activities help me relax and stay healthy.' },
  { topic: 'Describe a person you admire', part: 'part2', prompts: JSON.stringify(['Who is this person?', 'What do they do?', 'What qualities do they have?', 'Why do you admire them?']), sample_answer: 'I admire my high school teacher. She teaches English literature. She is patient, intelligent, and very encouraging. I admire her because she made learning enjoyable and inspired me to pursue higher education.' },
  { topic: 'How do you think education will change in the future?', part: 'part3', prompts: JSON.stringify(['Will online learning replace classrooms?', 'What skills will be most important?', 'How will teachers\' roles change?']), sample_answer: 'Education will likely become more digital and personalized. Online learning will grow but probably not replace classrooms entirely. Critical thinking and digital skills will become more important. Teachers will shift from lecturing to guiding students.' },
  { topic: 'What is your favorite season?', part: 'part1', prompts: JSON.stringify(['What is the weather like?', 'What activities do you do?', 'Why do you prefer it?']), sample_answer: 'My favorite season is spring. The weather is mild and flowers bloom everywhere. I enjoy walking in parks and having picnics. I prefer it because it feels like a new beginning.' },
  { topic: 'Describe an important decision you made', part: 'part2', prompts: JSON.stringify(['What was the decision?', 'Why was it important?', 'How did you make it?', 'What was the result?']), sample_answer: 'An important decision was choosing my university major. It was important because it would shape my career. I researched different fields, talked to advisors, and followed my interest in science. The result was that I chose environmental science and I am very happy with my choice.' },
  { topic: 'How has the internet changed the way people communicate?', part: 'part3', prompts: JSON.stringify(['What are the advantages?', 'What are the disadvantages?', 'Has communication improved?']), sample_answer: 'The internet has made communication instant and global. We can now video chat with anyone in the world. However, it has also reduced face-to-face interaction. Overall, communication has improved in terms of speed and reach, but the quality of interactions may have decreased.' }
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
  { type: '小作文', prompt: 'The two maps below show an island, before and after the construction of some tourist facilities. Summarize the information by selecting and reporting the main features.', sample_outline: JSON.stringify({ introduction: '描述岛屿在旅游设施建设前后的变化', paragraph1: '主要变化：新增酒店、餐厅、码头', paragraph2: '细节：道路连接、植被变化', conclusion: '岛屿从原始变为功能完善的旅游目的地' }), sample_essay: 'The two maps illustrate developments that occurred on an island following the construction of tourist facilities...' },
  { type: '大作文', prompt: 'Many people believe that online shopping has brought many advantages, while others think it has caused serious problems. Discuss both views and give your own opinion.', sample_outline: JSON.stringify({ introduction: '在线购物的争议', paragraph1: '优点：便捷、选择多、价格实惠', paragraph2: '缺点：冲动消费、环境影响、实体店关闭', conclusion: '总体优势明显，但需理性消费' }), sample_essay: 'Online shopping has revolutionized the way consumers purchase goods. While it offers undeniable convenience, critics argue that it has created significant problems...' },
  { type: '大作文', prompt: 'Some people believe that universities should focus on academic skills, while others think they should prepare students for their careers. Discuss both views and give your opinion.', sample_outline: JSON.stringify({ introduction: '大学教育目的的辩论', paragraph1: '学术技能：培养批判性思维、知识深度', paragraph2: '职业准备：实用技能、就业竞争力', conclusion: '两者应平衡，不可偏废' }), sample_essay: 'The purpose of university education has long been a subject of debate. While some emphasize academic excellence, others argue that practical career preparation is more important...' },
  { type: '小作文', prompt: 'The graph below shows the number of visitors to three different museums in London from 2000 to 2020. Summarize the information by selecting and reporting the main features.', sample_outline: JSON.stringify({ introduction: '描述三家伦敦博物馆游客数量变化', paragraph1: '整体趋势：博物馆A游客数持续增长', paragraph2: '对比：博物馆B和C波动较大', conclusion: '总体反映城市旅游发展' }), sample_essay: 'The line graph compares the number of visitors to three London museums over a twenty-year period from 2000 to 2020...' },
  { type: '大作文', prompt: 'Some people think that advertising has a positive economic impact, while others believe it has negative social effects. Discuss both views and give your own opinion.', sample_outline: JSON.stringify({ introduction: '广告的双重影响', paragraph1: '经济影响：促进消费、创造就业、支持媒体', paragraph2: '社会影响：过度消费、不实信息、儿童影响', conclusion: '需要监管以平衡利弊' }), sample_essay: 'Advertising has become an integral part of modern life. While it clearly supports economic activity, it also raises important social concerns...' },
  { type: '大作文', prompt: 'In some countries, the number of elderly people is increasing rapidly. What problems does this cause? What solutions can be suggested?', sample_outline: JSON.stringify({ introduction: '人口老龄化问题', paragraph1: '问题：养老金压力、医疗资源紧张、劳动力减少', paragraph2: '解决方案：提高退休年龄、引入移民、鼓励家庭护理', conclusion: '综合策略应对人口变化' }), sample_essay: 'Population aging is one of the most significant demographic challenges facing many countries today. This trend presents both economic and social difficulties...' },
  { type: '小作文', prompt: 'The chart below shows the results of a survey about people\'s coffee and tea buying and drinking habits in five Australian cities. Summarize the information by selecting and reporting the main features.', sample_outline: JSON.stringify({ introduction: '描述澳大利亚五城市咖啡和茶消费习惯调查结果', paragraph1: '主要发现：咖啡在城市消费更普遍', paragraph2: '对比：各城市差异明显', conclusion: '反映生活方式和文化差异' }), sample_essay: 'The bar chart presents survey results comparing coffee and tea consumption patterns across five Australian cities...' },
  { type: '大作文', prompt: 'Some people believe that the best way to reduce crime is to give longer prison sentences. Others, however, think there are better alternative ways to reduce crime. Discuss both views and give your opinion.', sample_outline: JSON.stringify({ introduction: '犯罪惩罚方式的争议', paragraph1: '长期监禁：威慑作用、保护社会', paragraph2: '替代方式：教育、康复、社区服务', conclusion: '应结合惩罚与康复' }), sample_essay: 'Finding effective approaches to reducing crime is a major challenge for governments worldwide. While longer prison sentences remain popular, alternative strategies are gaining support...' },
  { type: '大作文', prompt: 'Some people say that the only reason for learning a foreign language is to travel or work in a foreign country. Others say these are not the only reasons why someone should learn a foreign language. Discuss both views and give your own opinion.', sample_outline: JSON.stringify({ introduction: '学习外语的目的', paragraph1: '实用理由：旅游和工作', paragraph2: '其他理由：文化理解、认知发展、个人成长', conclusion: '学习外语有多方面价值' }), sample_essay: 'While practical considerations like travel and work motivate many language learners, language acquisition offers benefits that extend far beyond these immediate applications...' }
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

// ---------- AI 调用通用工具 ----------
const callAI = (messages, config, modelOverride = null) => {
  return new Promise((resolve, reject) => {
    if (!config || !config.api_key) {
      return resolve({ success: false, content: 'AI 未配置，请先在管理员面板中设置 API Key' });
    }
    const provider = config.provider || 'qwen';

    // 解析 base_url，支持完整URL格式
    let baseUrl = config.base_url || '';
    if (!baseUrl) {
      baseUrl = provider === 'qwen' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1' :
                provider === 'zhipu' ? 'https://open.bigmodel.cn/api/paas/v4' :
                'https://api.openai.com/v1';
    }

    // 从完整URL中提取hostname和path
    let hostname, basePath;
    const urlMatch = baseUrl.match(/^https?:\/\/([^\/]+)(\/.*)?$/);
    if (urlMatch) {
      hostname = urlMatch[1];
      basePath = urlMatch[2] || '';
    } else {
      // 兼容旧格式（不带https://）
      hostname = baseUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      basePath = baseUrl.includes('/') ? baseUrl.replace(/^https?:\/\/[^\/]+/, '') : '';
    }

    // 构建完整API路径
    const apiPath = basePath.endsWith('/chat/completions') ? basePath :
                    basePath + '/chat/completions';

    // 模型名称：支持自定义模型
    const modelName = modelOverride || config.model ||
                      (provider === 'qwen' ? 'qwen-plus' :
                       provider === 'zhipu' ? 'glm-4' : 'gpt-3.5-turbo');

    const postData = JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: 0.7
    });
    const options = {
      hostname: hostname,
      path: apiPath.replace(/\/+/g, '/'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.api_key
      }
    };
    console.log('[AI] Calling:', hostname + apiPath, 'model:', modelName);
    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        console.log('[AI] Response status:', resp.statusCode);
        try {
          const result = JSON.parse(data);
          if (result.choices && result.choices[0] && result.choices[0].message) {
            resolve({ success: true, content: result.choices[0].message.content });
          } else if (result.error) {
            resolve({ success: false, content: 'AI 错误: ' + (result.error.message || JSON.stringify(result.error)) });
          } else {
            resolve({ success: false, content: 'AI 返回格式异常: ' + data.slice(0, 200) });
          }
        } catch (e) {
          resolve({ success: false, content: 'AI 解析错误: ' + e.message + ' | 原始数据: ' + data.slice(0, 200) });
        }
      });
    });
    req.on('error', (e) => { resolve({ success: false, content: '网络错误: ' + e.message }); });
    req.write(postData);
    req.end();
  });
};

// ---------- 管理员 AI 配置 API ----------
app.post('/api/admin/ai-config', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { provider, api_key, base_url, model } = req.body || {};
  if (!api_key) return res.status(400).json({ success: false, message: 'API Key 必填' });
  db.prepare('DELETE FROM ai_configs').run();
  const info = db.prepare('INSERT INTO ai_configs (provider, api_key, base_url, model) VALUES (?, ?, ?, ?)').run(provider || 'qwen', api_key, base_url || null, model || null);
  return res.json({ success: true, id: info.lastInsertRowid });
});

// 管理员测试AI连接
app.post('/api/admin/ai-test', async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const config = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  if (!config) return res.json({ success: false, message: '请先配置AI' });
  const result = await callAI([{ role: 'user', content: '你好，请回复"测试成功"' }], config);
  if (result.success) {
    return res.json({ success: true, message: 'AI连接测试成功', response: result.content });
  }
  return res.json({ success: false, message: result.content });
});

app.get('/api/admin/ai-config', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const config = db.prepare('SELECT id, provider, base_url, created_at FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  if (config) {
    return res.json({ success: true, configured: true, data: config });
  }
  return res.json({ success: true, configured: false, data: null });
});

// ---------- 批量添加 API ----------
app.post('/api/words/batch', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const items = req.body.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: '请提供单词列表' });
  }
  const stmt = db.prepare('INSERT INTO words (word, meaning, example, category) VALUES (?, ?, ?, ?)');
  const tx = db.transaction((arr) => {
    for (const w of arr) {
      if (w && w.word && w.meaning) {
        stmt.run(w.word, w.meaning, w.example || '', w.category || '高频');
      }
    }
  });
  try {
    tx(items);
    return res.json({ success: true, count: items.length });
  } catch (e) {
    return res.status(500).json({ success: false, message: '批量插入失败: ' + e.message });
  }
});

app.post('/api/questions/batch', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const items = req.body.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: '请提供题目列表' });
  }
  const stmt = db.prepare('INSERT INTO questions (module, type, prompt, options, answer, explanation, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const tx = db.transaction((arr) => {
    for (const q of arr) {
      if (q && q.prompt && q.answer !== undefined && q.module && q.type) {
        const opts = Array.isArray(q.options) ? JSON.stringify(q.options) : (q.options || null);
        const ans = typeof q.answer === 'number' ? String(q.answer) : String(q.answer);
        stmt.run(q.module, q.type, q.prompt, opts, ans, q.explanation || '', Number(q.difficulty) || 2);
      }
    }
  });
  try {
    tx(items);
    return res.json({ success: true, count: items.length });
  } catch (e) {
    return res.status(500).json({ success: false, message: '批量插入失败: ' + e.message });
  }
});

app.post('/api/speaking/batch', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const items = req.body.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: '请提供口语话题列表' });
  }
  const stmt = db.prepare('INSERT INTO speaking_topics (topic, part, prompts, sample_answer) VALUES (?, ?, ?, ?)');
  const tx = db.transaction((arr) => {
    for (const s of arr) {
      if (s && s.topic && s.part) {
        const prmts = Array.isArray(s.prompts) ? JSON.stringify(s.prompts) : (s.prompts || null);
        stmt.run(s.topic, s.part, prmts, s.sample_answer || '');
      }
    }
  });
  try {
    tx(items);
    return res.json({ success: true, count: items.length });
  } catch (e) {
    return res.status(500).json({ success: false, message: '批量插入失败: ' + e.message });
  }
});

app.post('/api/writing/batch', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const items = req.body.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: '请提供写作题目列表' });
  }
  const stmt = db.prepare('INSERT INTO writing_topics (type, prompt, sample_outline, sample_essay) VALUES (?, ?, ?, ?)');
  const tx = db.transaction((arr) => {
    for (const w of arr) {
      if (w && w.type && w.prompt) {
        const outline = typeof w.sample_outline === 'object' ? JSON.stringify(w.sample_outline) : (w.sample_outline || null);
        stmt.run(w.type, w.prompt, outline, w.sample_essay || '');
      }
    }
  });
  try {
    tx(items);
    return res.json({ success: true, count: items.length });
  } catch (e) {
    return res.status(500).json({ success: false, message: '批量插入失败: ' + e.message });
  }
});

// ---------- 用户打卡 API ----------
app.get('/api/checkin', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT * FROM daily_checkins WHERE username = ? AND date = ?').get(session.username, today);
  const allRecords = db.prepare('SELECT date FROM daily_checkins WHERE username = ? ORDER BY date DESC').all(session.username);
  const streak = computeStreak(allRecords.map(r => r.date));
  if (existing) {
    return res.json({ success: true, message: '今日已打卡', alreadyChecked: true, streak, totalCheckins: allRecords.length });
  }
  db.prepare('INSERT INTO daily_checkins (username, date) VALUES (?, ?)').run(session.username, today);
  const newStreak = computeStreak([today, ...allRecords.map(r => r.date)]);
  return res.json({ success: true, message: '打卡成功', date: today, totalCheckins: allRecords.length + 1, streak: newStreak });
});

function computeStreak(dates) {
  if (!dates || dates.length === 0) return 0;
  const unique = [...new Set(dates)].sort((a, b) => b.localeCompare(a));
  if (unique.length === 0) return 0;
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = new Date(today);
  const todayStr = cursor.toISOString().slice(0, 10);
  const latestStr = unique[0];
  if (latestStr !== todayStr) {
    cursor.setDate(cursor.getDate() - 1);
    if (unique[0] !== cursor.toISOString().slice(0, 10)) return 0;
  }
  for (let i = 0; i < unique.length; i++) {
    const expected = cursor.toISOString().slice(0, 10);
    if (unique[i] === expected) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

app.get('/api/checkins', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const records = db.prepare('SELECT * FROM daily_checkins WHERE username = ? ORDER BY date DESC LIMIT 30').all(session.username);
  return res.json({ success: true, data: records });
});

// ---------- 学习会话记录 API ----------
app.post('/api/study/sessions', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { module, item_id, duration_seconds, score } = req.body || {};
  if (!module) return res.status(400).json({ success: false, message: '模块必填' });
  const info = db.prepare('INSERT INTO study_sessions (username, module, item_id, duration_seconds, score) VALUES (?, ?, ?, ?, ?)').run(
    session.username, module, item_id ? Number(item_id) : null, Number(duration_seconds) || 0, Number(score) || 0
  );
  return res.json({ success: true, id: info.lastInsertRowid });
});

// ---------- AI 聊天 ----------
app.post('/api/ai/chat', async (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { question } = req.body || {};
  if (!question || !String(question).trim()) {
    return res.status(400).json({ success: false, message: '问题不能为空' });
  }
  const config = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  const systemContent = '你是一位专业的雅思英语学习助手，帮助用户提高英语水平、解答雅思考试相关问题。请用中文和英文结合的方式回答问题，给出实用建议和例句。';
  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: String(question) }
  ];
  const result = await callAI(messages, config);
  if (result.success) {
    db.prepare('INSERT INTO ai_conversations (username, module, prompt, ai_response) VALUES (?, ?, ?, ?)').run(session.username, 'chat', String(question), result.content);
    return res.json({ success: true, data: { answer: result.content } });
  }
  return res.status(500).json({ success: false, message: result.content });
});

// ---------- AI 口语评估 ----------
app.post('/api/ai/speaking/evaluate', async (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { topic, answer } = req.body || {};
  if (!answer || !String(answer).trim()) {
    return res.status(400).json({ success: false, message: '请提供口语回答内容' });
  }
  const config = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  const systemContent = '你是一位资深的雅思口语考官，请根据雅思口语评分标准（流利度与连贯性、词汇多样性、语法多样性与准确性、发音）对学生的回答进行评分和评估。请用中文回答。';
  const userContent = `话题: ${topic || '通用话题'}\n\n学生回答: ${String(answer)}\n\n请按照以下格式反馈：\n1. 评分（0-9分制）及总体评价\n2. 流利度与连贯性分析\n3. 词汇使用建议\n4. 语法问题与改进\n5. 发音注意事项（如果有文本线索）\n6. 改进后的示例回答`;
  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent }
  ];
  const result = await callAI(messages, config);
  if (result.success) {
    db.prepare('INSERT INTO ai_conversations (username, module, prompt, ai_response) VALUES (?, ?, ?, ?)').run(session.username, 'speaking_eval', String(answer), result.content);
    return res.json({ success: true, data: { evaluation: result.content } });
  }
  return res.status(500).json({ success: false, message: result.content });
});

// ---------- AI 写作评估 ----------
app.post('/api/ai/writing/evaluate', async (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { topic, answer } = req.body || {};
  if (!answer || !String(answer).trim()) {
    return res.status(400).json({ success: false, message: '请提供作文内容' });
  }
  const config = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  const systemContent = '你是一位资深的雅思写作考官，请根据雅思写作评分标准（任务完成度、连贯与衔接、词汇多样性、语法多样性与准确性）对学生的作文进行评分和评估。请用中文回答。';
  const userContent = `作文题目: ${topic || '通用题目'}\n\n学生作文: ${String(answer)}\n\n请按照以下格式反馈：\n1. 总体评分（0-9分制）和简要评价\n2. 任务完成度分析\n3. 连贯性与衔接词使用\n4. 词汇使用分析与改进建议\n5. 语法问题与修正示例\n6. 改进建议与高分表达推荐`;
  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent }
  ];
  const result = await callAI(messages, config);
  if (result.success) {
    db.prepare('INSERT INTO ai_conversations (username, module, prompt, ai_response) VALUES (?, ?, ?, ?)').run(session.username, 'writing_eval', String(answer), result.content);
    return res.json({ success: true, data: { evaluation: result.content } });
  }
  return res.status(500).json({ success: false, message: result.content });
});

// ---------- 学习统计总览 ----------
app.get('/api/stats/overview', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const totalWords = db.prepare('SELECT COUNT(*) AS c FROM words').get().c;
  const knownWords = db.prepare('SELECT COUNT(*) AS c FROM user_words WHERE username = ? AND known = 1').get(session.username).c;
  const totalQuestions = db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
  const answered = db.prepare('SELECT COUNT(*) AS c FROM user_progress WHERE username = ? AND module = \'question\'').get(session.username).c;
  const correct = db.prepare('SELECT COUNT(*) AS c FROM user_progress WHERE username = ? AND module = \'question\' AND correct = 1').get(session.username).c;
  const totalTasks = db.prepare('SELECT COUNT(*) AS c FROM task_assignments WHERE username = ?').get(session.username).c;
  const completedTasks = db.prepare('SELECT COUNT(*) AS c FROM task_assignments WHERE username = ? AND status = \'completed\'').get(session.username).c;
  const totalCheckins = db.prepare('SELECT COUNT(*) AS c FROM daily_checkins WHERE username = ?').get(session.username).c;
  const todayStr = new Date().toISOString().slice(0, 10);
  const checkedToday = !!db.prepare('SELECT id FROM daily_checkins WHERE username = ? AND date = ?').get(session.username, todayStr);
  const allDates = db.prepare('SELECT date FROM daily_checkins WHERE username = ?').all(session.username).map(r => r.date);
  const streak = computeStreak(allDates);
  const totalSessions = db.prepare('SELECT COUNT(*) AS c FROM study_sessions WHERE username = ?').get(session.username).c;
  const totalDuration = db.prepare('SELECT COALESCE(SUM(duration_seconds), 0) AS d FROM study_sessions WHERE username = ?').get(session.username).d;
  const totalScore = db.prepare('SELECT COALESCE(SUM(score), 0) AS s FROM study_sessions WHERE username = ?').get(session.username).s;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const wordProgress = totalWords > 0 ? Math.round((knownWords / totalWords) * 100) : 0;
  return res.json({
    success: true,
    data: {
      words: { total: totalWords, known: knownWords, progress: wordProgress },
      questions: { total: totalQuestions, answered, correct, accuracy },
      tasks: { total: totalTasks, completed: completedTasks },
      checkins: { total: totalCheckins, checkedToday, streak },
      sessions: { total: totalSessions, totalSeconds: totalDuration, totalScore },
      ai_configured: !!db.prepare('SELECT COUNT(*) AS c FROM ai_configs').get().c
    }
  });
});

// ---------- 图表数据 ----------
app.get('/api/stats/chart', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { type } = req.query;
  if (type === 'checkin') {
    const rows = db.prepare('SELECT date, COUNT(*) AS count FROM daily_checkins WHERE username = ? GROUP BY date ORDER BY date ASC LIMIT 30').all(session.username);
    return res.json({ success: true, data: rows });
  }
  if (type === 'study') {
    const rows = db.prepare('SELECT module, COUNT(*) AS count, COALESCE(SUM(duration_seconds), 0) AS duration, COALESCE(SUM(score), 0) AS score FROM study_sessions WHERE username = ? GROUP BY module ORDER BY count DESC').all(session.username);
    return res.json({ success: true, data: rows });
  }
  if (type === 'daily') {
    const rows = db.prepare("SELECT strftime('%Y-%m-%d', created_at) AS day, COUNT(*) AS count, COALESCE(SUM(duration_seconds), 0) AS duration, COALESCE(SUM(score), 0) AS score FROM study_sessions WHERE username = ? GROUP BY day ORDER BY day ASC LIMIT 30").all(session.username);
    return res.json({ success: true, data: rows });
  }
  if (type === 'words_categories') {
    const rows = db.prepare('SELECT w.category, COUNT(*) AS total, SUM(CASE WHEN uw.known = 1 THEN 1 ELSE 0 END) AS known FROM words w LEFT JOIN user_words uw ON uw.word_id = w.id AND uw.username = ? GROUP BY w.category').all(session.username);
    return res.json({ success: true, data: rows });
  }
  return res.status(400).json({ success: false, message: '未知图表类型' });
});

// ---------- AI 自动生成内容 API ----------
app.post('/api/ai/generate-words', async (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const cfg = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  if (!cfg || !cfg.api_key) return res.status(400).json({ success: false, message: '请先配置 AI' });
  const { category = '高频', count = 10 } = req.body || {};
  const prompt = `请生成${count}个雅思${category}类单词，严格返回 JSON 数组，不要任何解释文字。格式：[{"word":"...","meaning":"中文释义","example":"英文例句"}]`;
  const result = await callAI(cfg, prompt);
  if (!result.success) return res.status(500).json({ success: false, message: result.content });
  try {
    let arr = JSON.parse(result.content.replace(/```json|```/g, '').trim());
    if (!Array.isArray(arr)) {
      const m = result.content.match(/\[[\s\S]*\]/);
      if (m) arr = JSON.parse(m[0]);
    }
    const stmt = db.prepare('INSERT INTO words (word, meaning, example, category) VALUES (?, ?, ?, ?)');
    const tx = db.transaction((items) => { for (const w of items) if (w.word && w.meaning) stmt.run(w.word, w.meaning, w.example || '', category); });
    tx(arr);
    return res.json({ success: true, count: arr.length, items: arr.slice(0, 5) });
  } catch (e) {
    return res.status(500).json({ success: false, message: '解析失败: ' + e.message + ' | 原始: ' + result.content.slice(0, 200) });
  }
});

app.post('/api/ai/generate-speaking', async (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const cfg = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  if (!cfg || !cfg.api_key) return res.status(400).json({ success: false, message: '请先配置 AI' });
  const { part = 'Part 2', count = 3 } = req.body || {};
  const prompt = `请生成${count}个雅思口语${part}话题卡，严格返回 JSON 数组，不要任何解释。格式：[{"topic":"话题标题","question":"问题描述","hints":"提示要点用换行分隔","reference_answer":"参考答案"}]`;
  const result = await callAI(cfg, prompt);
  if (!result.success) return res.status(500).json({ success: false, message: result.content });
  try {
    let arr = JSON.parse(result.content.replace(/```json|```/g, '').trim());
    if (!Array.isArray(arr)) {
      const m = result.content.match(/\[[\s\S]*\]/);
      if (m) arr = JSON.parse(m[0]);
    }
    const stmt = db.prepare('INSERT INTO speaking_topics (part, topic, question, hints, reference_answer) VALUES (?, ?, ?, ?, ?)');
    const tx = db.transaction((items) => { for (const t of items) if (t.topic) stmt.run(part, t.topic, t.question || '', t.hints || '', t.reference_answer || ''); });
    tx(arr);
    return res.json({ success: true, count: arr.length, items: arr.slice(0, 3) });
  } catch (e) {
    return res.status(500).json({ success: false, message: '解析失败: ' + e.message });
  }
});

app.post('/api/ai/generate-writing', async (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const cfg = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  if (!cfg || !cfg.api_key) return res.status(400).json({ success: false, message: '请先配置 AI' });
  const { type = '大作文', count = 3 } = req.body || {};
  const prompt = `请生成${count}道雅思${type}题目，严格返回 JSON 数组，不要任何解释。大作文格式：[{"title":"题目","question":"完整题目描述","hints":"写作思路用换行分隔"}]`;
  const result = await callAI(cfg, prompt);
  if (!result.success) return res.status(500).json({ success: false, message: result.content });
  try {
    let arr = JSON.parse(result.content.replace(/```json|```/g, '').trim());
    if (!Array.isArray(arr)) {
      const m = result.content.match(/\[[\s\S]*\]/);
      if (m) arr = JSON.parse(m[0]);
    }
    const stmt = db.prepare('INSERT INTO writing_questions (type, title, question, hints) VALUES (?, ?, ?, ?)');
    const tx = db.transaction((items) => { for (const w of items) if (w.question) stmt.run(type, w.title || type + '题目', w.question, w.hints || ''); });
    tx(arr);
    return res.json({ success: true, count: arr.length, items: arr.slice(0, 3) });
  } catch (e) {
    return res.status(500).json({ success: false, message: '解析失败: ' + e.message });
  }
});

app.post('/api/ai/generate-questions', async (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const cfg = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
  if (!cfg || !cfg.api_key) return res.status(400).json({ success: false, message: '请先配置 AI' });
  const { subject = '阅读', count = 5 } = req.body || {};
  const prompt = `请生成${count}道雅思${subject}选择题，严格返回 JSON 数组，不要任何解释。格式：[{"type":"${subject}","question":"题目","options":["A选项","B选项","C选项","D选项"],"answer":"正确答案字母如A","explanation":"解析"}]`;
  const result = await callAI(cfg, prompt);
  if (!result.success) return res.status(500).json({ success: false, message: result.content });
  try {
    let arr = JSON.parse(result.content.replace(/```json|```/g, '').trim());
    if (!Array.isArray(arr)) {
      const m = result.content.match(/\[[\s\S]*\]/);
      if (m) arr = JSON.parse(m[0]);
    }
    const stmt = db.prepare('INSERT INTO questions (type, question, options, answer, explanation) VALUES (?, ?, ?, ?, ?)');
    const tx = db.transaction((items) => { for (const q of items) if (q.question && q.answer) stmt.run(subject, q.question, JSON.stringify(q.options || []), q.answer, q.explanation || ''); });
    tx(arr);
    return res.json({ success: true, count: arr.length, items: arr.slice(0, 3) });
  } catch (e) {
    return res.status(500).json({ success: false, message: '解析失败: ' + e.message });
  }
});

// ---------- 管理员：用户列表与学习数据 ----------
app.get('/api/admin/users', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const users = db.prepare(`
    SELECT u.id, u.username, u.role, u.created_at,
      (SELECT COUNT(*) FROM user_words uw WHERE uw.username = u.username AND uw.known = 1) AS known_words,
      (SELECT COUNT(*) FROM user_progress up WHERE up.username = u.username) AS answered,
      (SELECT COUNT(*) FROM daily_checkins dc WHERE dc.username = u.username) AS checkins,
      (SELECT COUNT(*) FROM study_sessions ss WHERE ss.username = u.username) AS sessions
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  return res.json({ success: true, data: users });
});

app.get('/api/admin/users/:username/detail', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const username = req.params.username;
  const knownWords = db.prepare(`
    SELECT uw.id, uw.word_id, uw.known, uw.reviewed_at, w.word, w.meaning, w.category
    FROM user_words uw LEFT JOIN words w ON w.id = uw.word_id
    WHERE uw.username = ? AND uw.known = 1
    ORDER BY uw.reviewed_at DESC
  `).all(username);
  const progress = db.prepare(`
    SELECT up.id, up.module, up.item_id, up.correct, up.created_at,
      CASE up.module
        WHEN 'question' THEN q.prompt
        WHEN 'speaking' THEN s.topic
        WHEN 'writing' THEN wt.prompt
        ELSE ''
      END AS title
    FROM user_progress up
    LEFT JOIN questions q ON up.module = 'question' AND q.id = up.item_id
    LEFT JOIN speaking_topics s ON up.module = 'speaking' AND s.id = up.item_id
    LEFT JOIN writing_topics wt ON up.module = 'writing' AND wt.id = up.item_id
    WHERE up.username = ?
    ORDER BY up.created_at DESC LIMIT 50
  `).all(username);
  const checkins = db.prepare('SELECT date FROM daily_checkins WHERE username = ? ORDER BY date DESC LIMIT 30').all(username);
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM user_words WHERE username = ? AND known = 1) AS total_known,
      (SELECT COUNT(*) FROM user_progress WHERE username = ?) AS total_progress,
      (SELECT COUNT(*) FROM daily_checkins WHERE username = ?) AS total_checkins
  `).get(username, username, username);
  return res.json({ success: true, data: { knownWords, progress, checkins, stats } });
});

// ---------- 管理员：智能出题 ----------
app.post('/api/admin/quizzes/generate', async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { username, title, mode = 'mixed', wordCount = 10, questionCount = 5 } = req.body || {};
  // username 为空字符串表示「全员可见」
  const isAllUsers = !username || !username.trim();
  if (!isAllUsers) {
    const targetUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!targetUser) return res.status(404).json({ success: false, message: '用户不存在' });
  }
  const actualTitle = title || (isAllUsers ? '全员练习卷 ' + new Date().toLocaleString('zh-CN') : (username + ' 的智能练习卷 ' + new Date().toLocaleString('zh-CN')));

  let wordItems = [];
  let questionItems = [];
  let generatedByAI = false;

  // 模式 1：基于用户已掌握内容，反出相关题目（巩固模式）
  if (mode === 'review' || mode === 'mixed') {
    if (!isAllUsers) {
      const knownIds = db.prepare('SELECT word_id FROM user_words WHERE username = ? AND known = 1 ORDER BY reviewed_at DESC LIMIT ?').all(username, wordCount * 2);
      if (knownIds && knownIds.length > 0) {
        const placeholders = knownIds.map(() => '?').join(',');
        wordItems = db.prepare(`SELECT id, word, meaning, example, category FROM words WHERE id IN (${placeholders}) ORDER BY RANDOM() LIMIT ?`).all(...knownIds.map(k => k.word_id), wordCount);
      }
    }
    questionItems = db.prepare(`SELECT id, module, type, prompt, options, answer, explanation FROM questions WHERE difficulty <= 2 ORDER BY RANDOM() LIMIT ?`).all(questionCount);
  }

  // 模式 2：从用户未掌握的范围出题（查漏补缺模式）
  if (mode === 'weak') {
    const knownSet = [];
    if (!isAllUsers) {
      const knownIds = db.prepare('SELECT word_id FROM user_words WHERE username = ? AND known = 1').all(username);
      for (const k of knownIds) knownSet.push(k.word_id);
    }
    if (knownSet.length === 0) {
      wordItems = db.prepare('SELECT id, word, meaning, example, category FROM words ORDER BY RANDOM() LIMIT ?').all(wordCount);
    } else {
      const ph = knownSet.map(() => '?').join(',');
      wordItems = db.prepare(`SELECT id, word, meaning, example, category FROM words WHERE id NOT IN (${ph}) ORDER BY RANDOM() LIMIT ?`).all(...knownSet, wordCount);
    }
    questionItems = db.prepare('SELECT id, module, type, prompt, options, answer, explanation FROM questions ORDER BY RANDOM() LIMIT ?').all(questionCount);
  }

  // 模式 3：AI 自动出题
  if (mode === 'ai') {
    const cfg = db.prepare('SELECT provider, api_key, base_url, model FROM ai_configs ORDER BY id DESC LIMIT 1').get();
    if (cfg && cfg.api_key) {
      const knownList = isAllUsers ? [] : db.prepare(`SELECT w.word, w.meaning FROM user_words uw JOIN words w ON w.id = uw.word_id WHERE uw.username = ? AND uw.known = 1 ORDER BY uw.reviewed_at DESC LIMIT 15`).all(username);
      const displayName = isAllUsers ? '所有学生' : username;
      const prompt = `为学生"${displayName}"生成一份雅思练习卷。${isAllUsers ? '该练习卷为所有学生通用，请选择中低难度的高频词汇和题目。' : '该学生已掌握的单词包括：' + knownList.slice(0, 10).map(k => k.word).join(', ')}。请严格返回 JSON，不要任何解释文字：{"words": [{"word":"...","meaning":"...","example":"..."}], "questions": [{"type":"choice","prompt":"题目","options":["A","B","C","D"],"answer":"A","explanation":"解析"}]}`;
      const aiResult = await callAI([{ role: 'user', content: prompt }], cfg);
      if (aiResult && aiResult.success) {
        try {
          const parsed = JSON.parse(aiResult.content.replace(/```json|```/g, '').trim());
          if (parsed.words && Array.isArray(parsed.words)) {
            const ws = db.prepare('INSERT INTO words (word, meaning, example, category) VALUES (?, ?, ?, ?)');
            for (const w of parsed.words) {
              if (w.word && w.meaning) ws.run(w.word, w.meaning, w.example || '', 'AI生成');
            }
            const lastId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
            const firstNewId = lastId - parsed.words.length + 1;
            wordItems = parsed.words.map((w, i) => ({ id: firstNewId + i, word: w.word, meaning: w.meaning, example: w.example }));
          }
          if (parsed.questions && Array.isArray(parsed.questions)) {
            const qs = db.prepare('INSERT INTO questions (module, type, prompt, options, answer, explanation, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)');
            for (const q of parsed.questions) {
              if (q.prompt && q.answer) qs.run('reading', q.type || 'choice', q.prompt, JSON.stringify(q.options || []), String(q.answer), q.explanation || '', 2);
            }
            const lastQId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
            const firstQId = lastQId - parsed.questions.length + 1;
            questionItems = parsed.questions.map((q, i) => ({ id: firstQId + i, prompt: q.prompt, options: JSON.stringify(q.options || []), answer: q.answer, explanation: q.explanation }));
          }
          generatedByAI = true;
        } catch (e) {
          // AI 解析失败，fallback 到随机出题
        }
      }
    }
    if (wordItems.length === 0) wordItems = db.prepare('SELECT id, word, meaning, example, category FROM words ORDER BY RANDOM() LIMIT ?').all(wordCount);
    if (questionItems.length === 0) questionItems = db.prepare('SELECT id, module, type, prompt, options, answer, explanation FROM questions ORDER BY RANDOM() LIMIT ?').all(questionCount);
  }

  // 如果默认模式下没有题目，回退到随机
  if (wordItems.length === 0) wordItems = db.prepare('SELECT id, word, meaning, example, category FROM words ORDER BY RANDOM() LIMIT ?').all(wordCount);
  if (questionItems.length === 0) questionItems = db.prepare('SELECT id, module, type, prompt, options, answer, explanation FROM questions ORDER BY RANDOM() LIMIT ?').all(questionCount);

  // 保存卷子
  const config = JSON.stringify({ mode, wordCount, questionCount, generatedByAI });
  const info = db.prepare('INSERT INTO quizzes (creator_id, title, target_username, description, total_words, total_questions, config) VALUES (?, ?, ?, ?, ?, ?, ?)').run(null, actualTitle, username, '', wordItems.length, questionItems.length, config);
  const quizId = info.lastInsertRowid;
  const itemStmt = db.prepare('INSERT INTO quiz_items (quiz_id, item_type, source_id, content) VALUES (?, ?, ?, ?)');
  for (const w of wordItems) itemStmt.run(quizId, 'word', w.id, JSON.stringify({ word: w.word, meaning: w.meaning, example: w.example || '', category: w.category || '' }));
  for (const q of questionItems) itemStmt.run(quizId, 'question', q.id, JSON.stringify({ module: q.module, type: q.type || 'choice', prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation || '' }));

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  const items = db.prepare('SELECT * FROM quiz_items WHERE quiz_id = ? ORDER BY id').all(quizId);
  return res.json({ success: true, quiz, items, generatedByAI });
});

app.get('/api/admin/quizzes', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const quizzes = db.prepare('SELECT * FROM quizzes ORDER BY id DESC LIMIT 50').all();
  const withCounts = quizzes.map(q => {
    const c = db.prepare('SELECT COUNT(*) AS c FROM quiz_items WHERE quiz_id = ?').get(q.id);
    const a = db.prepare('SELECT COUNT(DISTINCT username) AS c FROM quiz_answers WHERE quiz_id = ?').get(q.id);
    return { ...q, total_items: c.c, completed_by: a.c };
  });
  return res.json({ success: true, data: withCounts });
});

app.get('/api/admin/quizzes/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(Number(req.params.id));
  if (!quiz) return res.status(404).json({ success: false, message: '卷子不存在' });
  const items = db.prepare('SELECT * FROM quiz_items WHERE quiz_id = ? ORDER BY id').all(Number(req.params.id));
  return res.json({ success: true, quiz, items });
});

app.delete('/api/admin/quizzes/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  db.prepare('DELETE FROM quiz_items WHERE quiz_id = ?').run(Number(req.params.id));
  db.prepare('DELETE FROM quiz_answers WHERE quiz_id = ?').run(Number(req.params.id));
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(Number(req.params.id));
  return res.json({ success: true });
});

// ---------- 普通用户：查看和完成卷子 ----------
app.get('/api/my-quizzes', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const quizzes = db.prepare(`
    SELECT q.*,
      (SELECT COUNT(*) FROM quiz_items WHERE quiz_id = q.id) AS total_items,
      (SELECT COUNT(*) FROM quiz_answers WHERE quiz_id = q.id AND username = ?) AS my_answers
    FROM quizzes q
    WHERE q.target_username = ? OR q.target_username IS NULL OR q.target_username = ''
    ORDER BY q.id DESC
  `).all(session.username, session.username);
  return res.json({ success: true, data: quizzes });
});

app.get('/api/my-quizzes/:id', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(Number(req.params.id));
  if (!quiz) return res.status(404).json({ success: false, message: '卷子不存在' });
  const items = db.prepare('SELECT * FROM quiz_items WHERE quiz_id = ? ORDER BY id').all(Number(req.params.id));
  return res.json({ success: true, quiz, items });
});

app.post('/api/my-quizzes/:id/submit', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { answers } = req.body || {};
  if (!answers || !Array.isArray(answers)) return res.status(400).json({ success: false, message: '请提供答案' });
  const quizId = Number(req.params.id);
  const items = db.prepare('SELECT * FROM quiz_items WHERE quiz_id = ? ORDER BY id').all(quizId);
  const stmt = db.prepare('INSERT INTO quiz_answers (quiz_id, username, item_id, user_answer, correct) VALUES (?, ?, ?, ?, ?)');
  let score = 0;
  let graded = 0;
  for (const ans of answers) {
    const item = items.find(i => i.id === ans.item_id);
    if (!item) continue;
    let correct = 0;
    if (item.item_type === 'question') {
      try {
        const content = JSON.parse(item.content);
        if (String(content.answer).trim().toLowerCase() === String(ans.answer || '').trim().toLowerCase()) correct = 1;
      } catch (e) { continue; }
      graded++;
    }
    stmt.run(quizId, session.username, item.id, ans.answer || '', correct);
    if (correct) score++;
  }
  return res.json({ success: true, score, total: graded, message: `完成！得分 ${score}/${graded}` });
});

// ---------- 日记/留言板 ----------
// 获取帖子列表（所有用户可见）
app.get('/api/posts', (req, res) => {
  const session = parseSession(req);
  const username = session && session.username ? session.username : null;
  const posts = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
    FROM posts p
    ORDER BY p.id DESC
    LIMIT 100
  `).all();
  const postsWithLikes = posts.map(p => {
    const liked = username ? (db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND username = ?').get(p.id, username) ? 1 : 0) : 0;
    return { ...p, liked: liked };
  });
  return res.json({ success: true, data: postsWithLikes });
});

// 发表帖子
app.post('/api/posts', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const { content, mood } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ success: false, message: '内容不能为空' });
  if (content.length > 1000) return res.status(400).json({ success: false, message: '内容过长（最多 1000 字）' });
  const info = db.prepare('INSERT INTO posts (username, content, mood) VALUES (?, ?, ?)').run(session.username, content.trim().slice(0, 1000), (mood || '').toString().slice(0, 20));
  const post = db.prepare(`
    SELECT p.*,
      0 AS like_count,
      0 AS comment_count,
      0 AS liked
    FROM posts p WHERE p.id = ?
  `).get(info.lastInsertRowid);
  return res.json({ success: true, post });
});

// 获取某帖子的评论
app.get('/api/posts/:id/comments', (req, res) => {
  const comments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC').all(Number(req.params.id));
  return res.json({ success: true, data: comments });
});

// 发表评论
app.post('/api/posts/:id/comments', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const postId = Number(req.params.id);
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ success: false, message: '评论不能为空' });
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ success: false, message: '帖子不存在' });
  db.prepare('INSERT INTO comments (post_id, username, role, content) VALUES (?, ?, ?, ?)').run(postId, session.username, session.role || 'user', content.trim().slice(0, 500));
  const comments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC').all(postId);
  return res.json({ success: true, data: comments, count: comments.length });
});

// 点赞 / 取消点赞
app.post('/api/posts/:id/like', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const postId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM likes WHERE post_id = ? AND username = ?').get(postId, session.username);
  let action;
  if (existing) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
    action = 'unliked';
  } else {
    db.prepare('INSERT INTO likes (post_id, username) VALUES (?, ?)').run(postId, session.username);
    action = 'liked';
  }
  const count = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?').get(postId).c;
  return res.json({ success: true, action, like_count: count, liked: action === 'liked' ? 1 : 0 });
});

// 删除帖子（作者本人或管理员）
app.delete('/api/posts/:id', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const postId = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ success: false, message: '帖子不存在' });
  if (post.username !== session.username && session.role !== 'admin') {
    return res.status(403).json({ success: false, message: '没有权限删除' });
  }
  db.prepare('DELETE FROM likes WHERE post_id = ?').run(postId);
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(postId);
  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  return res.json({ success: true });
});

// 删除评论（作者本人或管理员）
app.delete('/api/comments/:id', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const commentId = Number(req.params.id);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
  if (!comment) return res.status(404).json({ success: false, message: '评论不存在' });
  if (comment.username !== session.username && session.role !== 'admin') {
    return res.status(403).json({ success: false, message: '没有权限删除' });
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  return res.json({ success: true });
});

// ---------- 强制提醒/弹窗 ----------
// 管理员：发送一条强制提醒
app.post('/api/admin/notifications', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const { target_username, title, content, level, sound_enabled } = req.body || {};
  if (!title || !title.toString().trim()) return res.status(400).json({ success: false, message: '标题不能为空' });
  if (!content || !content.toString().trim()) return res.status(400).json({ success: false, message: '内容不能为空' });
  const info = db.prepare('INSERT INTO notifications (target_username, title, content, level, sound_enabled, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(
    (target_username || '').toString(),
    title.toString().trim().slice(0, 100),
    content.toString().trim().slice(0, 500),
    (level || 'normal').toString().slice(0, 20),
    sound_enabled === 0 || sound_enabled === '0' || sound_enabled === false ? 0 : 1,
    session.username || ''
  );
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid);

  // ========== 立即通过 WebSocket 推送给学生 ==========
  const targetUser = (target_username || '').toString();
  if (targetUser && studentConnections.has(targetUser)) {
    const wsPayload = JSON.stringify({
      type: 'notification',
      id: n.id,
      title: n.title,
      content: n.content,
      level: n.level,
      sound_enabled: n.sound_enabled,
      from: session.username
    });
    try {
      const studentWs = studentConnections.get(targetUser);
      if (studentWs && studentWs.readyState === WebSocket.OPEN) {
        studentWs.send(wsPayload);
      }
    } catch (e) {}
  }

  return res.json({ success: true, notification: n });
});

// 管理员：查看所有通知记录
app.get('/api/admin/notifications', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  const list = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 100').all();
  return res.json({ success: true, data: list.map(n => ({
    ...n,
    ack_users: (n.acknowledged || '').split(',').filter(x => x).length
  })) });
});

// 管理员：删除通知
app.delete('/api/admin/notifications/:id', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  db.prepare('DELETE FROM notifications WHERE id = ?').run(Number(req.params.id));
  return res.json({ success: true });
});

// 普通用户：读取自己未确认的强制提醒（只返回自己相关的）
app.get('/api/my-notifications', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const username = session.username;
  const all = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 50').all();
  const pending = all.filter(n => {
    // 目标用户匹配（空=全员）
    const target = (n.target_username || '').trim();
    if (target && target !== username) return false;
    // 已确认则排除
    const ack = (n.acknowledged || '').split(',').filter(x => x);
    return ack.indexOf(username) === -1;
  }).map(n => ({
    id: n.id, title: n.title, content: n.content, level: n.level,
    sound_enabled: n.sound_enabled, created_by: n.created_by, created_at: n.created_at
  }));
  return res.json({ success: true, data: pending });
});

// 普通用户：确认某条提醒
app.post('/api/my-notifications/:id/ack', (req, res) => {
  const session = requireLogin(req, res);
  if (!session) return;
  const id = Number(req.params.id);
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  if (!n) return res.status(404).json({ success: false, message: '通知不存在' });
  // 目标校验
  const target = (n.target_username || '').trim();
  if (target && target !== session.username) return res.status(403).json({ success: false, message: '无权确认此通知' });
  // 追加到 acknowledged
  const existing = (n.acknowledged || '').split(',').filter(x => x);
  if (existing.indexOf(session.username) === -1) existing.push(session.username);
  db.prepare('UPDATE notifications SET acknowledged = ? WHERE id = ?').run(existing.join(','), id);
  return res.json({ success: true });
});

// ---------- 启动服务 ----------
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器已启动，监听 http://0.0.0.0:${PORT}`);
});

// ---------- WebSocket 服务 ----------
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  // 通过 URL 参数或 cookie 简单识别身份
  const url = new URL(req.url, 'http://localhost');
  const role = url.searchParams.get('role') || '';
  const username = url.searchParams.get('u') || '';
  if (!username) { ws.close(); return; }

  if (role === 'admin') {
    adminConnections.add(ws);
    // 立刻把当前在线学生列表推一次
    const snapshot = [];
    for (const [u, info] of liveFrames.entries()) {
      snapshot.push({ username: u, frame: info.frame, ts: info.ts });
    }
    if (snapshot.length > 0) ws.send(JSON.stringify({ type: 'frames', data: snapshot }));
  } else {
    // 学生端：同一个账号只保留一个连接（新顶旧）
    if (studentConnections.has(username)) {
      try { studentConnections.get(username).close(); } catch (e) {}
    }
    studentConnections.set(username, ws);
  }

  ws.on('message', (data) => {
    // 学生端上传帧：{ type: 'frame', frame: 'data:image/jpeg;base64,...' }
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'frame' && username && role !== 'admin') {
        liveFrames.set(username, { frame: msg.frame, ts: Date.now() });
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (role === 'admin') {
      adminConnections.delete(ws);
    } else {
      studentConnections.delete(username);
      liveFrames.delete(username);
      // 通知管理员该学生下线
      const payload = JSON.stringify({ type: 'offline', username });
      for (const a of adminConnections) {
        if (a.readyState === WebSocket.OPEN) a.send(payload);
      }
    }
  });

  ws.on('error', () => {});
});

// ---------- 定期广播：每 500ms 把当前所有在线学生的最新帧推送给所有管理员 ----------
setInterval(() => {
  if (adminConnections.size === 0 || liveFrames.size === 0) return;
  const snapshot = [];
  for (const [u, info] of liveFrames.entries()) {
    snapshot.push({ username: u, frame: info.frame, ts: info.ts });
  }
  if (snapshot.length === 0) return;
  const payload = JSON.stringify({ type: 'frames', data: snapshot });
  for (const a of adminConnections) {
    if (a.readyState === WebSocket.OPEN) {
      try { a.send(payload); } catch (e) {}
    }
  }
}, 250);

// 每 3 秒清理超过 4 秒没收到新帧的学生（视为离线）
setInterval(() => {
  const now = Date.now();
  for (const [u, info] of liveFrames.entries()) {
    if (now - info.ts > 4000) {
      liveFrames.delete(u);
      const payload = JSON.stringify({ type: 'offline', username: u });
      for (const a of adminConnections) {
        if (a.readyState === WebSocket.OPEN) {
          try { a.send(payload); } catch (e) {}
        }
      }
    }
  }
}, 3000);

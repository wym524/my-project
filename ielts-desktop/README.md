# IELTS 学习空间 (IELTS Study Space)

一个面向雅思考生的本地桌面应用。包含词汇学习、听说读写练习、真题训练、AI 对话、打卡、日记、任务系统与管理员功能。所有数据保存在本地 SQLite 数据库，无需联网（AI 对话可选）。

## 功能特色

- 🔐 **用户系统**：注册 / 登录 / 退出；默认管理员账号 `001` / `141242`
- 📚 **词汇学习**：内置高频雅思词汇；支持分类筛选、随机练习、训练模式、例句、读音
- 🎧 **听力练习**：选择题 / 填空题；配套音频文件位于 `179_audios/`
- 👄 **口语练习**：Part 1 / Part 2 / Part 3 话题，支持提示词与参考答案
- ✍️ **写作练习**：Task 1 / Task 2 题目，大纲与范文参考
- 🤖 **AI 对话**：通过本地 AI 配置（API Key / Base URL / Model）接入大模型，随时提问
- 📝 **日记系统**：学习日记 / 心情记录 / 点赞 / 评论
- 🏆 **打卡系统**：每日打卡与连续打卡天数
- 📊 **学习进度**：自动记录各模块练习的正确率与频次
- 📋 **任务系统**：管理员分配任务、设置截止日期、评分反馈
- 🔔 **通知系统**：管理员发布强制弹窗 / 提醒
- 🖥️ **管理员后台**：用户管理 / 题库管理 / 任务下发 / 通知发布

## 目录结构

```
ielts-desktop/
├── electron-main.js      # Electron 主进程（启动后端 + 创建窗口 + 系统托盘）
├── server.js             # Express 后端 + SQLite 数据库（2134 行）
├── package.json          # 项目依赖与 electron-builder 打包配置
├── index.html            # Vue 构建的 SPA 入口
├── assets/               # Vue 编译产物
├── 179_audios/           # 听力音频文件
├── grammar/              # 语法资源与讲义
├── vocabulary/           # 词汇音频与图片
├── screenshot/           # 界面截图
└── README.md             # 本文件
```

## 快速开始

### 前置要求

- **Node.js** ≥ 18.0.0 （推荐 20.x LTS）
- **npm** ≥ 9 或 **pnpm** 兼容
- Windows / macOS / Linux 任一平台

### 1. 安装依赖

```bash
cd ielts-desktop
npm install
```

> `better-sqlite3` 在安装时会自动编译原生模块，请确保系统具备 C/C++ 编译工具链。Windows 上如缺少编译工具，请先安装 `windows-build-tools` 或 Visual Studio Build Tools。

### 2. 以浏览器模式运行（开发调试）

```bash
npm start
```

启动后访问：**http://localhost:3847**

管理员账号：
- 用户名：`001`
- 密码：`141242`

### 3. 以桌面应用运行（Electron）

```bash
npm run electron
```

应用将：
1. 在后台启动 `node server.js` 子进程（端口 3847）
2. 打开一个 1440×900 的 Electron 窗口并加载应用
3. 在系统托盘显示图标，关闭窗口会隐藏到托盘而不退出
4. 按 **F12** 打开 / 关闭开发者工具

### 4. 打包成 Windows 安装包 (NSIS)

```bash
npm run build:win
```

输出文件位于 `dist-installer/`：
- `ielts-study-space-1.0.0-setup.exe` —— 一键安装程序

### 5. 打包 macOS / Linux

```bash
npm run build:mac      # 生成 .dmg
npm run build:linux    # 生成 .AppImage
```

## 数据与数据库

应用首次启动会在用户目录下创建数据库：

| 平台      | 路径                                                      |
| --------- | --------------------------------------------------------- |
| Windows   | `C:\Users\<YourName>\.ielts-study-space\users.db`         |
| macOS     | `/Users/<YourName>/.ielts-study-space/users.db`          |
| Linux     | `/home/<YourName>/.ielts-study-space/users.db`           |

数据库包含以下表：
- `users`（用户 / 角色）
- `words`、`listening_vocabulary`（词库）
- `questions`、`speaking_topics`、`writing_topics`（题库）
- `user_progress`、`user_words`、`study_sessions`（学习记录）
- `daily_checkins`（打卡）
- `ai_configs`、`ai_conversations`（AI 配置与对话）
- `tasks`、`task_assignments`（任务）
- `quizzes`、`quiz_items`、`quiz_answers`（测验）
- `posts`、`comments`、`likes`（日记 / 评论）
- `notifications`（通知）

删除此目录可清空所有数据重新开始。

## 开发提示

- **端口**：3847（若被占用请先停止其它同名服务）
- **AI 对话**：需管理员在后台配置 Provider / API Key / Base URL / Model
- **音频文件**：请将自有音频放入 `179_audios/` 目录，并在前端通过文件名引用
- **修改前端**：本目录下的 `index.html` 与 `assets/` 为 Vue 构建产物，如需重新构建请在源工程中 `npm run build` 后复制到本目录

## 故障排查

### 应用启动白屏 / 加载失败
1. 按 **F12** 打开开发者工具查看 Console 与 Network 报错
2. 尝试 `npm start` 直接在浏览器访问 http://localhost:3847 是否正常
3. 若端口被占用，关闭占用进程后重试

### better-sqlite3 安装失败
```bash
# Windows
npm install --global windows-build-tools

# macOS
xcode-select --install

# 然后重新
npm install better-sqlite3 --build-from-source
```

### electron-builder 打包慢
首次打包会下载对应平台的 Electron 二进制。可设置镜像：
```bash
# Linux / macOS
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# Windows (PowerShell)
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
```

## 许可证

MIT License

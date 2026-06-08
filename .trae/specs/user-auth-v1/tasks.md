# 用户注册登录系统 - 实施计划

## [x] Task 0: 规格文档创建
- **Priority**: P0
- **Depends On**: None
- **Description**: 创建 PRD、任务清单、验证清单
- **Acceptance Criteria Addressed**: 项目启动前置
- **Test Requirements**:
  - `programmatic` TR-0.1: spec.md / tasks.md / checklist.md 三个文件均已创建

## [x] Task 1: 后端 API 框架
- **Priority**: P0
- **Depends On**: Task 0
- **Description**: 
  - 搭建 Node.js + Express 后端
  - 集成 SQLite 数据库（better-sqlite3）
  - 实现注册接口 POST /api/register（用户名+密码）
  - 实现登录接口 POST /api/login（验证并返回 Cookie）
  - 实现登出接口 POST /api/logout
  - 实现用户信息接口 GET /api/me
  - 管理员账号 001/141242 写死在代码中
  - 密码使用 bcrypt 加密
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-5
- **Test Requirements**:
  - `programmatic` TR-1.1: POST /api/register 返回 200，数据库新增用户
  - `programmatic` TR-1.2: POST /api/login 正确凭据返回 200 + Cookie
  - `programmatic` TR-1.3: POST /api/login 错误凭据返回 401
  - `programmatic` TR-1.4: 管理员 001/141242 可成功登录
  - `programmatic` TR-1.5: 数据库中 password 字段为 bcrypt 哈希
  - `programmatic` TR-1.6: GET /api/me 需携带 Cookie 才能返回用户信息

## [x] Task 2: 前端页面
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 登录页 login.html（用户名+密码输入，跳转到注册链接）
  - 注册页 register.html
  - 普通用户主页 dashboard.html
  - 管理员主页 admin.html（显示管理员标识）
  - 统一的样式和中文文案
  - 退出登录按钮
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-6, AC-7
- **Test Requirements**:
  - `programmatic` TR-2.1: 未登录访问 / 自动跳转到 /login.html
  - `programmatic` TR-2.2: 登录成功后跳转到 dashboard 或 admin 页面
  - `programmatic` TR-2.3: 退出登录后 Cookie 被清除并跳转到登录页
  - `human-judgement` TR-2.4: 页面布局整洁，中文文案，按钮可点击

## [x] Task 3: Docker 部署配置
- **Priority**: P0
- **Depends On**: Task 1, Task 2
- **Description**:
  - 编写 Dockerfile
  - 编写 docker-compose.yml
  - SQLite 数据库文件通过 volume 持久化
  - 对外暴露 3000 端口
- **Acceptance Criteria Addressed**: NFR-3
- **Test Requirements**:
  - `programmatic` TR-3.1: docker compose up -d 可成功启动
  - `programmatic` TR-3.2: 容器重启后用户数据不丢失
  - `programmatic` TR-3.3: 宿主 3000 端口可访问应用

## [x] Task 4: 部署到服务器并验证
- **Priority**: P0
- **Depends On**: Task 3
- **Description**: 
  - 将项目传输到服务器（124.223.86.48）
  - docker compose up -d 启动
  - 测试所有流程（注册→登录→登出）
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
- **Test Requirements**:
  - `programmatic` TR-4.1: 通过 http://124.223.86.48:3000 可访问
  - `programmatic` TR-4.2: 新用户可成功注册并登录
  - `programmatic` TR-4.3: 管理员 001/141242 可登录
  - `human-judgement` TR-4.4: 页面显示正常，交互流程顺畅

## [x] Task 5: 服务器端部署与验证
- **Priority**: P0
- **Depends On**: Task 4
- **Description**: 
  - 通过 SSH 将 docker-compose.yml 上传到服务器并启动
  - 验证公网可访问
  - 测试注册和登录流程
- **Test Requirements**:
  - `programmatic` TR-5.1: http://124.223.86.48:3000 返回登录页面
  - `programmatic` TR-5.2: 新用户注册成功并可登录
  - `programmatic` TR-5.3: 管理员账号可登录并显示 admin 页面

# 用户注册登录系统 - Product Requirement Document (V1)

## Overview
- **Summary**: 搭建一个带用户注册和登录认证的 Web 应用基础框架，包含写死的管理员账号。应用后续可扩展任意功能。
- **Purpose**: 建立应用的用户体系基础，区分管理员和普通用户，为后续功能模块提供认证入口。
- **Target Users**: 管理员（001）、注册用户、未来的使用者。

## Goals
- 用户可以注册账号
- 用户可以使用用户名密码登录
- 管理员使用写死的账号密码登录
- 登录成功后能看到欢迎/主页
- 提供基础的认证 API，为后续功能扩展做准备

## Non-Goals (Out of Scope)
- 不实现找回密码/邮箱验证
- 不实现权限管理细粒度（只有管理员/普通用户两级）
- 不实现第三方登录
- 不实现注册审批流程

## Background & Context
- 服务器已部署 1Panel 管理面板，支持 Docker Compose 部署
- 服务器公网 IP: 124.223.86.48
- 技术栈：Node.js + Express + SQLite + JWT + 原生 HTML/CSS/JS 前端
- 此版本为应用框架 V1，后续功能增量扩展

## Functional Requirements
- **FR-1**: 用户打开首页自动跳转登录页（未登录时）
- **FR-2**: 用户可以通过注册页面创建新账号（用户名+密码）
- **FR-3**: 写死的管理员账号 001 / 141242 可以登录
- **FR-4**: 登录成功后跳转到主页/仪表盘
- **FR-5**: 普通用户和管理员登录后看到的页面有区别
- **FR-6**: 登录状态通过 Cookie/JWT 保持
- **FR-7**: 提供退出登录功能

## Non-Functional Requirements
- **NFR-1**: 密码使用 bcrypt 加密存储，不得明文存储
- **NFR-2**: 页面响应时间 < 1s
- **NFR-3**: 使用 Docker 部署，重启后数据不丢失（数据卷持久化）
- **NFR-4**: 前端页面简洁清爽，中文界面
- **NFR-5**: 支持常见浏览器（Chrome / Safari / Firefox / Edge）

## Constraints
- **Technical**: Node.js + Express 后端，SQLite 数据库，原生前端页面
- **Business**: 管理员账号写死，不修改；后续功能逐步增量扩展
- **Dependencies**: 无外部依赖服务，全部容器内置

## Assumptions
- 服务器已配置好 Docker 环境
- 1Panel 可用于部署和管理
- 目前无需域名/HTTPS，先用 IP 访问

## Acceptance Criteria

### AC-1: 用户注册
- **Given**: 用户在注册页面填写用户名和密码
- **When**: 点击注册按钮
- **Then**: 如果用户名未被占用，创建账号成功，提示成功并跳转到登录页；如果用户名已存在，提示"用户名已被占用"
- **Verification**: `programmatic`

### AC-2: 用户登录（普通用户）
- **Given**: 用户输入正确的用户名和密码
- **When**: 点击登录按钮
- **Then**: 登录成功并跳转到普通用户主页
- **Verification**: `programmatic`

### AC-3: 管理员登录
- **Given**: 使用用户名 001 和密码 141242
- **When**: 点击登录按钮
- **Then**: 登录成功并跳转到管理员主页（与普通用户页面不同）
- **Verification**: `programmatic`

### AC-4: 密码错误处理
- **Given**: 用户输入错误的密码或不存在的用户名
- **When**: 点击登录/注册按钮
- **Then**: 显示明确的中文错误提示，不泄露敏感信息
- **Verification**: `human-judgment`

### AC-5: 密码安全存储
- **Given**: 用户注册了账号
- **When**: 查看数据库中的用户记录
- **Then**: 密码字段为 bcrypt 哈希而非明文
- **Verification**: `programmatic`

### AC-6: 未登录访问拦截
- **Given**: 用户未登录
- **When**: 尝试直接访问主页 URL
- **Then**: 自动跳转到登录页面
- **Verification**: `programmatic`

### AC-7: 页面美观度
- **Given**: 用户访问任意页面
- **When**: 正常浏览
- **Then**: 页面布局整洁，按钮可点击，文字清晰，是中文界面
- **Verification**: `human-judgment`

## Open Questions
- [ ] 注册除了用户名密码外，是否需要其他字段？（邮箱、昵称等）
- [ ] 管理员页面需要什么功能？（用户管理？）
- [ ] 应用名称叫什么？
- [ ] 普通用户登录后默认看到什么页面？

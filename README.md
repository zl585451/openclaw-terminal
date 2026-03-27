# OCT 桌面终端

> 会思考的 AI 助手，让你用聊天的方式控制电脑

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/zl585451/openclaw-terminal)](https://github.com/zl585451/openclaw-terminal/releases)
[![Download](https://img.shields.io/github/downloads/zl585451/openclaw-terminal/total)](https://github.com/zl585451/openclaw-terminal/releases)

---

## 🎯 产品简介

OCT (OpenClaw Terminal) 是一个桌面应用，让你通过自然对话控制电脑、处理任务、获取信息。

**核心理念**：一个会思考的终端窗口，你说它做。

---

## 🆕 核心功能

| 功能 | 说明 |
|------|------|
| 💬 智能对话 | 和 AMY 聊天，表格优先，结构化展示 |
| 🧠 思维引导 | 弹出选择题帮你理清思路 |
| 🎮 系统控制 | 文件操作、应用管理、系统设置 |
| 🔧 开发助手 | 代码生成、Git 操作、终端命令 |
| 📊 信息获取 | 天气查询、新闻摘要、数据搜索 |
| 🎨 多媒体 | 图片查看、屏幕截图 |
| 🤖 子代理 | 后台任务自动执行 |
| 🌐 网络请求 | HTTP API 调用（v0.1.8 新增） |
| 📧 邮件管理 | 收发邮件、验证码查询（v0.1.8 新增） |
| 🔐 保险箱 | 安全存储 API 密钥和凭证（v0.1.8 新增） |
| 🎨 图片生成 | AI 生成配图和封面（v0.1.8 新增） |

---

## 🚀 首次使用

1. **安装依赖**：`npm install`
2. **运行初始化**：`npm run init`（或 `node scripts/init-user-config.js`）
   - 按提示输入：你希望的称呼、AI 名字、时区等
   - 脚本会生成个性化配置并更新 Gateway 代码
3. **启动 OCT**：按项目说明启动应用

---

## 📦 下载安装

**下载即用，无需激活** — 安装后直接启动即可使用。

**最新版本**: v0.1.8（2026-03-27 发布）

| 平台 | 安装包 | 大小 |
|------|--------|------|
| 🪟 Windows | [OCT-Setup-v0.1.8.exe](https://github.com/zl585451/openclaw-terminal/releases/download/v0.1.8/OCT-Setup-v0.1.8.exe) | 约 80 MB |
| 🍎 Mac Intel | [OCT-0.1.8-Mac-x64.dmg](https://github.com/zl585451/openclaw-terminal/releases/download/v0.1.8/OCT-0.1.8-Mac-x64.dmg) | 约 100 MB |
| 🍎 Mac M1/M2 | [OCT-0.1.8-Mac-arm64.dmg](https://github.com/zl585451/openclaw-terminal/releases/download/v0.1.8/OCT-0.1.8-Mac-arm64.dmg) | 约 96 MB |
| 🐧 Linux | [OCT-0.1.8-Linux-x86_64.AppImage](https://github.com/zl585451/openclaw-terminal/releases/download/v0.1.8/OCT-0.1.8-Linux-x86_64.AppImage) | 约 105 MB |

> 💡 **v0.1.8 更新亮点**：
> - ✨ **体验优化** — 流式聊天更流畅、代码块渲染增强、上下文统计显示，等等若干...
> - 🔧 **工具集成** — 新增 http_request、image_gen、vault_ops、email_manager，等等若干...
> - 🐛 **问题修复** — 选项框解析、CSS 溢出保护、日志面板更新，等等若干...

---

## 💬 加入社群

欢迎加入飞书交流群，获取最新信息和帮助！

![飞书群二维码](docs/飞书群二维码.png)

---

## 🛠️ 技术栈

| 模块 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 桌面框架 | Electron 28 |
| 构建工具 | Vite 5 |
| 终端组件 | xterm 5 |
| Markdown | react-markdown |
| 国际化 | i18next |

---

## 📄 许可证

MIT License

---

## 👥 作者

OCT Team

---

🦞 **OpenClaw Terminal · 让电脑听懂你的话**

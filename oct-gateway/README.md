# OCT Gateway

OCT 独立 AI Gateway，替换 OpenClaw Gateway。

> **最新状态**: 分层重构 Phase 1～4 已完成开发侧收口，Phase 5 处于“联调修复 + 低风险清理”阶段 ✅ (2026-04-08)  
> **版本**: v0.5.0-dev

## 启动

```bash
cd oct-gateway
npm install
npm run start
# 或：node index.js
```

## 环境变量

在项目根目录的 `.env` 中配置：

```
DASHSCOPE_API_KEY=你的百炼 API Key
DEEPSEEK_API_KEY=你的 DeepSeek Key（可选，百炼失败时备用）
OCT_MODEL=qwen-plus
OCT_GATEWAY_PORT=18789
OCT_GATEWAY_TOKEN=可选，Gateway 连接认证 token
```

## 架构概览

- **Transport**：`transport/ws.js`、`transport/http.js`、`transport/protocol.js`
- **Gateway**：`gateway/router.js`、`gateway/slash.js`
- **Runtime**：`runtime/chatEngine.js`、`runtime/contextBuilder.js`、`runtime/streamController.js`、`runtime/providerRouter.js`、`runtime/toolLoop.js`
- **Services**：`services/postProcessor.js`、`services/imageService.js`
- **入口**：`index.js` 仍保留 legacy fallback 与启动胶水，待 Phase 5 清理

- **连接层**：WebSocket 18789，OCT 自有 token 认证（无 ECDSA 签名）
- **Orchestrator**：意图分类、后台任务派发，预留 Agent 路由扩展
- **工具层**：`tool_loader.js` 动态加载 `tools/*.js`，含 http_request、image_gen 等 25+ 工具
- **OpenClaw Skills**：`skill_adapter.js` 解析 `skills/` 下的 SKILL.md，注入到系统提示词
- **后台任务**：`task_queue.js` + `worker.js`，任务持久化到 `tasks_runtime.json`，60 秒超时

## 重构开关

- `OCT_USE_NEW_ROUTER=1`：Slash、`sessions.list`、普通 `chat.send` 优先走 `MessageRouter`
- `OCT_USE_NEW_CHAT_ENGINE=1`：普通聊天主链切到 `ChatEngine`
- `OCT_USE_NEW_TRANSPORT=1`：WS/HTTP 生命周期切到 `transport/*`

## 当前实现说明

- 新旧路径目前并存，这是有意保留的联调保护带
- 连接协议仍保持原样：`req` / `res` / `event` JSON 结构未改
- `ai.js` 已明显瘦身，但最终的 flag 清理和 legacy 删除仍留在 Phase 5

## 2026-04-08 联调修复摘要

- **系统命令与正文隔离**：`/status`、`/help`、`/think off` 等系统回复不再和普通 assistant 流式正文共用缓冲，避免消息串流/跑进系统气泡。
- **思考模式展示修复**：`think off` 时前端不再继续渲染 CoT 面板；系统提示与展示行为保持一致。
- **图片链路增强**：图片 analyzer 云端失败时会更积极尝试本地降级；失败提示更明确，不再表现成“AI 没收到图”。
- **任务看板修复**：右侧任务面板增加重复任务拦截；鼠标悬停可查看完整任务文本。
- **右栏用量显示**：`TOK / CTX` 已支持更多 provider 的 usage 字段；当厂商不返回显式上下文占用时，会按模型窗口给出近似 `CTX` 显示。
- **右栏字体优化**：状态区和任务看板切回 `font-sans`，只保留数字/日志区的等宽字体。

## Phase 4 新功能 (v0.5.0-dev)

### ✅ 图片分析增强
- **云端优先**: 阿里云百炼 qwen-vl-max（高精度，识别红框/箭头/标注）
- **本地降级**: BLIP 模型自动下载（~100MB），云端失败时无感切换
- **双重保障**: 都失败时友好提示「请少爷描述图片内容」

### ✅ 流式输出优化
- **打字机效果**: requestAnimationFrame 节流，每帧 10 字符
- **智能滚动**: 前几行跟随，上翻 300px 后解锁，显示「回到底部」按钮
- **用户体验**: 对标 ChatGPT 流畅度

### ✅ 任务看板完善
- **优先级管理**: P0/P1/P2 三级优先级
- **停车场功能**: 待处理事项暂存区
- **自动管线**: 对话结束自动检测反馈/停车场/记忆/模式

### ✅ 内存与安全修复
- **WebSocket 清理**: close/error 事件正确清理定时器和 Set
- **消息大小限制**: maxPayload 防止内存耗尽
- **路径遍历防护**: read_file 白名单校验
- **Session 持久化**: process.on('exit') 强制 flush

## 图片分析（云端 + 本地降级）

- **首选**：阿里云百炼 qwen-vl-max（精度高，能识别红框/箭头/标注）
- **备选**：本地 BLIP（`@xenova/transformers`），云端失败时自动切换，无感
- **都失败**：返回「图片分析失败，请少爷描述图片内容」

**首次使用本地模型**：首次触发本地分析时会自动下载 BLIP 模型（约 ~100MB），控制台会提示「首次使用本地图片分析，正在下载模型（~100MB）…」，请保持网络畅通。

配置（可选，在 `config.json` 或环境对应配置中）：

```json
{
  "image_analysis": {
    "enabled": true,
    "provider": "aliyun_vl",
    "timeout_seconds": 30,
    "vision_model": "qwen-vl-max",
    "local": {
      "enabled": true,
      "model_cache_path": "./models/blip",
      "timeout_seconds": 30
    }
  }
}
```

- `provider`: `aliyun_vl` 仅云端，`local_blip` 仅本地，`auto` 云端优先 + 本地降级
- 关闭本地降级：`local.enabled: false`

### 测试方法

1. **云端 + 本地都可用**：少爷发一张截图 → AMY 应收到带「[图片分析] …」的上下文并正常回复（优先为云端描述）。
2. **仅测本地降级**：在 config 中临时去掉 `DASHSCOPE_API_KEY` 或设错 Key → 再发图 → 应无感切换到本地 BLIP，AMY 仍能拿到基础描述。
3. **都失败**：关闭 `image_analysis.enabled` 或断网且本地未装模型 → 发图后应得到「图片分析失败，请少爷描述图片内容」。
4. **首次本地**：确保未下载过 BLIP 时，第一次发图且云端失败 → 控制台出现「首次使用本地图片分析，正在下载模型（~100MB）…」，下载完成后返回本地分析结果。

## 与 Electron 集成

main.ts 通过 `spawn('node', ['oct-gateway/index.js'])` 启动。

## 后台任务

用户消息包含「帮我搜」「查一下」「搜索一下」「顺便」「后台执行」等触发词时，Orchestrator 会派发后台任务。任务异步执行，主对话不中断。AMY 在用户**下次发消息**时自动收到任务结果并注入上下文。

## OpenClaw Skills

将 OpenClaw Skills 市场下载的技能放入 `skills/` 目录，重启后 AMY 即可使用。支持 SKILL.md 格式（YAML frontmatter + Markdown 指令体）。详见 `skills/README.md`。

## 网络稳定性（代理环境）

启用 V2RayN 等全局代理时，DashScope API 会自动直连（NO_PROXY），避免流式回复中断。fetch 支持 90 秒超时与重试，工具调用 30 秒超时隔离。

## 下一步行动

### 📦 打包发布
```bash
# 1. 生成打包配置（让 Cursor 协助）
# 2. 本地测试打包
npm run build
# 3. 推送 Git（如配置 CI/CD 则自动打包）
# 4. 更新官网下载链接
```

### 🚀 下一阶段
- 先做 Transport / Router / Runtime 联调验收
- 再进入 Phase 5：删除 legacy fallback、收紧 `index.js`、清理 Feature Flag
- 最后再考虑 Gateway 生态扩展（Agent 路由、多模型负载均衡）

---

> **维护者**: OpenClaw Team  
> **最后更新**: 2026-04-08（分层重构 Phase 1～4 开发侧收口）

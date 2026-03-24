# OCT Gateway

OCT 独立 AI Gateway，替换 OpenClaw Gateway。

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
DASHSCOPE_API_KEY=你的百炼API Key
DEEPSEEK_API_KEY=你的DeepSeek Key（可选，百炼失败时备用）
OCT_MODEL=qwen-plus
OCT_GATEWAY_PORT=18789
OCT_GATEWAY_TOKEN=可选，Gateway 连接认证 token
```

## 架构概览

- **连接层**：WebSocket 18789，OCT 自有 token 认证（无 ECDSA 签名）
- **Orchestrator**：意图分类、后台任务派发，预留 Agent 路由扩展
- **工具层**：`tool_loader.js` 动态加载 `tools/*.js`，含 http_request、image_gen 等 25+ 工具
- **OpenClaw Skills**：`skill_adapter.js` 解析 `skills/` 下的 SKILL.md，注入到系统提示词
- **后台任务**：`task_queue.js` + `worker.js`，任务持久化到 `tasks_runtime.json`，60 秒超时

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

- `provider`: `aliyun_vl` 仅云端，`local_blip` 仅本地，`auto` 云端优先+本地降级
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

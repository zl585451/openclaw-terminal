# MCP Client 实现方案

> 分支：`feature/mcp-client` | 状态：**已完成（P0/P1/P2）**

---

## 一、目标

让 OCT Gateway（Node.js）作为 **MCP Client**，通过 stdio 与本地 MCP Server（如 `minimax-coding-plan-mcp`）通信，把 MCP 工具接入 AI 对话的 `tool_calls` 循环，实现类似 Cursor IDE 的 MCP 工具调用能力。

---

## 二、核心概念

### MCP 协议

MCP（Model Context Protocol）使用 **JSON-RPC 2.0** over **stdio**：
- Client 启动 MCP Server 子进程，通过 stdin/stdout 发送请求和接收响应
- 两种消息类型：`request`（有 id，需响应）/ `notification`（无 id，无需响应）
- 传输格式：每条消息后缀 `\n` 的 JSON 行（JSON-RPC newline-delimited JSON）

### 生命周期

```
Client 连接
  ├── initialize        → 服务器返回协议版本、能力
  ├── tools/list        → 服务器返回可用工具列表
  ├── tools/call(id,args) → 调用工具，获取结果
  └── 断开 / 进程结束
```

---

## 三、架构设计

### 3.1 新增文件结构

```
oct-gateway/
├── mcp/
│   ├── index.js            # 统一导出，管理所有 MCP Server 连接
│   ├── client.js           # MCP Client（单 Server 连接，stdio 进程管理）
│   ├── protocol.js         # JSON-RPC 2.0 序列化/反序列化
│   └── toolAdapter.js      # 把 MCP 工具格式转为 Gateway tool_calls 格式
├── tools/
│   └── mcp_tools.js        # Gateway 工具入口，注册 mcp_* 前缀的动态工具
├── config.json             # 新增 mcpServers 配置节
└── index.js                # 启动时加载 MCP Server
```

### 3.2 MCP Client（`client.js`）

职责：
- 启动/管理 MCP Server 子进程（`uvx minimax-coding-plan-mcp`）
- 发送 JSON-RPC 请求（带 id），等待并路由响应
- 处理 Server 发来的 `notification`（如 `tools/list_changed`）
- 进程生命周期（启动、意外退出重连、最大重试次数）

关键实现：

```javascript
class McpClient {
  constructor(serverConfig) {
    // serverConfig: { command: 'uvx', args: ['minimax-coding-plan-mcp'], env: {...} }
    this.proc = spawn(serverConfig.command, serverConfig.args, {
      env: { ...process.env, ...serverConfig.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.pendingRequests = new Map(); // id -> { resolve, reject, timer }
    this.tools = [];

    this.proc.stdout.on('data', (data) => this._handleMessage(data));
    this.proc.stderr.on('data', (data) => log.debug('[MCP stderr]', data.toString()));
    this.proc.on('exit', (code) => this._handleExit(code));
  }

  async sendRequest(method, params) {
    const id = ++this._lastId;
    const msg = { jsonrpc: '2.0', id, method, params };
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Request ${id} timeout`)), 30000);
      this.pendingRequests.set(id, { resolve, reject, timer });
    });
  }

  async listTools() {
    const res = await this.sendRequest('tools/list');
    this.tools = res.tools || [];
    return this.tools;
  }

  async callTool(name, args) {
    const res = await this.sendRequest('tools/call', { name, arguments: args });
    return res; // { content: [...] }
  }
}
```

### 3.3 MCP Manager（`index.js`）

职责：
- 读取 `config.json` 中的 `mcpServers` 配置
- 为每个 Server 启动一个 `McpClient` 实例
- 聚合所有 Server 的工具列表，供 `tool_loader` 查询
- 提供 `executeMcpTool(name, args)` 路由到对应 Server

配置格式（`config.json`）：

```json
{
  "mcpServers": {
    "minimax": {
      "command": "uvx",
      "args": ["minimax-coding-plan-mcp"],
      "env": {
        "MINIMAX_API_KEY": "your-key",
        "MINIMAX_API_HOST": "https://api.minimaxi.com"
      }
    }
  }
}
```

### 3.4 Gateway 工具注册（`tools/mcp_tools.js`）

职责：
- 实现为 `tool_loader.js` 可识别的本地工具模块
- 查询 `mcp/index.js` 获取当前所有 MCP 工具定义
- 当模型调用 `mcp_<server>_<tool>` 时，路由到对应 Server 的 `callTool`

```javascript
// tools/mcp_tools.js
const mcpManager = require('../mcp');

module.exports = {
  definitions: () => mcpManager.getToolDefinitions(),

  async execute(name, args) {
    // name 格式: mcp_minimax_web_search
    return mcpManager.callTool(name, args);
  }
};
```

### 3.5 工具定义格式转换

MCP Server 返回的 tool 格式（[MCP Spec](https://modelcontextprotocol.io/)）：

```json
{
  "tools": [{
    "name": "web_search",
    "description": "Search the web",
    "inputSchema": {
      "type": "object",
      "properties": { "query": { "type": "string" } },
      "required": ["query"]
    }
  }]
}
```

转为 Gateway 格式（与 OpenAI tool_calls 兼容）：

```javascript
{
  type: 'function',
  function: {
    name: 'mcp_minimax_web_search',
    description: '[MCP:minimax] Search the web',
    parameters: { /* JSON Schema */ }
  }
}
```

---

## 四、消息流（以 `understand_image` 为例）

```
用户粘贴图片 → 前端检测图片
  → 方案 A（简单）：前端调 MCP，描述图片 → 文本注入消息
  → 方案 B（完整）：Gateway 工具循环调用 MCP
      ↓
Gateway: models API 调用（MiniMax）
  → 模型返回 tool_calls: [{ name: 'mcp_minimax_understand_image', arguments: {...} }]
    ↓
tool_loader.js: 发现是 mcp_* 前缀
  → 调用 mcp_tools.js
    ↓
mcp/index.js: 根据 server 名路由到对应 McpClient
  → McpClient.callTool('understand_image', { image_url, prompt })
    ↓
MCP Server（uvx 进程）: 执行工具，返回 { content: [...] }
  → 结果返回给模型，模型继续生成回复
```

---

## 五、实现步骤

### 步骤 1：MCP Client 核心（`mcp/client.js`）
- JSON-RPC 协议实现
- 子进程 spawn/管理
- request/notification 收发
- **验证**：单独启动一个 MCP Server，能成功调用其工具

### 步骤 2：MCP Manager（`mcp/index.js`）
- 多 Server 管理
- `config.json` 读取
- 工具列表聚合
- **验证**：`tools/list` 返回所有 Server 的工具

### 步骤 3：Gateway 集成（`tools/mcp_tools.js`）
- 注册为 Gateway 工具模块
- 工具定义格式转换
- 错误处理与日志
- **验证**：在 `config.json` 配置 minimax Server，Gateway 日志看到工具注册成功

### 步骤 4：前端适配（`src/hooks/useMcpImages.ts`）
- 检测消息中的图片
- 调用 MCP `understand_image`（方案 A，快速落地）
- 将图片描述注入消息
- **验证**：用户粘贴截图，模型能正确描述图片内容

### 步骤 5：配置 UI（设置面板新增 Tab）
- `SettingsPanel` → 新增 MCP Server 管理 Tab
- 添加/删除/启停 Server
- Server 状态指示
- 保存到 `config.json`

### 步骤 6：完整工具调用循环（接 `tool_calls`）
- 模型返回 tool_calls 时，通过 MCP Client 执行
- 结果格式转换后注回模型
- 支持流式输出中的 tool_calls

---

## 六、风险与注意事项

1. **MCP Server 启动时间**：`uvx` 首次调用需要下载镜像，冷启动可能 3–10 秒。考虑预热或进程池。
2. **工具参数 JSON Schema**：MCP 使用 JSON Schema draft-07，与 OpenAI 的 `parameters` 格式有差异，需要转换层。
3. **多 Server 同名工具**：用 `<server>_<tool>` 前缀避免冲突。
4. **MCP Server 进程泄漏**：需要正确处理 Server 异常退出，防止僵尸进程。
5. **API Key 安全**：配置中的 Key 会写入磁盘，需评估风险。

---

## 七、参考

- [MCP Spec - Client Implementation](https://modelcontextprotocol.io/docs)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/specification)（Python 实现的 Client 端可参考）
- MiniMax Token Plan MCP：`minimax-coding-plan-mcp`（uvx 启动）
- [MiniMax 图片理解 & 网络搜索 MCP 官方说明](https://platform.minimaxi.com/docs/token-plan/mcp-guide)（工具 `web_search`、`understand_image`，前置 uv / uvx）

### 附录：在 OCT 中配置 MiniMax MCP

1. 安装 **uv**（自带 `uvx`），见 [uv 仓库](https://github.com/astral-sh/uv)；Windows 若报 `spawn uvx ENOENT`，可在设置里把启动命令改为 `uvx` 的绝对路径。
2. 启动 **Gateway**（WebSocket `18789` / HTTP `18790`）。
3. 打开 **设置 → ⑤ MCP 工具**，点 **MiniMax 多模态工具包** 预设，按需填写：
   - **名称**：建议 `minimax`（唯一标识）。
   - **启动命令**：`uvx`
   - **参数**：`minimax-coding-plan-mcp -y`（与官方示例一致，`-y` 用于非交互确认）。
   - **环境变量**（每行 `KEY=VALUE`）：
     - `MINIMAX_API_KEY`：Token Plan 的 API Key（勿提交到仓库）。
     - `MINIMAX_API_HOST`：`https://api.minimaxi.com`
     - `MINIMAX_MCP_BASE_PATH`：本机**已存在、可写**的目录（官方 Cursor 示例要求；用于本地资源输出等场景）。
   - 可选：`MINIMAX_API_RESOURCE_MODE`（`url` 或 `local`，见官方文档）。
4. 点击 **连接并添加**，状态为已连接且列出 `web_search`、`understand_image` 即成功。配置会写入当前生效的 `config.json` 中 `mcpServers` 字段。

---

## 八、分阶段交付

| 阶段 | 内容 | 可测试性 |
|---|---|---|
| P0 | MCP Client 核心 + Manager + 单 Server 支持 | Gateway 日志能看到工具注册 |
| P0 | 图片理解（方案 A：前端调 MCP） | 粘贴截图，模型回复图片描述 |
| P1 | 完整 tool_calls 循环 | 模型主动调用 MCP 工具并收到结果 |
| P2 | 配置 UI + 多 Server | 设置面板管理多个 MCP Server |

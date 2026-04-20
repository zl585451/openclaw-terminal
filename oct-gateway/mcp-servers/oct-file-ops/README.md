# OCT File Operations MCP Server

为 OpenClaw Gateway 提供本地文件操作能力的 MCP Server。

## 功能

| Tool | 说明 |
|------|------|
| `file_list` | 列出目录内容，支持递归和扩展名过滤 |
| `file_move` | 移动文件/目录，自动创建目标目录 |
| `file_rename` | 重命名文件/目录 |
| `file_delete` | 删除文件/目录（默认移到回收站） |

## 安全机制

- **路径白名单**: 只允许操作 Desktop、Documents、Downloads、Pictures、Videos、Music 目录
- **回收站**: 删除默认移到 `~/.oct-trash`，不直接删除
- **操作日志**: 所有操作记录在 `~/.oct-logs/file-ops.log`
- **路径校验**: 自动解析绝对路径，防止路径穿越攻击
- **高权限开关**: 支持通过环境变量开启全盘访问（默认关闭，危险）

## 安装

```bash
cd oct-file-mcp
npm install
```

## 启动

```bash
# 直接运行
npm start

# 开发模式（自动重启）
npm run dev
```

## 在 OpenClaw Gateway 中配置

根据 OpenClaw 的 MCP 配置方式，将此 server 注册到 Gateway。
通常需要在 Gateway 配置中添加类似以下内容：

```json
{
  "mcpServers": {
    "file-ops": {
      "command": "node",
      "args": ["path/to/oct-file-mcp/src/index.js"],
      "transport": "stdio"
    }
  }
}
```

具体配置格式以 OpenClaw 文档为准。

### 权限开关配置（推荐）

在 `mcpServers.file_ops.env` 中可配置：

```json
{
  "mcpServers": {
    "file_ops": {
      "command": "node",
      "args": [".../oct-file-ops/src/index.js"],
      "env": {
        "OCT_FILE_OPS_UNSAFE_ALLOW_ALL": "0",
        "OCT_FILE_OPS_ALLOWED_ROOTS": "D:\\work;E:\\datasets"
      }
    }
  }
}
```

- `OCT_FILE_OPS_UNSAFE_ALLOW_ALL`
  - `0`（默认）：仅白名单 + `OCT_FILE_OPS_ALLOWED_ROOTS` 目录可访问
  - `1`：允许访问任意目录（高风险）
- `OCT_FILE_OPS_ALLOWED_ROOTS`
  - 追加白名单目录，使用分号分隔（Windows）

## 修改白名单

编辑 `src/index.js` 中的 `ALLOWED_ROOTS` 数组，添加或移除允许操作的目录：

```javascript
const ALLOWED_ROOTS = [
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "Documents"),
  // 添加更多目录...
  "D:\\MyData",  // 也可以用绝对路径
];
```

## 日志

操作日志位于 `~/.oct-logs/file-ops.log`，格式：

```
[2025-01-15T10:30:00.000Z] MOVE: {"from":"C:\\Users\\...","to":"C:\\Users\\..."}
[2025-01-15T10:30:01.000Z] DELETE_TO_TRASH: {"from":"...","trash":"..."}
```

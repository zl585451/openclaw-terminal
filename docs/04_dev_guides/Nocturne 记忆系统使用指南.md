# Nocturne 记忆系统使用指南

## 重要说明（OpenClaw 2026.3 兼容性）

当前 OCT 内嵌的 **OpenClaw 2026.3** 对 `openclaw.json` 做严格 schema 校验，**不支持 `mcpServers` 配置**。若之前自动写入过 Nocturne MCP 配置，会导致 Gateway 报错 `Config invalid: Unrecognized key: "mcpServers"` 并无法启动。

**解决方式**：打开 **设置** → 点击 **「修复 openclaw.json 配置」** → 重启 Gateway。OCT 会在下次启动 Gateway 时自动尝试移除错误配置。

Nocturne 的完整 MCP 集成需等 OpenClaw 官方支持 `mcpServers` 或使用支持该配置的 OpenClaw 版本（如 acpx）。

---

## 什么是 Nocturne Memory？

Nocturne Memory 是一款基于 MCP 的长期记忆服务，让 AI Agent 具备**持久化记忆**能力，从而：

- **更像人**：重要的事自然记得，不用每次都翻记录
- **快速拾取**：按条件精准触发回忆，而非盲盒检索
- **可控制、可追溯**：可查看、编辑、回滚记忆

## 前置条件

- **Python 3.x** 已安装并加入系统 PATH
- Windows：`python --version` 或 `py --version` 可运行
- Mac/Linux：`python3 --version` 可运行

## 安装步骤

1. 打开 OCT，进入 **设置**（齿轮图标）
2. 找到 **Nocturne 记忆系统** 区块
3. 点击 **安装 Nocturne 依赖**，等待安装完成
4. 若使用内嵌 Gateway，请 **停止 Gateway** 后重新 **启动 Gateway**

## 初始化预设记忆

OCT 提供以下预设记忆（需先安装依赖）：

| URI | 内容 | 触发条件 |
|-----|------|----------|
| core://agent/identity | 读取当前设置中的 AI 名称与用户称呼，生成身份描述 | 当用户问「你是谁」时 |
| core://my_user | 读取当前设置中的用户称呼，生成基础用户档案 | 当提到用户信息时 |
| writer://projects/oct | OCT 项目，准备开源 | 当用户提到 OCT 时 |

在 **设置 → Nocturne 记忆系统** 中点击 **「初始化预设记忆」** 即可创建。若记忆已存在会跳过。

### 重要说明：预设记忆已改为配置驱动

从 2026-04-06 起：

- 发布版默认不再写死 `AMY / 少爷`
- 初始化预设记忆时，会读取当前设置里的：
  - `AI 名称`
  - `用户称呼`
- 因此不同用户初始化出来的 `core://agent/identity` 可以不同

推荐流程：

1. 先在 **设置 → 界面设置 → AI 人格** 中填写自己的 AI 名称和用户称呼
2. 再点击 **初始化预设记忆**
3. 最后重启 Gateway 验证

## 验证是否生效

重启 Gateway 后，与 Agent 对话时，可以尝试：

- 告诉它一件重要的事（如「我叫张三，喜欢编程」）
- 新开一轮对话，问它「你还记得我是谁吗？」

若 Agent 能正确回忆起之前的对话，说明 Nocturne 已生效。

## 高级配置

配置文件：`~/.openclaw/openclaw.json`  
数据库：`userData/nocturne_memory.db`（OCT 自动创建）

如需自定义记忆域或启动加载的 URI，可参考 [Nocturne 官方文档](https://github.com/Dataojitori/nocturne_memory) 修改 `.env`。

## 常见问题

**Q: 点击安装后提示「pip 安装失败」**  
A: 请确认 Python 已正确安装，且在命令行可执行 `python` 或 `python3`。

**Q: 安装成功但 Agent 似乎没有记忆**  
A: 请确保已重启 Gateway。若仍无效，检查 `~/.openclaw/openclaw.json` 中是否包含 `nocturne_memory` MCP 配置。

**Q: 如何打开 Nocturne 的可视化管理界面？**  
A: 这是历史 Nocturne 资源的旧说明。2026-05-18 后默认运行时不再携带 `resources/nocturne_memory` 与 `resources/nocturne_server`，仓库也不再保留 dashboard 启动脚本。需要追溯旧管理界面时，请参考 Nocturne 官方仓库或历史发布归档。

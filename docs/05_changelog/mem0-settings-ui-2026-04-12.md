# Mem0 设置面板 UI — 2026-04-12

## 背景

Mem0 智能记忆功能已完整实现（事实提取 + 中文支持），但普通用户无法在界面上配置
SiliconFlow API Key，只能手动修改 `config.json`，对非技术用户不友好。

## 变更内容

### 新增「Mem0 智能记忆增强」配置区块

在 **设置 → 记忆** 标签页的最顶部（AI.library 区块之前）新增一个独立的配置区块：

- **标题标签**：显示「可选」标签 + 实时服务状态徽章（运行中 / 未启动 / 缺少 Key）
- **说明卡片**：用白话解释 Mem0 是什么、对用户有什么用，点出硅基流动免费额度
- **API Key 输入框**：密码型输入，带「显示 / 隐藏」切换，自动从 config.json 回填已保存的 Key
- **保存按钮**：调用现有 `save-api-keys` IPC，保存成功后显示「✅ 已保存，重启应用后生效」
- **注册链接**：点击通过 Electron `openExternal` 打开 https://cloud.siliconflow.cn/account/ak
- **底部说明**：告知用户留空不影响其他功能

### 服务状态检测

组件 mount 时向 `http://127.0.0.1:8002/health` 发 fetch（3s 超时），
根据响应判断状态：
- `ok=true && mem0_ready=true` → 绿色「✅ 运行中」
- 请求失败 / 超时 → 灰色「— 未启动」
- `error` 含 `API_KEY` → 橙色「⚠ 缺少 API Key」

## 变更文件

| 文件 | 变更 |
|------|------|
| `src/ui/settings/tabs/MemoryTabView.tsx` | 新增 Mem0 配置区块，添加 useState/useEffect 状态管理 |
| `electron/main.ts` | `get-api-keys` 返回值新增 `SILICONFLOW_API_KEY`；`save-api-keys` 类型定义及 cfg 合并新增 `SILICONFLOW_API_KEY` |

## 使用方法（普通用户）

1. 打开 OCT → 设置 → 记忆
2. 在「Mem0 智能记忆增强」区块点击「🔗 获取 Key」注册硅基流动并复制 API Key
3. 粘贴 Key 到输入框，点击「保存 Key」
4. 重启应用，Mem0 服务自动在后台启动，状态变为「✅ 运行中」

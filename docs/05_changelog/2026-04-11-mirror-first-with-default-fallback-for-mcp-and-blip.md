# 2026-04-11 镜像优先并自动回退默认源

## 背景

0.2.1 的图片理解可用性主要卡在“首次下载依赖”：

- MiniMax MCP 依赖 `uvx` 首次从 PyPI 拉取 `minimax-coding-plan-mcp`
- 本地 BLIP 依赖 Hugging Face 拉取模型文件

这对国内无代理用户不友好；但如果强行改成固定国内镜像，又会让海外用户多一道不必要的不确定性。

## 本次调整

### 1. MiniMax MCP

- 设置页 MiniMax MCP 预设默认附带：
  - `UV_DEFAULT_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple`
- `oct-gateway/mcp/client.js` 对 `uvx` 启动增加镜像失败回退：
  - 首次按配置里的镜像源启动
  - 若握手前子进程因拉包失败退出，则自动去掉 `UV_DEFAULT_INDEX / UV_INDEX_URL`
  - 再次用官方 PyPI 源重试一次
- `oct-gateway/mcp/client.js` 同时增加失效本地代理自动剥离：
  - 若 `HTTP_PROXY / HTTPS_PROXY / ALL_PROXY` 指向 `127.0.0.1 / localhost / ::1`
  - 且对应端口未监听
  - 则 MCP 启动时自动忽略这些残留代理变量，避免 `tunnel error` 和 `10061`

### 2. 本地视觉模型（BLIP）

- 设置页新增“模型镜像地址（可选）”
- `oct-gateway/image_analyzer_local.js` 下载模型时：
  - 若填写了镜像，优先使用该镜像
  - 若镜像失败，自动回退 `https://huggingface.co/`
  - 若留空，则直接走官方源

### 3. Electron 配置落盘

- `image_analysis.local.mirror_host`
  - 用于保存本地 BLIP 的可选镜像地址
- 设置页通过 Electron IPC 读写这个字段

## 用户体验变化

- 国内用户：默认更容易首次跑通
- 海外用户：即使预设里带了国内 PyPI 镜像，失败后也会自动退回官方源
- 日志与状态文案会明确提示“优先镜像，失败回退官方源”

## 涉及文件

- `oct-gateway/mcp/client.js`
- `oct-gateway/image_analyzer_local.js`
- `oct-gateway/config.js`
- `electron/main.ts`
- `electron/preload.ts`
- `src/components/SettingsPanel.tsx`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/ui/settings/tabs/McpTabView.tsx`
- `src/vite-env.d.ts`

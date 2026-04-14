# 2026-04-13 — 网关 fetch 走 HTTP(S)_PROXY（Gemini / 代理环境）

## 背景
国内使用 V2rayN（含 Tun）时，浏览器可走代理，但 **oct-gateway** 内 **Node 原生 `fetch`** 仍可能直连 Google，日志表现为 `TypeError: fetch failed`。

## 改动
- `oct-gateway/index.js`：若存在 `HTTPS_PROXY` / `HTTP_PROXY`（及小写别名），对全局 `fetch` 调用 `undici` 的 `setGlobalDispatcher(new ProxyAgent(...))`；**同时删除** `NODE_USE_ENV_PROXY`，避免与 ProxyAgent 叠用导致发往 Google 的请求出现重复鉴权。
- `electron/main.ts`：`buildOctChildEnv` **清除**子进程 `NODE_USE_ENV_PROXY`（仅依赖网关内 undici `ProxyAgent`）。
- `oct-gateway/config.js`：对 `generativelanguage.googleapis.com` 的 `GOOGLE_AI_BASE_URL` **去掉 query/hash**（避免 `?key=` 与 `Authorization: Bearer` 并存）。
- `AGENTS.md`：补充代理与 Gemini 的说明。

## 用户操作

**推荐（安装版 / 打包版）**：设置 → 连接 → **HTTPS 代理**，填写如 `http://127.0.0.1:10809`，**保存并重新连接**（写入 `%AppData%\\openclaw-terminal\\config.json` 的 `HTTPS_PROXY`，网关启动时读入并启用 undici ProxyAgent）。

**可选**：项目根目录 `.env` 或系统环境变量中的 `HTTPS_PROXY` / `HTTP_PROXY`（若已设置则优先生效，config 仅在环境变量为空时补齐）。

保存后需 **重启 OCT Gateway**（或重启应用）。

## 与 NODE_USE_ENV_PROXY
Electron 启动网关时会 **清除** 子进程环境变量 `NODE_USE_ENV_PROXY`，仅依赖网关内的 undici `ProxyAgent`，避免与 Google API 重复鉴权（HTTP 400 *Multiple authentication credentials*）。

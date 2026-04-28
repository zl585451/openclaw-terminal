## 变更摘要

- 为仓库增加 Node 版本统一入口（`.nvmrc` + `package.json#volta`），并将推荐稳定版本统一到 `24.15.0`，减少本机/CI/团队环境漂移
- 为仓库增加 `package.json#packageManager` 与脚本级 Node 版本提醒，减少“明明能跑但 ABI 已漂”的隐性风险
- `oct-gateway` 启动前自动执行 native 模块自检与必要的 rebuild，避免 `better-sqlite3` 因 ABI 不匹配导致网关进程退出（进而 `ECONNREFUSED`）
- Electron 主进程启动内置 gateway 前也会先执行同一套 native 自检，避免桌面端启动链路绕过修复逻辑

## 影响范围

- 开发者本地：切换 Node 版本后启动 gateway 会自动修复 native 模块
- 桌面端：点击“启动 / 重启 Gateway”时，不再绕过 native 自检
- 不影响 `src/` 前端分层与 `oct-gateway/` 的边界（仅脚本、启动链路与文档）

## 相关文件

- `.nvmrc`
- `package.json`
- `scripts/check-node-version.js`
- `oct-gateway/package.json`
- `electron/main.ts`
- `docs/04_dev_guides/node-version-and-native-modules.md`


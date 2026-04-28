# Node 版本统一与 Gateway Native 模块（Windows 常见坑）

## 结论（建议做法）

- **统一开发 Node 版本：Node 24 LTS（推荐，当前锁定 `24.15.0`）**
- 本仓库已提供：
  - 根目录 `.nvmrc`：用于 `nvm/fnm` 一键切换 Node
  - 根目录 `package.json#volta`：用于 Volta 锁定 Node / npm 版本（跨平台）
  - 根目录 `packageManager`：固定 npm 版本，减少工具链差异
  - `oct-gateway/package.json` 启动前自动执行 native 自检与 rebuild
  - `electron/main.ts` 在桌面端拉起内置 gateway 前也会先做同样的 native 自检
  - 常用脚本会先运行 `scripts/check-node-version.js`，在你用错 Node 版本时直接提示

> 目标是避免 “安装时一套 Node、运行时又变另一套” 导致 `better-sqlite3` / `sqlite-vec` 加载失败。

## 为什么会出现“版本不同很割裂”

`better-sqlite3` / `sqlite-vec` 属于 **native addon**，会生成二进制 `.node` 文件，它与 **加载它的 Node 运行时 ABI** 强绑定：

- 只要 **Node 主版本变化**（例如 20 → 22），ABI 会变化
- ABI 不匹配时，模块会在 `require()` 阶段直接报错并导致 Gateway 进程退出
- Gateway 退出后，前端连接 `ws://127.0.0.1:18789` 就会看到 `ECONNREFUSED`

## 开发环境怎么统一

### 方案 A：Volta（推荐）

安装 Volta 后，在仓库根目录执行：

```bash
volta install node@24.15.0 npm@11.12.1
```

之后在本仓库里运行 `node`/`npm` 会自动使用锁定版本。

### 方案 B：nvm/fnm

在仓库根目录：

```bash
nvm use
```

或按你的工具链执行等价命令（读取 `.nvmrc`）。

## 现在会怎样提醒

当你用 `npm run dev`、`npm run start`、`npm test` 或进入 `oct-gateway` 单独启动时：

- 若当前 Node 与仓库偏好的 `24.15.0` 不一致，会先打印提醒
- 提醒不会阻止你继续开发，但会明确告诉你当前环境在漂移
- 真正启动 gateway 时，仍会继续执行 native 自检与必要的 rebuild

## Gateway 为什么现在更稳定了

`oct-gateway` 的启动脚本和 Electron 主进程都增加了启动前自检：

- `npm run dev` / `npm start` 会先执行 `npm run ensure:native`
- 从 OCT 桌面端点击“启动 / 重启 Gateway”时，也会先执行同一份 `scripts/ensure-oct-gateway-native.js`
- `ensure:native` 会尝试加载 `better-sqlite3` / `sqlite-vec`
  - 若 ABI 不匹配或加载失败：自动执行 `npm rebuild better-sqlite3 sqlite-vec`
  - 成功后写入 `oct-gateway/node_modules/.native-runtime.json` 记录运行时信息

这样即使你偶尔切了 Node，也不会只在“命令行手动跑 gateway”时被修好，而是从 Electron 里直接启动时也能先自修复，减少 `ECONNREFUSED` / “Gateway 连不上”。


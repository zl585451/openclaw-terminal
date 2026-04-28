# Node 版本统一与 Gateway Native 模块（Windows 常见坑）

## 结论（建议做法）

- **统一开发 Node 版本：Node 20 LTS（推荐）**
- 本仓库已提供：
  - 根目录 `.nvmrc`：用于 `nvm/fnm` 一键切换 Node
  - 根目录 `package.json#volta`：用于 Volta 锁定 Node / npm 版本（跨平台）
  - `oct-gateway/package.json` 启动前自动执行 native 自检与 rebuild

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
volta install node@20.18.1 npm@10.9.4
```

之后在本仓库里运行 `node`/`npm` 会自动使用锁定版本。

### 方案 B：nvm/fnm

在仓库根目录：

```bash
nvm use
```

或按你的工具链执行等价命令（读取 `.nvmrc`）。

## Gateway 为什么现在更稳定了

`oct-gateway` 的启动脚本增加了启动前自检：

- `npm run dev` / `npm start` 会先执行 `npm run ensure:native`
- `ensure:native` 会尝试加载 `better-sqlite3` / `sqlite-vec`
  - 若 ABI 不匹配或加载失败：自动执行 `npm rebuild better-sqlite3 sqlite-vec`
  - 成功后写入 `oct-gateway/node_modules/.native-runtime.json` 记录运行时信息

这样即使你偶尔切了 Node，也不会“连不上 gateway”，最多第一次启动会多花一点时间 rebuild。


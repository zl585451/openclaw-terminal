# `electron/main_utf8.ts` 现状评估

日期：2026-04-21
范围：仅评估是否仍应保留 `electron/main_utf8.ts`，本次不改代码

## 结论

结论：`electron/main_utf8.ts` 当前更像历史分叉副本，不像仍在被主链路依赖的入口文件，建议进入“待归档/待删除”清单，而不是继续并行维护。

判定依据：

1. 仓库内对 `main_utf8` 的文本引用仅发现 1 处，位于文档 [docs/02_architecture/FEATURE_MAP.md](/E:/windows-window/OpenClaw-Terminal/docs/02_architecture/FEATURE_MAP.md:133)，未发现构建脚本、Electron 入口、运行时代码对它的直接引用。
2. 文件体量差异明显：`electron/main.ts` 为 198150 字节，`electron/main_utf8.ts` 为 55686 字节，二者已经不是“小补丁副本”关系。
3. `git diff --no-index` 显示两者存在大规模结构性分叉，`main_utf8.ts` 缺失当前主入口中的大量配置、网关、任务、Nocturne、本地视觉等能力代码，不适合作为可替代入口继续保留。
4. 历史上 `main_utf8.ts` 最近一次提交停留在 2026-04-09，而 `electron/main.ts` 在其后仍持续演进；从提交轨迹看，主入口已经继续前进，`main_utf8.ts` 没有同步跟进。

## 证据

### 1. 引用扫描

`rg -n --fixed-strings "main_utf8" .`

结果：仅命中 1 处文档引用。

- [docs/02_architecture/FEATURE_MAP.md](/E:/windows-window/OpenClaw-Terminal/docs/02_architecture/FEATURE_MAP.md:133)

### 2. 文件属性

`Get-Item electron\main.ts, electron\main_utf8.ts | Select-Object Name, Length, LastWriteTime`

| 文件 | 大小 | 最后修改时间 |
| --- | ---: | --- |
| `electron/main.ts` | 198150 | 2026-04-20 19:00:16 |
| `electron/main_utf8.ts` | 55686 | 2026-04-11 09:42:57 |

### 3. 历史记录

`git log --follow --format="%h %ad %s" --date=short -- electron/main_utf8.ts`

近几次记录：

- `44c914e 2026-04-09 feat: complete oct-gateway refactor and integration fixes`
- `103bf89 2026-03-17 fix: 统一端口5176，修复启动脚本和Electron加载地址`
- `868ef22 2026-03-12 fix: Mac/Linux 使用 tail -f 替代 PowerShell 修复日志监控崩溃 (v0.1.6)`
- `61363d6 2026-03-11 9e3a55c9b367e54ca6bd59fe10d9aa0565f06373`

`git log --oneline -- electron/main_utf8.ts electron/main.ts`

从联合历史可见，`electron/main.ts` 在 2026-04-09 之后还有多轮持续演进提交，而 `main_utf8.ts` 没有继续同步。

### 4. 头部对照与职责差异

对比前 80 行可见：

- `electron/main.ts` 仍保留并扩展了 `CONFIG_FILE`、`DEFAULT_CONFIG`、本地视觉下载状态、网关 token/config 同步等入口级状态。
- `electron/main_utf8.ts` 头部已经切成更轻量的旧式结构，直接使用 `GATEWAY_CMD` 和环境变量，不具备当前主入口同等级的配置与运行时能力面。
- `electron/main.ts` 引入了 `shell`、`mammoth` 等当前主入口依赖；`main_utf8.ts` 未保持一致。

结合整份 diff，可判断两者不是“编码格式不同的同一文件”，而是职责已经漂移的两份不同实现。

## 风险判断

如果继续保留 `main_utf8.ts`：

- 容易让后续维护者误判为“备用入口”或“Windows/编码专用入口”。
- 文档可能继续错误引用，放大认知分叉。
- 后续若有人误在该文件上修 bug，会形成无效维护。

如果直接删除：

- 当前证据显示运行链路大概率不受影响。
- 但仍建议先做一次“入口配置/构建脚本最终复核”，确认没有仓外打包脚本或手工流程使用它。

## 建议动作

建议顺序：

1. 在后续阶段先把 [docs/02_architecture/FEATURE_MAP.md](/E:/windows-window/OpenClaw-Terminal/docs/02_architecture/FEATURE_MAP.md:133) 中对 `main_utf8.ts` 的并列入口描述改成仅保留 `electron/main.ts`。
2. 将 `electron/main_utf8.ts` 标记为“待删除候选”，纳入下一轮清理清单。
3. 若构建入口与打包配置复核仍无引用，再执行正式删除，并同步 changelog / architecture 文档。

## 本次判定

判定：`待归档/待删除`

置信度：高

保留条件：

- 只有在后续发现外部打包流程、历史分发脚本或人工运维流程仍显式依赖 `electron/main_utf8.ts` 时，才建议暂缓删除。

---

## 2026-04-21 执行结果

经二次全仓搜索确认无代码引用与构建配置引用，已在 commit [待回填] 中删除该文件。

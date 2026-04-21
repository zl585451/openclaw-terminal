# hypothesis.js 调用链路核查报告

## 模块导出清单
| 函数名 | 签名 | 行号 |
|---|---|---|
| selectBestApproach | `async function selectBestApproach(userMsg, systemPrompt, history)` | `oct-gateway/hypothesis.js:6` |

证据命令:
- `Get-Content oct-gateway/hypothesis.js | Select-String -Pattern "module\.exports|exports\.|^function\s+\w+|^const\s+\w+\s*=\s*(async\s+)?\(|^class\s+\w+"`

## 静态调用分析（grep 结果）
| 调用点 | 文件:行号 | 上下文 | 状态 |
|---|---|---|---|
| `const hypothesis = require('./hypothesis')` | `oct-gateway/index.js:67` | 模块加载 | 活跃（仅加载） |
| `hypothesis,` | `oct-gateway/index.js:141` | 作为依赖注入到 `ContextBuilder` | 活跃（仅注入） |
| `this.hypothesis = hypothesis` | `oct-gateway/runtime/contextBuilder.js:23` | 保存注入对象 | 活跃（未使用） |
| `const hypothesisResult = null;` | `oct-gateway/runtime/contextBuilder.js:346` | `_buildSystemPrompt` 内硬编码停用 sidecar | 活跃（显式停用） |

未发现任何 `selectBestApproach(` 调用点（除定义处）：
- `rg -n "selectBestApproach\(|\.selectBestApproach|hypothesisResult" oct-gateway`

## 运行时日志验证
临时探针（已回滚）:
- 在 `oct-gateway/hypothesis.js` 顶部加入 `module loaded` 日志
- 在 `selectBestApproach` 函数入口加入 `called` 日志

场景与结果:
- 场景 1（简单聊天）: 仅出现 `module loaded`，未出现 `selectBestApproach called`
- 场景 2（工具倾向文本）: 仅出现 `module loaded`，未出现 `selectBestApproach called`
- 场景 3（复杂任务文本）: 仅出现 `module loaded`，未出现 `selectBestApproach called`

说明:
- 运行入口基于 `ContextBuilder._buildSystemPrompt()` 的真实路径执行（该路径当前将 `hypothesisResult` 固定为 `null`）。
- 另行尝试直接起第二个 gateway 实例时命中 `EADDRINUSE:18789`，不影响上述结论。

## git 历史
- 最近修改（`hypothesis.js`）：
  - `67f122d` 备份：找回的代码块修复版本
  - `3ad178a` backup: log system + gateway monitoring 20260319
  - `fba5931` fix: 停车场路径统一，AMY 回复显示修复
- `index.js` 中 `require('./hypothesis')` 的接入追溯：
  - `fba5931`
- 当前未发现“移除后再恢复 require”的证据。

## 结论（三选一）
- [ ] A. 活跃调用，文档 ✅ 状态正确
- [x] B. 已接入但未真实触发（死调用），建议将 `docs/03_specs/99_known_issues.md #8` 状态从“✅ 已接入”调整为“⚠️ 已接入但主链停用/未触发”
- [ ] C. 完全未被调用（死代码），建议整体归档

## Part B 审计补充（任务 6 FEATURE_MAP 真实性）
高置信条目（文档漂移，不在本次 Part A 修复）：
- `oct-gateway/FEATURE_MAP.md:133` 对 `self_eval.js:429 maybeDistill()` 的“✅ 已调用”描述与当前代码不一致。
- 定性证据：
  - 代码侧 `oct-gateway/index.js:66` 已注释 `self_eval` 主链调用
  - 构建配置（`package.json` / `tsconfig*` / builder）不构成该调用存在性的证据
  - 该项属于“文档声称调用，但代码主链未触发”的高置信漂移

## 附录：临时日志回滚
- 本次临时日志通过工作区修改后已手动回滚，不进入最终提交。

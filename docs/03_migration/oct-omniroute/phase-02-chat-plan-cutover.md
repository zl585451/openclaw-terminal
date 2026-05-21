# 施工包 2：聊天与规划链路切换

## 阶段目标

本包要完成的事情只有一件：

- 把 `oct-chat` 和 `oct-plan` 两条逻辑能力的模型出口切到外部 `OmniRoute`

本包完成后应达到：

- 普通聊天默认通过外部 `OmniRoute`
- 规划 / 总结 / script adapter 类任务默认通过外部 `OmniRoute`
- `OCT` 仍然保留本地工具执行、tool loop、记忆编排、任务编排

本包明确不做：

- 不切 `oct-tool-safe`
- 不迁移本地工具系统
- 不迁移本地记忆编排
- 不删除旧 provider / fallback / router 逻辑
- 不收口普通用户设置页

---

## 前置条件

- 工作目录：`E:\windows-window\OpenClaw-Terminal`
- 施工包 1 已完成并通过验收
- 当前代码已具备：
  - `OMNIROUTE_BASE_URL`
  - `OMNIROUTE_API_KEY`
  - `OMNIROUTE_CHAT_MODEL`
  - `OMNIROUTE_PLAN_MODEL`
  - `OMNIROUTE_TOOL_MODEL`
  - `OCT_USE_EXTERNAL_OMNIROUTE`
- 本地 `/omniroute/status` 已能返回外部 `OmniRoute` 的配置与连通性诊断
- 外部 `OmniRoute` 已可访问，且聊天与规划 alias 已配置好

---

## 允许修改

- `oct-gateway/ai.js`
- `oct-gateway/services/llmClient.js`
- `oct-gateway/runtime/*`
- `oct-gateway/transport/*`
- `oct-gateway/test/*`
- 必要时可改：
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/hooks/settings/*`
  - `src/ui/settings/tabs/*`

---

## 禁止修改

- 禁止修改本地工具执行闭环
- 禁止修改 `toolLoop` 的本地执行职责
- 禁止把工具调用迁成依赖 OmniRoute MCP
- 禁止迁移或重写记忆编排
- 禁止删除旧 provider / fallback / router 代码
- 禁止删除旧设置项
- 禁止提前推进施工包 3-5

---

## 执行步骤

### Step 1：把 `oct-chat` / `oct-plan` 的外部目标正式接入运行时

要求：

- 不再只停留在配置读取和状态诊断
- 让运行时在 `OCT_USE_EXTERNAL_OMNIROUTE=true` 时，能为 `oct-chat` / `oct-plan` 生成外部请求目标
- 外部目标必须来自：
  - `OMNIROUTE_BASE_URL`
  - `OMNIROUTE_API_KEY`
  - `OMNIROUTE_CHAT_MODEL`
  - `OMNIROUTE_PLAN_MODEL`

要求保持：

- `oct-tool-safe` 暂不切换
- 关闭开关时，行为完全回到旧链路

### Step 2：在 `llmClient` 层接入外部 OmniRoute 优先分流

要求：

- 当 capability 为 `oct-chat` 或 `oct-plan`，且外部模式开启并配置完整时：
  - 优先走外部 `OmniRoute`
- 当外部模式关闭、配置不完整或外部目标解析失败时：
  - 回退旧链路

要求：

- 不删除原有本地 candidate/fallback 逻辑
- 不破坏现有 `resolveProviderFor` 的兼容行为

### Step 3：在 `ai.js` 主聊天流里接入 capability 级切换

要求：

- 普通聊天请求默认映射到 `oct-chat`
- 规划 / 总结 / script adapter 相关请求默认映射到 `oct-plan`
- 当外部模式开启时，这两类请求应透传到外部 `OmniRoute`

这里的“切换”是 capability 出口切换，不是工具链切换。

### Step 4：保留回滚路径

要求：

- 只要关闭 `OCT_USE_EXTERNAL_OMNIROUTE`
- `oct-chat` / `oct-plan` 必须立即恢复旧路径

不能出现：

- 新链路异常但旧链路无法恢复
- 新链路开启后必须改一堆别的设置才能回退

### Step 5：补测试

至少补这些测试：

- `oct-chat` 在开关开启时走外部 `OmniRoute`
- `oct-plan` 在开关开启时走外部 `OmniRoute`
- 外部配置缺失时回退旧链路
- 开关关闭时行为与旧版一致
- 外部 401 / 5xx / timeout 时回退策略符合预期

---

## 验收标准 AC

- [ ] `oct-chat` 在外部模式开启且配置完整时，默认走外部 `OmniRoute`
- [ ] `oct-plan` 在外部模式开启且配置完整时，默认走外部 `OmniRoute`
- [ ] `OCT_USE_EXTERNAL_OMNIROUTE=false` 时，聊天和规划完全保持旧行为
- [ ] 外部配置缺失时不会强行切流到坏链路
- [ ] 本地工具执行逻辑未被修改
- [ ] 本地记忆编排未被修改
- [ ] `oct-tool-safe` 未被提前切到外部
- [ ] 旧 provider / fallback / router 代码仍保留
- [ ] 至少存在可观察证据表明当前聊天/规划请求已通过外部 `OmniRoute`

---

## 测试要求

必须执行：

- `oct-chat` / `oct-plan` 相关单元测试
- 至少一组开关开启 / 关闭的对照测试
- 至少一组外部失败回退测试
- 至少一次手工验证：
  - 普通聊天
  - 规划 / 总结类任务

如果未接真实外部环境，必须明确说明：

- 哪些是 mock 验证
- 哪些没有完成联调

---

## 完成后简报格式

完成后必须用代码框输出：

```markdown
完成内容：
- 修改文件列表：
- 每个文件改了什么：

未做内容：
- 是否改了禁止文件：
- 是否改了本地工具执行逻辑：
- 是否改了记忆编排：
- 是否提前动了 oct-tool-safe：

验证状态：
- oct-chat 是否已切到外部 OmniRoute：
- oct-plan 是否已切到外部 OmniRoute：
- 开关关闭时是否回到旧链路：
- 跑了哪些测试：
- 手工验证做了哪些：

风险/备注：
- 当前还缺什么才能进入施工包 3：
- 需要 Codex 重点审查的文件：
```

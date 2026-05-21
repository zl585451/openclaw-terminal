# Phase 3：工具安全通道切换与伪工具拦截收口

## 阶段目标
完成 `oct-tool-safe` 的模型出口切换，让工具决策模型优先走外部 OmniRoute，但本地工具执行、tool loop、tool adapter、伪工具拦截和权限边界仍然全部留在 OCT 本地。

这阶段不是“把工具系统迁到 OmniRoute”，而是：

- 外部模型只负责“是否调用工具、调用哪个工具、生成什么参数”
- OCT 本地负责“这个工具能不能调用、参数是否合法、是否是假工具、是否真的执行、执行后如何续轮”

当前已暴露问题是：仍然出现伪工具调用。  
因此本阶段必须先收紧本地伪工具拦截，再允许 `oct-tool-safe` 模型出口走外部。

## 前置条件
- 已有总计划：`docs/03_migration/oct-omniroute/README.md`
- 已完成 Phase 1 基线接入：`docs/03_migration/oct-omniroute/execution-plan.md`
- 已完成 Phase 2 聊天 / 规划链路切换：`docs/03_migration/oct-omniroute/phase-02-chat-plan-cutover.md`
- 工作区必须干净后再开始
- 需要保留现有外部配置：
  - `OMNIROUTE_BASE_URL`
  - `OMNIROUTE_API_KEY`
  - `OMNIROUTE_CHAT_MODEL`
  - `OMNIROUTE_PLAN_MODEL`
  - `OMNIROUTE_TOOL_MODEL`
  - `OCT_USE_EXTERNAL_OMNIROUTE`

## 允许修改
- `oct-gateway/ai.js`
- `oct-gateway/services/*`
- `oct-gateway/runtime/*`
- `oct-gateway/transport/*`
- `oct-gateway/test/*`

只有确有必要时才允许改：
- `electron/main.ts`
- `electron/preload.ts`
- `src/hooks/settings/*`
- `src/ui/settings/tabs/*`

## 禁止修改
- 禁止把工具执行迁成依赖 OmniRoute MCP
- 禁止把工具权限控制迁出 OCT
- 禁止迁移本地记忆编排
- 禁止删除旧 provider / fallback / router 代码
- 禁止删除旧设置项
- 禁止做设置页收口
- 禁止顺手重构整个 tool system
- 禁止推进 Phase 4 / 5

## 执行步骤
1. 放开 `oct-tool-safe` 的外部目标解析，但仅限模型出口层：
   - 外部模式开启且 `OMNIROUTE_TOOL_MODEL` 配置完整时，允许 `oct-tool-safe` 生成外部 OmniRoute 目标
   - 配置缺失、开关关闭、解析失败时，必须无感回退到旧本地工具安全链路

2. 在工具决策主链中接入外部优先，但只影响模型出口：
   - `oct-tool-safe` 模型请求优先走外部 OmniRoute
   - 本地旧 `oct-tool-safe` 候选链继续保留为 fallback
   - 外部失败后，必须能回落到本地严格工具模型链

3. 明确并收紧伪工具拦截边界：
   - 识别“模型输出了工具调用样式，但不在允许工具清单内”的情况
   - 识别“模型伪造工具名 / 伪造参数结构 / 伪造非注册工具”的情况
   - 这些情况必须在 OCT 本地被拦截，不能透传执行
   - 拦截后要么转成普通文本回复，要么进入本地安全兜底，不允许直接执行未知工具

4. 保证工具执行闭环仍然在本地：
   - tool loop 仍在本地
   - tool adapter 仍在本地
   - 工具参数清洗仍在本地
   - 伪工具拦截仍在本地
   - 工具结果回流后的续轮控制仍在本地

5. 处理工具续轮与失败回退：
   - `toolRound > 0`、`preserveToolChain` 等续轮路径不能破坏本地控制权
   - 外部 `oct-tool-safe` 失败时，回退到本地后不能再被外部 OmniRoute 抢回去
   - 不允许同一工具请求被重复执行两次
   - 401 / 配置错误 / 协议错误 / 工具错误要按现有安全策略处理

6. 补齐测试，并至少做一次真实工具场景手工验证。

## 验收标准 AC
- [ ] `oct-tool-safe` 在外部模式开启且配置完整时，模型出口默认走外部 OmniRoute
- [ ] 工具实际执行仍在 OCT 本地
- [ ] tool loop 未迁出
- [ ] tool adapter 未迁出
- [ ] 工具参数清洗未迁出
- [ ] 伪工具调用仍由 OCT 本地拦截
- [ ] 未注册工具、伪造工具名、非法参数结构不会被直接执行
- [ ] 外部 `oct-tool-safe` 失败时，可以回退到本地链路
- [ ] 回退到本地后，不会再次被外部 OmniRoute 抢流
- [ ] 不依赖 OmniRoute MCP
- [ ] 不会出现同一工具请求重复执行
- [ ] 开关关闭时，完全恢复旧行为
- [ ] 旧 provider / fallback / router 代码仍保留

## 测试要求
- 运行 `oct-tool-safe` 相关单元测试
- 补伪工具拦截测试，至少覆盖：
  - 未注册工具名
  - 伪造工具名
  - 非法参数结构
  - 工具调用样式文本误判
- 补工具续轮测试
- 补外部失败回退测试
- 至少做一次手工验证：
  - 一个真实可调用工具场景
  - 一个伪工具调用场景
  - 一个外部失败回退场景

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
- 是否引入 OmniRoute MCP 依赖：

验证状态：
- oct-tool-safe 是否已切到外部 OmniRoute：
- 工具执行是否仍在本地：
- 伪工具调用是否仍被本地拦截：
- 外部失败时是否回退本地链路：
- 跑了哪些测试：
- 手工验证做了哪些：

风险/备注：
- 当前还缺什么才能进入施工包 4：
- 需要 Codex 重点审查的文件：
```

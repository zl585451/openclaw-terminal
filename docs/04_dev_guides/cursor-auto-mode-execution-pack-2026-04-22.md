# Cursor 自动模式执行包（2026-04-22）

## 这份文件怎么用

这不是给人看的架构计划，而是给 Cursor 自动模式直接执行的任务包。

使用方式：

1. 一次只复制 **一个任务块** 给 Cursor。
2. 不要一次喂多个任务。
3. 必须等它完成并检查结果后，再喂下一个任务。
4. 如果某个任务块里写了“做完必须停止并汇报”，就不要让它继续下一步。

## 总原则

把下面这段一起发给 Cursor，作为每个任务的前置约束：

```md
你现在在 OpenClaw Terminal 仓库里工作。

严格遵守以下规则：

- 只完成我这次消息里指定的任务，不要顺手重构别的地方。
- 只修改任务里允许修改的文件。
- 如果发现还需要改更多文件，先停止并汇报，不要自行扩展范围。
- 如果任务要求“行为不变”，就只能做无行为变化的重构。
- 每次完成后都要：
  - 列出改动文件
  - 说明完成了什么
  - 说明没做什么
  - 给出验证结果
- 除非任务里明确允许，否则不要修改 `electron/main.ts`、`src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useMessages.ts`、`oct-gateway/index.js`。
- 做完当前任务后停止，不要开始下一个任务。
```

---

## Task 1

### 名称

设置面板 provider 类型统一

### 适合直接发给 Cursor 的内容

```md
任务：统一设置面板里的 provider 类型定义，先做小范围无行为变化重构。

目标：

- 统一 `ProviderEntry` 和相关 provider 类型来源
- 减少设置页内部重复类型定义
- 保持行为不变

允许修改的文件：

- `src/hooks/settings/useApiKeys.ts`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`

如果确实需要新增一个类型文件，允许新增：

- `src/ui/settings/providerTypes.ts`

禁止修改的文件：

- `electron/main.ts`
- `electron/preload.ts`
- `src/components/SettingsPanel.tsx`
- 任何 `oct-gateway/` 下的文件

要求：

- 不要改保存逻辑
- 不要改 provider 选择逻辑
- 不要改 UI 文案
- 只做类型和导入收口
- 如果发现需要改更多业务逻辑，停止并汇报

完成标准：

- 设置页相关 provider 类型不再重复定义
- 项目能通过类型检查和构建

必须执行的验证：

- `npx vitest run`
- `npm run build`

最终输出格式：

- 改动文件
- 完成内容
- 未改动内容
- 验证结果
- 风险或后续建议

做完必须停止，不要继续下一任务。
```

---

## Task 2

### 名称

抽取推荐模型元数据

### 适合直接发给 Cursor 的内容

```md
任务：把设置面板里和“推荐模型”有关的静态元数据进一步收口，做无行为变化整理。

目标：

- 把 beginner 模式下的推荐模型配置集中管理
- 避免在多个文件里散落同一套模型推荐逻辑
- 保持现有行为不变

允许修改的文件：

- `src/hooks/settings/recommendedModels.ts`
- `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`
- `src/hooks/settings/useApiKeys.ts`

禁止修改的文件：

- `electron/main.ts`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/components/SettingsPanel.tsx`
- 任何 `oct-gateway/` 文件

要求：

- 不要改 API key 保存流程
- 不要改测试连接逻辑
- 不要改 provider 推断逻辑
- 只整理推荐模型元数据和读取方式

完成标准：

- 推荐模型逻辑集中到单一来源
- Beginner 页面不再内嵌重复推荐模型数据
- 构建通过

必须执行的验证：

- `npx vitest run`
- `npm run build`

最终输出格式：

- 改动文件
- 完成内容
- 未改动内容
- 验证结果
- 风险或后续建议

做完必须停止，不要继续下一任务。
```

---

## Task 3

### 名称

给 provider 工具函数补测试

### 适合直接发给 Cursor 的内容

```md
任务：只为 provider 相关工具函数补测试，不改业务逻辑。

目标：

- 为已有 provider 判断逻辑补单元测试
- 覆盖常见 key 格式、baseUrl 推断、边界输入
- 不修改生产逻辑，除非测试暴露出明显拼写级 bug

允许修改的文件：

- `src/utils/providerUtils.ts`
- 新增测试文件：`src/utils/providerUtils.test.ts`

禁止修改的文件：

- 所有设置页面文件
- `electron/main.ts`
- 所有 `oct-gateway/` 文件

要求：

- 先读懂现有函数行为，再写测试
- 不要为了“你认为更合理”而改变当前逻辑
- 如果发现现有行为很怪，先按现状写测试并在总结里说明

完成标准：

- 补上覆盖主要公开函数的测试
- 测试通过
- 不引入生产逻辑的大改

必须执行的验证：

- `npx vitest run`

最终输出格式：

- 改动文件
- 新增测试覆盖点
- 是否改了生产代码
- 验证结果
- 当前行为备注

做完必须停止，不要继续下一任务。
```

---

## Task 4

### 名称

给连接错误提示映射补测试

### 适合直接发给 Cursor 的内容

```md
任务：为 AI 连接错误的人类可读提示逻辑补测试，不改产品行为。

目标：

- 给错误映射工具补测试
- 覆盖不同 provider、常见错误文案、兜底分支
- 保持生产行为不变

允许修改的文件：

- `src/utils/aiConnectionErrors.ts`
- 新增测试文件：`src/utils/aiConnectionErrors.test.ts`

禁止修改的文件：

- 所有设置页 UI 文件
- `electron/main.ts`
- 所有 `oct-gateway/` 文件

要求：

- 不要改提示文案，除非有明显错字或代码错误
- 先补测试
- 如果确实必须改生产代码，只允许做最小修复

完成标准：

- 关键错误映射有测试覆盖
- `vitest` 通过

必须执行的验证：

- `npx vitest run`

最终输出格式：

- 改动文件
- 测试覆盖点
- 是否改了生产逻辑
- 验证结果
- 风险说明

做完必须停止，不要继续下一任务。
```

---

## Task 5

### 名称

收口 beginner / advanced 共用 provider 展示辅助逻辑

### 适合直接发给 Cursor 的内容

```md
任务：整理设置页 beginner / advanced 模式之间共享的 provider 展示辅助逻辑，做无行为变化重构。

目标：

- 把重复的 provider 展示辅助逻辑抽出来
- 不改保存逻辑
- 不改 UI 行为

允许修改的文件：

- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`

如果确实需要新增 helper，允许新增：

- `src/ui/settings/providerViewHelpers.ts`

禁止修改的文件：

- `src/hooks/settings/useApiKeys.ts`
- `electron/main.ts`
- 所有 `oct-gateway/` 文件

要求：

- 只抽显示层辅助逻辑
- 不要动 `saveGatewayAndReconnect`
- 不要动 `testAIConnection`
- 如果发现会影响数据流，停止并汇报

完成标准：

- 重复展示辅助逻辑被抽取
- 页面行为保持不变
- 构建通过

必须执行的验证：

- `npx vitest run`
- `npm run build`

最终输出格式：

- 改动文件
- 抽取了哪些逻辑
- 明确没改哪些逻辑
- 验证结果
- 风险说明

做完必须停止，不要继续下一任务。
```

---

## Task 6

### 名称

统一 Google Base URL 清洗 helper

### 适合直接发给 Cursor 的内容

```md
任务：统一 Google OpenAI 兼容 base URL 清洗逻辑，但只处理纯函数层，不改大调用链。

目标：

- 找出仓库里重复的 Google base URL 清洗逻辑
- 抽成共享 helper
- 保持行为不变

允许修改的文件：

- `oct-gateway/config.js`
- `electron/main.ts`

如果需要新增共享文件，允许新增：

- `src/utils/googleBaseUrl.ts`
或
- `electron/shared/googleBaseUrl.ts`
或
- `oct-gateway/shared/googleBaseUrl.js`

但你只能选择一种最小方案，不要建立复杂新目录结构。

禁止修改的文件：

- 所有设置页文件
- `oct-gateway/index.js`
- `oct-gateway/ai.js`

要求：

- 只处理 URL 清洗纯函数
- 不要顺手重构别的 helper
- 不要修改调用时机
- 如果发现 CommonJS / TypeScript 共享方式不顺，停止并汇报，不要硬做大改

完成标准：

- 重复 URL 清洗逻辑统一到一个 helper 或一个主实现
- 现有调用行为不变
- 构建通过

必须执行的验证：

- `npx vitest run`
- `npm run build`

最终输出格式：

- 改动文件
- 重复点来自哪里
- 最终怎么统一的
- 验证结果
- 剩余技术债

做完必须停止，不要继续下一任务。
```

### 注意

这个任务虽然能给 Cursor，但风险比前几个高。建议你在 Cursor 真开始改之前，先看它有没有复述清楚边界。

---

## Task 7

### 名称

统一 agent permissions normalize 逻辑

### 适合直接发给 Cursor 的内容

```md
任务：统一 agent permissions 的 normalize 逻辑，只做纯函数去重，不改权限策略行为。

目标：

- 找出重复的 `normalizeAgentPermissions`
- 抽成共享实现或单一主实现
- 保持权限行为不变

允许修改的文件：

- `electron/main.ts`
- `oct-gateway/config.js`
- `oct-gateway/security/agent_permissions_policy.js`

禁止修改的文件：

- 所有设置页文件
- `oct-gateway/index.js`
- `src/ui/chat/ChatTab.v2.tsx`
- `src/hooks/useMessages.ts`

要求：

- 只去重 normalize 逻辑
- 不改权限默认值
- 不改权限判断流程
- 不改 UI 提示文案
- 如果需要改超过 3 个调用点以外的更多业务逻辑，停止并汇报

完成标准：

- normalize 逻辑不再重复维护
- 权限行为保持不变
- 构建通过

必须执行的验证：

- `npx vitest run`
- `npm run build`

最终输出格式：

- 改动文件
- 去重前重复点
- 去重后结构
- 明确没改哪些权限行为
- 验证结果
- 风险说明

做完必须停止，不要继续下一任务。
```

### 注意

这个任务必须人工 review diff，再决定是否继续。

---

## 暂时不要直接投喂给 Cursor 的任务

以下任务先不要直接给自动模式：

- “拆 `electron/main.ts`”
- “重构聊天主链路”
- “模块化 `src/hooks/useMessages.ts`”
- “大改 `oct-gateway/index.js`”
- “重构 `oct-gateway/gateway/slash.js` 全文件”
- “统一 Frontend/Electron/Gateway 配置架构”

原因很简单：

- 它们都需要模型自己判断架构
- 都涉及隐式行为和回归风险
- 低配自动模式很容易做成“代码看起来更整齐，但系统悄悄坏了”

---

## 推荐投喂顺序

如果你完全不懂代码，就按下面顺序一条条喂：

1. Task 3
2. Task 4
3. Task 1
4. Task 2
5. Task 5
6. Task 6
7. Task 7

这样最稳：

- 先补测试
- 再做前端小重构
- 最后才碰跨层共享 helper

---

## 你发给 Cursor 时的最短说法

你可以直接复制下面这种格式：

```md
请执行下面这一个任务，不要做额外重构。

[这里粘贴“总原则”]

[这里粘贴某一个 Task 的完整内容]
```

---

## 给你的最简单建议

如果你不想判断复杂度，就只先投喂这 3 个：

- Task 3
- Task 4
- Task 1

这是当前最稳的一组，最不容易把项目搞乱。

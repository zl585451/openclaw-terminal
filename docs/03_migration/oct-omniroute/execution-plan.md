# 施工包 1：外部 OmniRoute 接入基线

## 1. 阶段目标

本包只做一件事：

- 让 `OCT` 具备连接外部 `OmniRoute` 的能力

本包明确不做：

- 不切聊天主链
- 不切规划链路
- 不切工具安全通道
- 不删除旧 provider / fallback / router 逻辑
- 不改工具系统
- 不改记忆编排

本包完成后，`OCT` 应进入“新旧双路并存”的中间态：

- 旧链路仍可工作
- 新链路已接通
- 可以明确知道当前是否启用外部 `OmniRoute`

---

## 2. 前置条件

- 工作目录：`E:\windows-window\OpenClaw-Terminal`
- 已有主计划：`docs/03_migration/oct-omniroute/README.md`
- 外部 `OmniRoute` 已能独立运行，并提供可访问的 OpenAI 兼容入口
- 执行 AI 只负责实现本包，不擅自展开后续包

---

## 3. 允许修改

- `oct-gateway/services/*`
- `oct-gateway/runtime/*`
- `oct-gateway/transport/*`
- `oct-gateway/config.*`
- `electron/main.ts`
- `electron/preload.ts`
- `src/hooks/settings/*`
- `src/ui/settings/tabs/*`
- 与本包直接相关的测试文件

---

## 4. 禁止修改

- 禁止把聊天主流程强制切到外部 `OmniRoute`
- 禁止迁移或重写本地工具系统
- 禁止迁移或重写本地记忆编排
- 禁止删除 `providerRouter` / `llmClient` / 本地 fallback 代码
- 禁止清理普通用户设置页里的旧 provider/model/baseUrl 面板
- 禁止做大规模 UI 重构
- 禁止顺手推进施工包 2-5 的内容

---

## 5. 执行步骤

### Step 1：建立外部 OmniRoute 配置模型

新增一组明确独立于旧 provider 配置的外部网关配置项，至少包括：

- `OMNIROUTE_BASE_URL`
- `OMNIROUTE_API_KEY`
- `OMNIROUTE_CHAT_MODEL`
- `OMNIROUTE_PLAN_MODEL`
- `OMNIROUTE_TOOL_MODEL`
- `OCT_USE_EXTERNAL_OMNIROUTE`

要求：

- 与现有 `OCT_PROVIDER` / `OCT_MODEL` 并存
- 未开启 `OCT_USE_EXTERNAL_OMNIROUTE` 时，默认不改变旧行为
- 配置读取、保存、回填路径完整

### Step 2：实现统一外部网关适配器

新增一个面向 `OmniRoute` 的统一适配层，职责仅限：

- 接收逻辑能力名
- 组装请求目标
- 处理 base URL / API key
- 支持 streaming / non-streaming 基础调用
- 提供基础连通性检查

本适配器此阶段不接管全量主流程，只做“可用入口”。

### Step 3：建立逻辑能力到外部 alias 的静态映射

在本包中先把这三条逻辑能力定义清楚：

- `oct-chat`
- `oct-plan`
- `oct-tool-safe`

要求：

- 本包只建立映射能力，不强制切流量
- 允许默认映射到 `OMNIROUTE_CHAT_MODEL` / `PLAN` / `TOOL`
- 不再在新适配层里展开物理 provider 候选

### Step 4：给设置层增加外部 OmniRoute 基础入口

本包只增加最小配置入口，不做设置页收口。

本步要求：

- 能录入 `OmniRoute Base URL`
- 能录入 `OmniRoute API Key`
- 能查看外部模式是否开启
- 能录入 3 个逻辑能力对应的外部 model / alias

本步明确不要求：

- 不删除旧 provider 设置
- 不收口用户面板
- 不重做交互结构

### Step 5：增加状态检查与最小可观测性

需要让用户或开发者至少能看到：

- 当前是否启用外部 `OmniRoute`
- 当前外部 `Base URL`
- 当前 3 个逻辑能力映射值
- 连通性检查结果

这里的目标不是做完整运维面板，而是确保后续切换前有基本观测能力。

### Step 6：补最小测试

至少补这些测试：

- 配置读取与保存
- 外部模式开关启停
- 逻辑能力到外部 alias 的映射
- 连通性检查
- flag 关闭时旧行为不变

---

## 6. 验收标准

- [ ] `OCT` 能保存并读取外部 `OmniRoute` 配置
- [ ] 外部 `OmniRoute` 适配器已存在，并可独立完成最小调用或连通性检查
- [ ] `oct-chat` / `oct-plan` / `oct-tool-safe` 已有清晰外部映射配置位
- [ ] `OCT_USE_EXTERNAL_OMNIROUTE` 关闭时，旧行为不变
- [ ] 设置层已有最小外部 `OmniRoute` 入口
- [ ] 状态层可识别当前是否启用外部 `OmniRoute`
- [ ] 本地工具系统未被修改
- [ ] 本地记忆编排未被修改
- [ ] 旧 provider/fallback 代码未被删除

---

## 7. 测试要求

必须执行：

- 与新配置读写相关的测试
- 与适配器相关的单元测试
- 至少一次手工连通性验证

必须在完成简报中说明：

- 跑了哪些测试
- 哪些测试没跑
- 手工验证基于什么外部地址

---

## 8. 回滚方式

如果本包失败，回滚标准很简单：

- 关闭 `OCT_USE_EXTERNAL_OMNIROUTE`
- 旧链路继续作为主链路运行
- 保留新增配置字段，但不要求立即删除

本包不允许产生“开了新模式也用不了，关了旧模式也回不去”的状态。

---

## 9. 完成后简报格式

完成内容：
- 修改文件：
- 每个文件改了什么：

验证状态：
- 外部 `OmniRoute` 是否已接通：
- 外部模式开关是否可用：
- 3 条逻辑能力分别映射到什么：
- 跑了哪些测试：

未做内容：
- 哪些旧链路仍保留：
- 哪些切流工作留到施工包 2：

风险/备注：
- 当前实现还缺什么才能进入施工包 2：
- 哪些地方最需要后续重点审查：

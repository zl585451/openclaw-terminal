# OCT 系统提示词 v2.2.0

> 这是 OCT Terminal 的专属提示词系统，定义了产品默认人格模板、调度规则和前端交互协议。

---

## 📁 文件结构

```
docs/01_系统提示词/
├── README.md           ← 本文件（集成指南）
├── SOUL.md            ← 核心人格层（稳定）
├── AGENTS.md          ← 调度规则层（中频更新）
├── USER.md            ← 用户档案层（中频更新）
└── OCT_PROTOCOL.md    ← 交互协议层（高频迭代）
```

---

## 🎯 文件说明

### SOUL.md - 核心人格模板

**内容**：
- AI 的身份模板
- 核心价值观和原则
- 沟通风格和情绪感知
- emoji 使用规范
- 学习与记录机制

**更新频率**：低（除非人格设定变化）

### AGENTS.md - 调度规则

**内容**：
- QMD 记忆规则
- 四步判断法（对话 vs 任务）
- Spawn 子代理的规范和超时管理
- 错误恢复协议
- 上下文管理策略

**更新频率**：中（根据实际使用优化）

### USER.md - 用户档案模板

**内容**：
- 用户的基本信息和偏好
- OCT 界面输出规范摘要
- 工作习惯和技术栈
- 重要凭证位置索引
- 明确表达过的偏好和不喜欢的事

**更新频率**：中（AI 自动维护）

### OCT_PROTOCOL.md - 交互协议

**内容**：
- 自适应澄清（自然追问）规范
- 选项框渲染协议（OptionBox / Pill）
- 任务清单协议（TaskList）
- 表格使用规范
- 上下文管理协议
- 前端组件映射表

**更新频率**：高（产品迭代时同步更新）

---

## 🔧 OCT 集成步骤

### 步骤 1：修改提示词加载路径

在 OCT 代码中找到提示词加载逻辑（通常在 `electron/main.ts` 或 Gateway 配置中），修改为：

```javascript
// 旧路径（示例）
const promptPath = 'C:\\Users\\zilong_wu\\.openclaw\\workspace\\AGENTS.md';

// 新路径（OCT 内置）
const promptPath = path.join(__dirname, '../docs/01_系统提示词');
```

### 步骤 2：合并提示词文件

在发送给 Gateway 之前，需要将四个文件合并为完整的 system prompt：

```javascript
const fs = require('fs');
const path = require('path');

function loadSystemPrompt() {
  const promptDir = path.join(__dirname, '../docs/01_系统提示词');
  
  const files = [
    'SOUL.md',
    'AGENTS.md',
    'USER.md',
    'OCT_PROTOCOL.md'
  ];
  
  let fullPrompt = '';
  
  for (const file of files) {
    const filePath = path.join(promptDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    fullPrompt += `# ${file}\n\n${content}\n\n`;
  }
  
  return fullPrompt;
}

// 使用
const systemPrompt = loadSystemPrompt();
```

### 步骤 3：发送到 Gateway

在 `sendChatMessage` 调用时，将合并后的 system prompt 传入：

```javascript
await chat.send(sessionKey, message, {
  systemPrompt: systemPrompt,
  // ...其他配置
});
```

### 步骤 4：前端组件联动

前端通过解析 AI 回复中的成对标签自动渲染交互组件：
- `[pills]...[/pills]` → 胶囊按钮
- `[checkbox]...[/checkbox]` → 复选框
- `[question]...[/question]` → 问题卡片
- `[tasklist]...[/tasklist]` → 任务清单

详见 OCT_PROTOCOL.md 渲染协议章节。

---

## 🧪 测试验证

### 测试 1：思维引导触发

**输入**：
```
我有点纠结，不知道 OCT 应该先做哪个功能
```

**预期输出**：
- AMY 回复包含自适应澄清（自然追问）
- 回复中嵌入 `[pills]` 或 `[question]` 标签供少爷一键回复/填充

### 测试 2：选项框渲染

**输入**：
```
OCT 接下来应该优先做什么？
```

**预期输出**：
- AMY 回复包含 `- [ ] 选项` 列表
- ≤4 个选项时渲染为横排胶囊按钮
- >4 个选项时渲染为可翻页 checkbox 列表

### 测试 3：任务清单渲染

**输入**：
```
帮我列出 OCT 发布前需要做的事
```

**预期输出**：
- AMY 回复包含 `任务清单：` 标题
- 渲染为可勾选清单
- 全勾完显示庆祝动画

### 测试 4：表格使用

**输入**：
```
对比一下 qwen3.5-plus 和 deepseek-chat 的区别
```

**预期输出**：
- 使用精简表格展示对比（≤8 行，≤4 列）
- 表格内容清晰直观
- 不过度使用表格

---

## 📊 版本管理

### 版本号格式

`MAJOR.MINOR.PATCH`
- **MAJOR**：架构升级（如新增协议模块）
- **MINOR**：功能新增（如新增 ThinkMode 类型）
- **PATCH**：文字优化/bug 修复

### 当前版本

**v2.2.0** (2026-04-06) - 人格配置分层

**变更**：
- system prompt 改为“产品默认人格 + 用户可配置层”
- 模板保留 `{{AI_NAME}}`、`{{USER_NAME}}`，运行时替换
- 发布版默认不再绑定 `AMY / 少爷`
- 新增 OCT_PROTOCOL.md（独立管理前端交互协议）
- 移除飞书卡片相关规则
- 优化中文表达（技术术语 → 自然语言）
- 明确表格使用规范
- 新增思维模式自我迭代机制
- 建立上下文管理协议

### 回滚策略

- 保留最近 3 个版本
- 重大更新前先备份
- 用户反馈问题后 24 小时内可回滚

---

## 🎯 设计原则

### 1. 分层架构

- **SOUL.md**：核心人格（稳定层）
- **AGENTS.md**：调度规则（中间层）
- **USER.md**：用户档案（动态层）
- **OCT_PROTOCOL.md**：交互协议（迭代层）

**好处**：
- 解耦：OCT 界面升级不影响核心人格
- 可移植：SOUL.md 可复用到其他项目
- 易测试：OCT 协议可单独做 A/B 测试

### 2. 简洁优先

- 日常对话清晰简短
- 该用表格时才用表格
- 不过度确认、不废话

### 3. 用户无感

- 思维模式等高级功能隐藏在后台
- 不扰乱用户，不暴露技术细节
- 自我迭代提示词的触发规则

### 4. 直观呈现

- 让复杂信息一目了然
- 但不炫技，不为炫酷用表格
- 以用户理解为目的

### 5. 人格配置分层

- **产品默认层**：公共规则、诚实边界、交互协议
- **用户配置层**：AI 名称、用户称呼、风格预设
- **记忆层**：用户自己的 Nocturne 身份记忆与长期偏好

从 2026-04-06 起，发布版不应再把私人化昵称直接写死在公共模板中。

---

## 🔮 未来规划

### v2.1.0 - 自我迭代增强

- [ ] 建立触发词白名单/黑名单机制
- [ ] 每周自动复盘触发准确率
- [ ] 用户反馈自动优化阈值

### v2.2.0 - 上下文优化

- [ ] 智能上下文截断（保留关键信息）
- [ ] 话题切换自动清理
- [ ] 记忆注入可配置

### v3.0.0 - 多模态交互

- [ ] 支持图片理解
- [ ] 支持语音交互
- [ ] 支持手势识别（未来）

---

## 📝 维护指南

### AMY 自动维护

AMY 应该在以下情况更新提示词：

1. **少爷明确表达偏好** → 更新 `USER.md`
2. **发现新的工作习惯** → 更新 `USER.md` 或 `MEMORY.md`
3. **纠正错误** → 更新对应文件并记录到 `.learnings/`
4. **功能需求** → 更新 `OCT_PROTOCOL.md`

### 手动维护

少爷或开发者可以：

1. 直接编辑文件
2. 提交 git 版本管理
3. 重启 Gateway 生效

---

## 🆘 故障排查

### 问题 1：提示词不生效

**检查**：
1. 文件路径是否正确
2. Gateway 是否重启
3. 文件格式是否为 UTF-8

**解决**：
```bash
# 重启 Gateway
# 检查日志
tail -f ~/.openclaw/logs/gateway.log
```

### 问题 2：前端组件不触发

**检查**：
1. 协议标记格式是否正确
2. 前端检测逻辑是否实现
3. 组件是否已注册

**解决**：
```typescript
// 调试代码
console.log('Message:', message);
console.log('Clarification tags:', { pills: message.includes('[pills]'), question: message.includes('[question]') });
```

### 问题 3：表格渲染异常

**检查**：
1. Markdown 表格格式是否正确
2. 前端 Markdown 渲染器是否支持表格
3. 是否超过行数限制

**解决**：
- 使用标准 Markdown 表格格式
- 检查 Tailwind 样式是否冲突

---

## 📚 相关文档

- [OCT 快速上手指南](../02_功能设计/OCT 快速上手指南.md)
- [子代理对话系统 v2](../02_功能设计/子代理对话系统_v2.md)
- [CoT 功能介绍](../02_功能设计/CoT 功能介绍.md)
- [AGENT 回复规范](../03_技术规范/AGENT 回复规范.md)

---

## 🦞 OCT Terminal · 让 AI 更懂你

**版本**: v2.0.0  
**更新日期**: 2026-03-13  
**作者**: 少爷 & AMY

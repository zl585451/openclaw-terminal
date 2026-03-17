# Markdown 交互协议方案调研报告

> **调研目标**：为 OCT Terminal 寻找消息渲染模式指定方案  
> **调研时间**：2026-03-14  
> **调研者**：子代理（Markdown 交互协议方案搜索）

---

## 方案一：Markdown Directives（指令语法）

### 格式示例

```markdown
<!-- @render: pills -->
- 选项一
- 选项二
- 选项三

<!-- @render: task-list -->
- [ ] 任务一
- [ ] 任务二
```

或

```markdown
:::render{mode="pills"}
- 选项一
- 选项二
:::

:::render{mode="task-list"}
- [ ] 任务一
- [ ] 任务二
:::
```

### 优点
- ✅ 语义清晰，易于解析
- ✅ 不干扰正常 Markdown 渲染（降级为注释/容器）
- ✅ 可扩展性强，支持多种渲染模式
- ✅ 社区有类似实践（VuePress、VitePress 的 custom containers）

### 缺点
- ❌ 需要自定义解析器
- ❌ 纯文本查看时有冗余信息

### 是否适合 OCT
**非常适合** — 与 OCT 现有前端组件（OptionBox/TaskList/SocraticPanel）天然匹配

### 推荐指数
⭐⭐⭐⭐⭐

---

## 方案二：Frontmatter 元数据

### 格式示例

```markdown
---
render_mode: pills
options_count: 3
---

这是正文内容...

- 选项一
- 选项二
- 选项三
```

或

```markdown
---
oct:
  type: task-list
  title: "今日待办"
  allow_multiple: false
---

任务内容...
```

### 优点
- ✅ 标准化程度高（Jekyll/Hugo/Next.js 都用）
- ✅ 与正文完全分离，不干扰阅读
- ✅ 支持复杂元数据（嵌套对象、数组）
- ✅ 现有解析库成熟（gray-matter 等）

### 缺点
- ❌ 只能放在文件/消息开头，不适合内联多段不同渲染
- ❌ 单条消息只能有一种渲染模式
- ❌ 对短消息来说 overhead 较大

### 是否适合 OCT
**适合** — 适合整条消息统一渲染模式的场景，但不适合混合渲染

### 推荐指数
⭐⭐⭐⭐

---

## 方案三：Discord/Slack Block Kit（借鉴思路）

### 格式示例（Discord）

```json
{
  "content": "请选择：",
  "components": [
    {
      "type": 1,
      "components": [
        {
          "type": 2,
          "style": 1,
          "label": "选项一",
          "custom_id": "opt_1"
        },
        {
          "type": 2,
          "style": 1,
          "label": "选项二",
          "custom_id": "opt_2"
        }
      ]
    }
  ]
}
```

### 格式示例（Slack Block Kit）

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "请选择："
      },
      "accessory": {
        "type": "button",
        "text": {
          "type": "plain_text",
          "text": "选项一"
        },
        "action_id": "opt_1"
      }
    }
  ]
}
```

### 优点
- ✅ 工业级方案，经过大规模验证
- ✅ 支持丰富的交互组件（按钮、下拉、日期选择等）
- ✅ 结构清晰，类型安全

### 缺点
- ❌ 需要 JSON 格式，失去 Markdown 的可读性
- ❌ 过于复杂，OCT 当前需求不需要这么重的方案
- ❌ 无法在纯文本环境中友好显示

### 是否适合 OCT
**不适合** — OCT 坚持 Markdown 优先，JSON 方案违背设计哲学

### 推荐指数
⭐⭐

---

## 方案四：自定义短标签（HTML-like）

### 格式示例

```markdown
<render mode="pills">
- 选项一
- 选项二
- 选项三
</render>

<render mode="task-list" title="今日待办">
- [ ] 任务一
- [ ] 任务二
</render>

<render mode="think" type="decision">
需要深度思考的内容...
</render>
```

或更简洁：

```markdown
[pills]
- 选项一
- 选项二
[/pills]

[task-list]
- [ ] 任务一
- [ ] 任务二
[/task-list]
```

### 优点
- ✅ 简洁直观，学习成本低
- ✅ 易于解析（正则即可）
- ✅ 支持嵌套和属性
- ✅ 降级友好（未知标签可忽略或原样显示）

### 缺点
- ❌ 非标准，需要文档说明
- ❌ 与 HTML 标签可能冲突（如果用尖括号）

### 是否适合 OCT
**非常适合** — 比 Directives 更简洁，适合 OCT 的轻量级定位

### 推荐指数
⭐⭐⭐⭐⭐

---

## 方案五：特殊 Markdown 语法扩展

### 格式示例

```markdown
> [!PILLS]
> - 选项一
> - 选项二

> [!TASK-LIST]
> - [ ] 任务一
> - [ ] 任务二

> [!THINK:decision]
> 需要深度思考的内容...
```

借鉴 GitHub Alerts 语法：

```markdown
> [!NOTE]
> 提示信息

> [!TIP]
> 建议内容
```

### 优点
- ✅ 基于标准 Markdown 引用语法，兼容性好
- ✅ GitHub/GitLab 已有类似实践（Alerts）
- ✅ 视觉上有天然区分（引用块样式）
- ✅ 纯文本查看时也有清晰的视觉层次

### 缺点
- ❌ 只能用于块级内容
- ❌ 引用块样式可能与实际设计冲突
- ❌ 嵌套支持有限

### 是否适合 OCT
**较适合** — 可作为备选方案，但引用块样式可能限制设计自由度

### 推荐指数
⭐⭐⭐⭐

---

## 方案六：Emoji/符号前缀标记

### 格式示例

```markdown
🎯 请选择：
▢ 选项一
▢ 选项二
▢ 选项三

📋 任务清单：
☐ 任务一
☐ 任务二

💭 思维引导 [decision]：
需要思考的内容...
```

### 优点
- ✅ 完全兼容标准 Markdown
- ✅ 人类可读性最佳
- ✅ 无需任何解析器，纯文本友好
- ✅ Emoji 本身就有语义提示

### 缺点
- ❌ 依赖前端智能识别（需要启发式解析）
- ❌ 不够精确，可能有歧义
- ❌ 无法传递复杂参数（如 allow_multiple、callback 等）

### 是否适合 OCT
**部分适合** — 可作为**降级方案**或**辅助识别**，但不建议作为主协议

### 推荐指数
⭐⭐⭐

---

## 综合对比表

| 方案 | 标准化 | 解析难度 | 可读性 | 扩展性 | OCT 适配度 | 推荐指数 |
|------|--------|---------|--------|--------|-----------|---------|
| Directives | 中 | 低 | 高 | 高 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Frontmatter | 高 | 低 | 中 | 中 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Block Kit | 高 | 中 | 低 | 极高 | ⭐⭐ | ⭐⭐ |
| 自定义标签 | 低 | 极低 | 高 | 高 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Alerts 扩展 | 中 | 低 | 高 | 中 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Emoji 前缀 | 低 | 高 | 极高 | 低 | ⭐⭐⭐ | ⭐⭐⭐ |

---

## 🎯 最终推荐

### 首选方案：**自定义短标签（方案四）**

```markdown
[pills]
- 选项一
- 选项二
- 选项三
[/pills]

[task-list]
- [ ] 任务一
- [ ] 任务二
[/task-list]

[think mode="decision"]
需要深度思考的内容...
[/think]
```

**理由**：
1. 简洁直观，学习成本最低
2. 解析简单（正则即可），性能高
3. 支持属性和嵌套，扩展性强
4. 降级友好，未知标签可原样显示
5. 与 OCT 现有组件（OptionBox/TaskList/SocraticPanel）完美对应

### 备选方案：**Markdown Directives（方案一）**

```markdown
<!-- @render: pills -->
- 选项一
- 选项二

<!-- @render: task-list -->
- [ ] 任务一
```

**适用场景**：如果团队更偏好注释风格，或需要与现有工具链（如 VuePress）兼容

---

## 📋 实施建议

### 1. 协议定义文件

在 OCT 仓库创建 `docs/04_message_protocol/RENDER_PROTOCOL.md`，定义：
- 所有支持的标签类型
- 每个标签的属性说明
- 格式示例和边界情况
- 降级策略

### 2. 解析器实现

位置建议：`src/core/parsers/renderParser.ts`

```typescript
interface RenderBlock {
  type: 'pills' | 'task-list' | 'think' | 'text';
  mode?: string;
  content: string;
  attributes: Record<string, string>;
}

function parseRenderBlocks(markdown: string): RenderBlock[] {
  // 正则提取 [tag attr="value"]...[/tag] 结构
}
```

### 3. 前端渲染映射

| 标签 | 前端组件 | 渲染逻辑 |
|------|---------|---------|
| `[pills]` | `<OptionBox>` | ≤4 项横排胶囊，>4 项 checkbox 列表 |
| `[task-list]` | `<TaskList>` | 可勾选清单，全勾完庆祝动画 |
| `[think mode="xxx"]` | `<SocraticPanel>` | 根据 mode 加载对应引导模板 |
| `[text]` | `<Markdown>` | 标准 Markdown 渲染 |

### 4. AMY 输出规范更新

更新 `SOUL.md` 和 `USER.md`，明确：
- 什么场景用什么标签
- 标签属性如何填写
- 禁止混用多个标签导致正文丢失

---

## 🔗 参考资源

1. **Markdown Directives** — https://github.com/remarkjs/remark-directive
2. **GitHub Alerts** — https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts
3. **Discord Components** — https://discord.com/developers/docs/interactions/message-components
4. **Slack Block Kit** — https://api.slack.com/block-kit
5. **Frontmatter 规范** — https://jekyllrb.com/docs/front-matter/

---

**调研完成** ✅  
**耗时**：约 8 分钟  
**结论**：推荐「自定义短标签」方案，简洁、可扩展、与 OCT 架构完美契合

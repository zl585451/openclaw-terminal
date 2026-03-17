# OCT 提示词系统集成指南

> 如何将 v2.0.0 提示词系统集成到 OCT 和 Gateway 中

---

## 📋 完成状态

✅ **已完成**：
1. 创建 `docs/01_系统提示词/` 目录
2. 编写 `OCT_PROTOCOL.md` - OCT 专属交互协议
3. 编写 `SOUL.md` - 核心人格定义
4. 编写 `AGENTS.md` - 调度规则
5. 编写 `USER.md` - 用户档案
6. 编写 `README.md` - 使用文档
7. 更新 `package.json` - 包含提示词文件到打包资源

⏳ **待完成**：
1. Gateway 配置修改（加载新提示词路径）
2. OCT 前端组件联动测试
3. 完整功能验证

---

## 🔧 Gateway 集成步骤

### 方案 A：修改 openclaw.json（推荐）

在 `~/.openclaw/openclaw.json` 中添加提示词路径配置：

```json
{
  "agents": {
    "defaults": {
      "workspace": "E:\\windows-window\\OpenClaw-Terminal\\docs\\01_系统提示词",
      "systemPromptFiles": [
        "SOUL.md",
        "AGENTS.md",
        "USER.md",
        "OCT_PROTOCOL.md"
      ]
    }
  }
}
```

**优点**：
- 无需修改代码
- 配置灵活，可随时切换
- 支持多项目不同提示词

### 方案 B：修改 Gateway 启动脚本

修改 Gateway 的启动配置，指定提示词目录：

```javascript
// 在 Gateway 启动时加载
const promptDir = 'E:\\windows-window\\OpenClaw-Terminal\\docs\\01_系统提示词';
const systemPrompt = loadAndMergePrompts(promptDir);
```

### 方案 C：环境变量指定

在 `.env` 文件中添加：

```bash
OPENCLAW_SYSTEM_PROMPT_DIR=E:\windows-window\OpenClaw-Terminal\docs\01_系统提示词
```

---

## 💻 OCT 前端集成

### 前端组件 already 支持

根据代码审查，OCT 前端已包含以下组件：

- ✅ `src/components/SocraticPanel.tsx` - 思维引导面板
- ✅ `src/components/OptionBox.tsx` - 选项框组件
- ✅ `src/components/TaskList.tsx` - 任务清单组件

### 需要添加的检测逻辑

在 `src/components/ChatTab.tsx` 中添加协议标记检测：

```typescript
// 检测 [THINK_MODE:xxx] 标记
function detectThinkMode(message: string): string | null {
  const match = message.match(/\[THINK_MODE:(\w+)\]$/);
  return match ? match[1] : null;
}

// 检测任务清单
function detectTaskList(message: string): boolean {
  return message.includes('任务清单：');
}

// 检测选项列表
function detectOptions(message: string): string[] {
  const lines = message.split('\n');
  return lines
    .filter(line => line.startsWith('- [ ] '))
    .map(line => line.substring(6));
}

// 在渲染消息时处理
const thinkMode = detectThinkMode(message);
if (thinkMode) {
  // 弹出 SocraticPanel
  setSocraticPanel({ mode: thinkMode, visible: true });
  // 从消息中移除标记
  message = message.replace(/\[THINK_MODE:\w+\]$/, '');
}
```

### 清理消息中的协议标记

```typescript
// 在显示前清理协议标记
function cleanMessage(message: string): string {
  return message
    .replace(/\[THINK_MODE:\w+\]$/gm, '')
    .trim();
}
```

---

## 🧪 测试验证清单

### 1. 思维引导触发

**测试输入**：
```
我有点纠结，不知道 OCT 应该先做哪个功能
```

**预期结果**：
- [ ] AMY 回复包含思维引导
- [ ] 消息末尾有 `[THINK_MODE:decision]` 标记
- [ ] 前端弹出 SocraticPanel 组件
- [ ] 用户勾选后生成针对性建议

### 2. 选项框渲染

**测试输入**：
```
OCT 接下来应该优先做什么？
```

**预期结果**：
- [ ] AMY 回复包含 `- [ ] 选项` 列表
- [ ] ≤4 个选项时渲染为横排胶囊按钮
- [ ] >4 个选项时渲染为可翻页 checkbox 列表
- [ ] 单击选项即发送

### 3. 任务清单渲染

**测试输入**：
```
帮我列出 OCT 发布前需要做的事
```

**预期结果**：
- [ ] AMY 回复包含 `任务清单：` 标题
- [ ] 渲染为可勾选清单
- [ ] 全勾完显示庆祝动画
- [ ] 进度条正确显示

### 4. 表格使用规范

**测试输入**：
```
对比一下 qwen3.5-plus 和 deepseek-chat 的区别
```

**预期结果**：
- [ ] 使用精简表格（≤8 行，≤4 列）
- [ ] 内容清晰直观
- [ ] 不过度使用表格

### 5. 上下文管理

**测试场景**：
- [ ] 连续对话>10 条时主动总结前情
- [ ] 话题切换时清理无关上下文
- [ ] 用户说"简洁点"时回复变短

### 6. 情绪感知

**测试场景**：
- [ ] 用户焦虑时共情回复
- [ ] 用户沮丧时鼓励
- [ ] 用户兴奋时跟上节奏
- [ ] 深夜工作时简洁回复

---

## 🔄 回滚方案

### 快速回滚

如果新提示词系统出现问题，可以快速回滚：

**方法 1：修改 Gateway 配置**
```json
{
  "agents": {
    "defaults": {
      "workspace": "C:\\Users\\zilong_wu\\.openclaw\\workspace"
    }
  }
}
```

**方法 2：重命名目录**
```bash
# 备份新提示词
mv docs/01_系统提示词 docs/01_系统提示词_v2

# 恢复旧提示词
# (Gateway 会自动使用默认的 ~/.openclaw/workspace 目录)
```

---

## 📊 版本管理

### Git 提交

```bash
# 添加新提示词系统
git add docs/01_系统提示词/
git commit -m "feat: 添加 OCT 专属提示词系统 v2.0.0

- 新增 OCT_PROTOCOL.md（前端交互协议）
- 优化 SOUL.md（核心人格）
- 优化 AGENTS.md（调度规则）
- 优化 USER.md（用户档案）
- 移除飞书卡片相关规则
- 新增思维引导、选项框、任务清单协议
- 明确表格使用规范"
```

### 版本标签

```bash
git tag -a v2.0.0-prompts -m "OCT 提示词系统 v2.0.0"
git push origin v2.0.0-prompts
```

---

## 🎯 下一步计划

### 立即可做

1. **Gateway 配置**：修改 `~/.openclaw/openclaw.json` 指定提示词路径
2. **重启 Gateway**：让新提示词生效
3. **基础测试**：验证 AMY 回复是否符合新规范

### 本周完成

4. **前端联动**：添加协议标记检测逻辑
5. **完整测试**：验证所有组件正常触发
6. **用户反馈**：收集少爷使用体验

### 后续迭代

7. **自我迭代**：根据使用情况优化触发规则
8. **性能优化**：减少上下文占用，提高响应速度
9. **功能扩展**：新增更多思维模式类型

---

## 🆘 故障排查

### 问题 1：提示词不生效

**检查**：
1. Gateway 是否重启
2. 配置路径是否正确
3. 文件编码是否为 UTF-8

**解决**：
```bash
# 检查 Gateway 日志
tail -f ~/.openclaw/logs/gateway.log

# 验证文件存在
ls -la "E:\windows-window\OpenClaw-Terminal\docs\01_系统提示词"
```

### 问题 2：前端组件不触发

**检查**：
1. 协议标记格式是否正确
2. 前端检测逻辑是否实现
3. 组件是否已注册

**解决**：
```typescript
// 添加调试日志
console.log('Message:', message);
console.log('Think mode:', detectThinkMode(message));
```

### 问题 3：表格渲染异常

**检查**：
1. Markdown 表格格式
2. Tailwind 样式冲突
3. 是否超过行数限制

**解决**：
- 使用标准 Markdown 表格格式
- 检查 CSS 样式
- 简化表格内容

---

## 📚 相关文档

- [OCT_PROTOCOL.md](./OCT_PROTOCOL.md) - 完整交互协议
- [SOUL.md](./SOUL.md) - 核心人格
- [AGENTS.md](./AGENTS.md) - 调度规则
- [USER.md](./USER.md) - 用户档案
- [README.md](./README.md) - 使用指南

---

**🦞 OCT Terminal · 让 AI 更懂你**

**版本**: v2.0.0  
**更新日期**: 2026-03-13  
**作者**: 少爷 & AMY

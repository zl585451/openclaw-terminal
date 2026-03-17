# OCT Prompt System v2.0.1 Debug Task List

> **Debug Time**: 2026-03-14 Night  
> **Debug Team**: Young Master & AMY  
> **Goal**: Ensure all features work correctly, release v0.1.7 after completion

---

## 📋 Debug Principles

1. **Test while modifying** - Optimize immediately when issues are found
2. **Record all issues** - Don't miss any details
3. **User perspective** - Start from customer usage scenarios
4. **Release after completion** - All users benefit

---

## ✅ Debug Task List

### Task 1: Question Format Optimization 🟡 Modified, Waiting Test

**Issue Description**:
- AMY asks multiple questions at once, users don't know which to answer
- Need to manually type after clicking question, poor experience

**Target Effect**:
- Ask only 1 key question at a time
- Provide 2-4 options for user to click
- Follow up with next question based on answer (decision tree mode)
- Options render as clickable buttons

**Modification Location**:
- `OCT_PROTOCOL.md` - Thinking Guidance System → 1.4 Question Format ✅ Added
- `src/components/ChatTab.tsx` - Support streaming parsing of option boxes ✅ Modified

**Test Cases**:
```
Test 1: User says "I'm a bit confused"
Expected: AMY asks only 1 question + 3 options
          Options render as clickable pills (≤4 in horizontal row)
          Click auto-sends

Test 2: After user answers option
Expected: AMY follows up with next question based on answer
```

**Current Status**: ✅ Modified → 🟡 Waiting Test → 🟢 To Verify

**Actual Performance**:
- [x] Modification Time: 2026-03-14 01:45 (Prompt)
- [x] Code Modification: 2026-03-14 02:00 (ChatTab.tsx)
- [ ] Test Result: To test
- [ ] Issue Record: To supplement

**Remarks**:
1. Rules written to OCT_PROTOCOL.md v2.0.1
2. ChatTab now supports streaming option box parsing
3. Need to restart Gateway + refresh OCT interface

---

### 任务 2：选项框渲染测试 ⏳ 待测试

**目标效果**：
- AMY 输出 `- [ ] 选项` 格式
- OCT 前端渲染为可点击按钮
- ≤4 个选项时横排胶囊按钮
- >4 个选项时可翻页 checkbox 列表

**修改位置**：
- `OCT_PROTOCOL.md` - 选项框渲染协议
- （可能需要）`src/components/OptionBox.tsx`

**测试用例**：
```
测试 1：AMY 给 3 个选项
预期：横排胶囊按钮，点击即发送

测试 2：AMY 给 6 个选项
预期：可翻页 checkbox 列表
```

**当前状态**：⚪ 未开始 → 🔴 测试中 → 🟢 测试通过

**实际表现**：
- [ ] 测试时间：
- [ ] 测试结果：
- [ ] 问题记录：

---

### 任务 3：思维引导触发测试 ⏳ 待测试

**目标效果**：
- 用户说"纠结/迷茫/不知道"时自动触发
- 前端弹出 SocraticPanel 组件
- 根据类型加载不同模板

**修改位置**：
- `OCT_PROTOCOL.md` - 思维引导系统
- `src/components/SocraticPanel.tsx`（如需调整）

**测试用例**：
```
测试 1：用户说"我有点迷茫"
预期：触发 [THINK_MODE:confusion]

测试 2：用户说"不知道选哪个"
预期：触发 [THINK_MODE:decision]

测试 3：用户说"事情太多"
预期：触发 [THINK_MODE:priority]
```

**当前状态**：⚪ 未开始 → 🔴 测试中 → 🟢 测试通过

**实际表现**：
- [ ] 测试时间：
- [ ] 测试结果：
- [ ] 问题记录：

---

### 任务 4：任务清单渲染测试 ⏳ 待测试

**目标效果**：
- AMY 输出"任务清单："标题
- OCT 渲染为可勾选清单
- 全勾完显示庆祝动画

**修改位置**：
- `OCT_PROTOCOL.md` - 任务清单协议
- `src/components/TaskList.tsx`（如需调整）

**测试用例**：
```
测试 1：用户说"帮我列个计划"
预期：输出"任务清单：" + 可勾选列表

测试 2：用户勾选所有任务
预期：显示庆祝动画 🎉
```

**当前状态**：⚪ 未开始 → 🔴 测试中 → 🟢 测试通过

**实际表现**：
- [ ] 测试时间：
- [ ] 测试结果：
- [ ] 问题记录：

---

### 任务 5：表格使用规范测试 ⏳ 待测试

**目标效果**：
- 数据对比时使用表格（≤8 行，≤4 列）
- 简单信息用 emoji 列表
- 不滥用表格

**修改位置**：
- `OCT_PROTOCOL.md` - 表格使用规范

**测试用例**：
```
测试 1：用户问"对比 A 和 B"
预期：使用精简表格

测试 2：用户问"今天有什么安排"
预期：用 emoji 列表，不用表格
```

**当前状态**：⚪ 未开始 → 🔴 测试中 → 🟢 测试通过

**实际表现**：
- [ ] 测试时间：
- [ ] 测试结果：
- [ ] 问题记录：

---

### 任务 6：上下文管理测试 ⏳ 待测试

**目标效果**：
- 连续对话>10 条时主动总结
- 用户说"简洁点"时回复变短
- 深夜自动简洁模式

**修改位置**：
- `OCT_PROTOCOL.md` - 上下文管理协议

**测试用例**：
```
测试 1：连续对话 15 轮
预期：AMY 主动总结前情

测试 2：用户说"太长了"
预期：下次回复<100 字

测试 3：深夜 23:00 后
预期：默认简洁回复
```

**当前状态**：⚪ 未开始 → 🔴 测试中 → 🟢 测试通过

**实际表现**：
- [ ] 测试时间：
- [ ] 测试结果：
- [ ] 问题记录：

---

### 任务 7：情绪感知测试 ⏳ 待测试

**目标效果**：
- 用户焦虑时共情回复
- 用户沮丧时鼓励
- 用户兴奋时跟上节奏

**修改位置**：
- `SOUL.md` - 情绪感知与语气自适应

**测试用例**：
```
测试 1：用户说"烦死了"
预期：先安慰，再解决问题

测试 2：用户说"搞定了！牛逼！"
预期：活跃回应，跟上节奏

测试 3：用户说"算了，没用"
预期：肯定已做到的部分
```

**当前状态**：⚪ 未开始 → 🔴 测试中 → 🟢 测试通过

**实际表现**：
- [ ] 测试时间：
- [ ] 测试结果：
- [ ] 问题记录：

---

### 任务 8：错误恢复测试 ⏳ 待测试

**目标效果**：
- 失败时提供替代方案
- 告知用户发生了什么
- 不沉默、不掩盖

**修改位置**：
- `AGENTS.md` - 错误恢复协议

**测试用例**：
```
测试 1：模拟文件不存在
预期：告知用户 + 提供替代方案

测试 2：模拟超时
预期：说明原因 + 建议重试
```

**当前状态**：⚪ 未开始 → 🔴 测试中 → 🟢 测试通过

**实际表现**：
- [ ] 测试时间：
- [ ] 测试结果：
- [ ] 问题记录：

---

## 📊 调试进度总览

| 任务 | 状态 | 优先级 | 开始时间 | 完成时间 | 备注 |
|------|------|--------|---------|---------|------|
| 1. 提问规范优化 | 🔴 测试中，发现问题 | P0 | 01:30 | - | 思维引导触发过度，需调整 |
| 2. 选项框渲染 | ⚪ 未开始 | P0 | - | - | 核心功能 |
| 3. 思维引导触发 | ⚪ 未开始 | P0 | - | - | 核心功能 |
| 4. 任务清单渲染 | ⚪ 未开始 | P1 | - | - | - |
| 5. 表格使用规范 | ⚪ 未开始 | P1 | - | - | - |
| 6. 上下文管理 | ⚪ 未开始 | P2 | - | - | - |
| 7. 情绪感知 | ⚪ 未开始 | P2 | - | - | - |
| 8. 错误恢复 | ⚪ 未开始 | P2 | - | - | - |

**图例**：
- ⚪ 未开始
- 🔴 进行中/待修改
- 🟡 修改后测试
- 🟢 测试通过

---

## 🎯 调试流程

### 每个任务的调试步骤

```
1. 阅读任务描述
   ↓
2. 查看当前表现（在 OCT 中测试）
   ↓
3. 记录问题
   ↓
4. 修改提示词文件
   ↓
5. 重启 Gateway（如需）
   ↓
6. 再次测试
   ↓
7. 通过后标记为🟢
   ↓
8. 继续下一个任务
```

---

## 📝 问题记录本

### 发现的问题

**问题 1**：AMY 一次性问多个问题
- **发现时间**：2026-03-14 01:19
- **影响**：用户不知道回答哪个，体验差
- **解决方案**：在 OCT_PROTOCOL.md 中添加"提问规范"
- **状态**：待解决

**问题 2**：[待补充]

---

## 🚀 发布计划

### 发布 v0.1.7 检查清单

- [ ] 所有 P0 任务测试通过
- [ ] 所有 P1 任务测试通过
- [ ] 更新日志已编写
- [ ] Git 提交完成
- [ ] 版本号已更新
- [ ] GitHub Release 已创建
- [ ] 安装包已构建（Windows/Mac/Linux）

### 更新日志草稿

```markdown
## v0.1.7 (2026-03-14) - 提示词系统优化

### ✨ 新功能
- 新增提问规范：每次只问一个关键问题
- 决策树模式：根据用户答案追问

### 🐛 Bug 修复
- 修复 AMY 一次性问多个问题的问题
- 优化选项框交互体验

### 📝 文档更新
- 更新 OCT_PROTOCOL.md
- 新增调试任务清单
```

---

## 💡 调试小贴士

### 快速重启 Gateway
1. 在 OCT 右侧面板找到"Gateway 日志"
2. 点击"停止"按钮
3. 等待 3 秒
4. 点击"启动"按钮

### 快速测试对话
```
测试提问规范："我有点纠结，不知道怎么办"
测试选项框："OCT 接下来应该做什么？"
测试思维引导："我很迷茫"
测试任务清单："帮我列个计划"
测试表格："对比一下 A 和 B"
测试简洁模式："太长了，简洁点"
测试情绪感知："烦死了"
```

### 查看 Gateway 日志
```bash
# 日志位置
C:\Users\zilong_wu\.openclaw\logs\gateway.log

# 实时查看
tail -f C:\Users\zilong_wu\.openclaw\logs\gateway.log
```

---

**调试开始时间**: 2026-03-14 01:30  
**预计完成时间**: 2026-03-14 03:00  

**加油！让 OCT 变得更好！💪**

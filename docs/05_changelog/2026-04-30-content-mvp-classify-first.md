# 2026-04-30 内容MVP - 分类切分优先架构改造

## 背景

当前 `textRewriterAgent` 采用"分类+改写一体化"方案，模型同时做两件事，注意力分散，导致：
1. CV 分配错误：第三人称动作/心理描写被错标为角色对白
2. 模型自检语句被当成角色名进入 speaker 列表
3. Token 浪费：输出量大，长章节容易超时

## 改造内容

### 新增文件

| 文件 | 职责 |
|------|------|
| `oct-gateway/script_adapter/paragraphPreprocessor.js` | 纯程序段落拆分 + hint 预标记 |
| `oct-gateway/script_adapter/agents/classificationSplitterAgent.js` | 分类切分Agent（LLM调用） |
| `oct-gateway/script_adapter/classificationParser.js` | 解析 + 规则校验 + 降级 |
| `oct-gateway/script_adapter/agents/lightNarrationRewriterAgent.js` | 轻改写Agent（只改旁白） |
| `oct-gateway/script_adapter/classifiedMerger.js` | 合并为 AdaptedScriptPayload |

### 改造文件

| 文件 | 改动 |
|------|------|
| `oct-gateway/script_adapter/agents/textRewriterAgent.js` | 内部替换为分类切分优先流水线，外部签名不变 |
| `oct-gateway/script_adapter/basicQCChecker.js` | 新增4项检查：dialogue_action_misclassified、inner_monologue_third_person、speaker_contamination、voice_registry_pollution_risk |
| `vitest.config.ts` | 将新增的 classificationParser / classifiedMerger 测试纳入默认 Vitest 覆盖 |

### 测试文件

| 文件 | 覆盖 |
|------|------|
| `oct-gateway/test/classificationParser.test.js` | 解析、校验、降级规则、污染speaker拦截 |
| `oct-gateway/test/classifiedMerger.test.js` | 混合段落合并、rewritten文本fallback、segmentId |
| `oct-gateway/test/basicQCChecker.test.js` | 新增4项QC检查 |

## 核心流水线

```
原文
  → 段落预处理（纯程序）
  → 分类切分Agent（LLM：只判断声音类型、speaker、原文片段）
  → 规则校验器（降级错误分类 + 拦截污染speaker）
  → 轻改写Agent（只改旁白，dialogue/inner_monologue不过模型）
  → 合并器（输出 AdaptedScriptPayload）
```

## 关键规则

- **角色动作永远不是对白**：`她伸手拿起对讲机` → 旁白
- **第三人称心理描写默认旁白**：`她心里忽然有点发紧` → 旁白，不是 inner_monologue
- **只有直接念头才是inner_monologue**：`不对，屋里有人来过` → 内心:周佳宁
- **污染speaker拦截**：含"检查字数比例"、"输出最终版本"等关键词的speaker直接丢弃
- **混合段落按片段合并**：同一自然段拆出的多条旁白使用独立 rewriteId，避免轻改写结果互相覆盖或回退整段原文

## 失败策略

- 分类有效结果为空：**抛错**，阻止错误交付（不允许静默回退）
- 轻改写失败：旁白用原文继续，warnings记录 `light_rewrite_failed`
- 解析失败：无效行进warnings，不抛异常

## 测试结果

```bash
npm test
# 20 test files passed, 1 skipped
# 201 tests passed, 1 skipped
```

相关测试：
- `oct-gateway/test/classificationParser.test.js` ✓
- `oct-gateway/test/classifiedMerger.test.js` ✓
- `oct-gateway/test/basicQCChecker.test.js` ✓
- `oct-gateway/test/lineProtocolParser.test.js` ✓
- `oct-gateway/test/textRewriterE2E.test.js` (live test, skipped unless RUN_LIVE_TESTS=1)

## 规格文档同步

- `docs/03_specs/内容创作工作台/多人演播有声小说改编规则.md` - 补充"心理描写≠内心独白"规则

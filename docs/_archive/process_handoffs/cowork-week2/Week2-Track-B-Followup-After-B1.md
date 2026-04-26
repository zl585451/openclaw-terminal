# Week 2 Track B 接续指令(B.1 简报已通过审查)

> 状态:B.1 toolLoop 简报 `docs/07_research/2026-04-26-toolloop-pre-summarizer.md` 已审查通过
> 适用:Cursor 在同一项目内继续完成 B.2 → B.6
> 前置:本文件 + Week 2 原始计划 `docs/_archive/process_handoffs/cowork-week2/Week2-Dual-Track-Cowork-Handoff.md` 一起读

---

## 〇、Zilong 的审查结论

简报全部认可。三条核心判断:

1. **入口集中**:`oct-gateway/runtime/toolLoop.js` 的 `ToolLoop.handleToolCalls` 是唯一改动点,实例化在 `oct-gateway/ai.js`,调用方两处(正常 finish_reason / pseudo tool call 解析后)走同一函数。
2. **触发点位置**:`truncateToolResult(...)` 之后、`toolResults.push({...})` 之前(对应 `toolLoop.js:160-181` 之间)。这与 Week 2 计划 B.3 的设想一致,可以直接落地。
3. **归档与 recall 安全网保留**:`archiveToolResult` 与 `recall_tool_result` 工具在 Week 0 已做完,**不动**。summarize 只影响写回模型上下文的 `content` 字段。

---

## 一、对 Week 2 原计划的 3 个补丁

下述 3 处比 Week 2 原 spec 更细,Cursor 落地时**必须按此修订版执行**,不再回到原 spec 那段细节。

### 补丁 1 — wrapper 改为 string-only,toolLoop 一侧先 stringify

**Week 2 原 spec 的 wrapper 在 `shouldSummarizeToolResult` 内对非 string 直接返回 `not_string`**。问题是 `truncateToolResult` 在结果未触发截断时会原样返回 object,导致大部分 object 工具结果走 noop。

修订:

1. wrapper `summarizeToolResult(toolName, resultText, options)` 的契约明确规定 `resultText` 是 string,non-string 视为调用方契约违反,直接返回 `{ mode: 'noop', text: '', reason: 'invalid_input_not_string' }`。
2. **toolLoop 一侧负责 string 化**(在调用 wrapper 之前完成),示例:

   ```javascript
   const contentForModel = typeof truncatedResult === 'string'
     ? truncatedResult
     : JSON.stringify(truncatedResult);
   const summarized = await summarizeToolResult(toolName, contentForModel);
   ```

3. wrapper 内部 `shouldSummarizeToolResult` 的判断顺序保持不变(feature_disabled → under_threshold → not_in_allow_list → over_threshold)。

### 补丁 2 — recall_tool_result 安全网必须保留,文档明示

**Week 2 原 spec 写了"在硬截断之后"但没强调归档与 recall 链路**。本次修订要求:

1. 不动 `archiveToolResult` 调用顺序与签名。
2. summarize 不影响截断文本中的"完整结果已归档,可调用 recall_tool_result"提示行 — 也就是说,wrapper 接收的 `contentForModel` 已经包含这行,summarize 输出的摘要里**不要求强制保留这行**(因为压缩了)。模型仍然知道有 `recall_tool_result` 工具可用,因为工具定义在 system 注册。
3. `docs/02_architecture/summarizer-service.md` 新增子章节 `### Tool Loop 集成中的安全网层级`,显式列出三层:归档(全量) → 硬截断(头尾保留 + recall 提示) → summarize(可选,默认关)。

### 补丁 3 — noop 日志降级到 debug

**Week 2 原 spec 在 toolLoop 集成例子里用了 `log.info`**,简报 5.6 也建议 noop 打日志便于灰度。但 noop 路径在默认关闭时是高频,info 级会刷屏。

修订:

1. wrapper 调用结果 `mode === 'summary' | 'fallback_truncate'` → `log.info`
2. wrapper 调用结果 `mode === 'noop'` → `log.debug`(或者干脆不打,看 Gateway 日志框架是否有 debug 级)

如果当前 logger 没有 debug 级,临时退化为 info 但加 `silent: true` 标志或者 sample 1/100,**不要**让 noop 路径在生产环境刷屏。

---

## 二、放行清单(按这个顺序做,每步单独 commit)

### B.2 — `oct-gateway/runtime/toolResultSummarizer.js`

1. 按 Week 2 原 spec 实现,但接受补丁 1:non-string 输入返回 `{ mode: 'noop', text: '', reason: 'invalid_input_not_string' }`。
2. `summarizeToolResult` 返回值字段:`text / mode / latencyMs / reason`。
3. 默认所有配置项缺省值:
   - `TOOL_RESULT_SUMMARIZER_ENABLED` = 关
   - `TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS` = 2400
   - `TOOL_RESULT_SUMMARIZER_TARGET_CHARS` = 600
   - `TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP` = 1500
   - `TOOL_RESULT_SUMMARIZER_TOOLS` = 空(全开)

commit message:`feat(gateway/runtime): tool result summarizer wrapper with fallback`

### B.3 — 修改 `oct-gateway/runtime/toolLoop.js`

精确定位:**插入位置在 `truncateToolResult(...)` 调用之后(简报第 6 步)、`toolResults.push(...)` 之前(简报第 8 步)**。即简报里指出的 `toolLoop.js:160-181` 之间。

具体形态(替换原本直接 push 的代码):

```javascript
// 原代码末段(简化展示):
//   const truncatedResult = truncateToolResult(toolName, result, toolCall.id);
//   toolResults.push({
//     tool_call_id: toolCall.id,
//     role: 'tool',
//     content: typeof truncatedResult === 'string'
//       ? truncatedResult
//       : JSON.stringify(truncatedResult),
//   });

// 改为:
const truncatedResult = truncateToolResult(toolName, result, toolCall.id);
const contentForModel = typeof truncatedResult === 'string'
  ? truncatedResult
  : JSON.stringify(truncatedResult);

const summarized = await summarizeToolResult(toolName, contentForModel);

if (summarized.mode === 'noop') {
  this.log.debug?.('tool result summarizer noop', {
    toolName,
    reason: summarized.reason,
  });
} else {
  this.log.info('tool result summarizer', {
    toolName,
    mode: summarized.mode,
    latencyMs: summarized.latencyMs,
    originalChars: contentForModel.length,
    finalChars: summarized.text.length,
  });
}

toolResults.push({
  tool_call_id: toolCall.id,
  role: 'tool',
  content: summarized.text,
});
```

需要在 `toolLoop.js` 顶部 require:

```javascript
const { summarizeToolResult } = require('./toolResultSummarizer');
```

如果当前 `this.log` 没有 `debug` 方法,用 optional chain `this.log.debug?.(...)`,缺省时不打 noop 日志。

**关键约束**:
- 不动 `archiveToolResult` 调用
- 不动 `onToolEvent` 推 `tool_result` UI 事件那段
- 只把"写回 toolResults"前的 content 拼装路径包一层

commit message:`feat(gateway/runtime): integrate summarizer into tool loop result handling`

### B.4 — `oct-gateway/test/toolResultSummarizer.test.js`

按 Week 2 原 spec,加上 1 个补丁 1 触发的测试:

1. feature 关闭 → noop / `feature_disabled`
2. feature 开,文本短于阈值 → noop / `under_threshold`
3. feature 开,文本超阈值,工具不在白名单(白名单非空) → noop / `not_in_allow_list`
4. feature 开,文本超阈值,工具在白名单 → 触发 summarize 路径(non-live 用 mock summarize)
5. **新增**:feature 开,wrapper 收到 object 输入 → noop / `invalid_input_not_string`
6. (live)真实 summarize 5000 字 → mode='summary'
7. (live)`timeoutMs: 1` → mode='fallback_truncate',文本以 `[summarizer fallback:` 开头

默认 SKIP live(沿用 Week 1 修复后的 `RUN_LIVE_TESTS=1` 约定),测试文件头注释保持一致。

commit message:`test(gateway/runtime): tool result summarizer unit tests`

### B.5 — 配置项落地

按 Week 2 原 spec,5 个环境变量。如果 `oct-gateway/config.js` 已有 `getEnvOrConfig(...)` 即可,不需要额外注册。

如果想给设置面板加 UI,**这次先不做**,留 Week 3。

commit message:`chore(gateway/config): tool result summarizer feature flags`

### B.6 — 文档

按 Week 2 原 spec,但 `docs/02_architecture/summarizer-service.md` 必须包含补丁 2 要求的"安全网层级"子章节:

```markdown
### Tool Loop 集成中的安全网层级

工具结果在写回模型上下文之前,经过三层处理,任何一层失败都不影响下一层:

1. **归档层**(Week 0,默认开,无法关闭)
   - `oct-gateway/runtime/toolResultArchive.js`
   - 保存完整工具结果到内存归档
   - 模型可调用 `recall_tool_result` 取回完整结果

2. **硬截断层**(Week 0,默认开,无法关闭)
   - 同上文件,`truncateToolResult(...)`
   - 普通工具阈值 3750 字符,高产出工具(web_search 等)阈值 2500
   - 截断后保留头 60% 尾 30%,中段插入"完整结果已归档"提示

3. **摘要层**(Week 2,默认关,需手动开启)
   - `oct-gateway/runtime/toolResultSummarizer.js`
   - 阈值 / 工具白名单 / 失败 fallback 全部可配
   - 失败时退化为 1500 字硬截断,文本以 `[summarizer fallback: ...]` 开头便于排查
```

新建 `docs/05_changelog/2026-04-XX-tool-result-summarizer.md`(填实际日期),内容包含:

- B.2~B.6 全部新文件清单
- 5 个配置项默认值表格
- 启用方式(`$env:TOOL_RESULT_SUMMARIZER_ENABLED='1'` 后重启 Gateway)
- 灰度建议(先用 `TOOL_RESULT_SUMMARIZER_TOOLS=web_search,read_document` 限定 2-3 个工具)
- 已知限制:第一版只压缩写回 model 的内容,不影响 UI tool_result preview
- 关联简报路径:`docs/07_research/2026-04-26-toolloop-pre-summarizer.md`

commit message:`docs(architecture): tool result summarizer integration & safety net layering`

---

## 三、验收标准

按顺序跑通:

1. **基线**:`TOOL_RESULT_SUMMARIZER_ENABLED` 不设置时(默认关),Gateway 行为与 Week 1 完全一致。任何工具调用流程不变,日志里没有 `tool result summarizer` 关键字(因为 noop 走 debug)。
2. **离线测试全部 PASS**:
   ```powershell
   node oct-gateway/test/toolResultSummarizer.test.js
   ```
3. **启用后灰度**:
   ```powershell
   $env:TOOL_RESULT_SUMMARIZER_ENABLED='1'
   $env:TOOL_RESULT_SUMMARIZER_TOOLS='web_search'
   # 重启 Gateway
   ```
   主对话发起一次 `web_search` 调用,日志里能看到:
   ```
   tool result summarizer { toolName: 'web_search', mode: 'summary', latencyMs: <1500ms>, originalChars: <~3000>, finalChars: <~600> }
   ```
4. **降级路径**:临时把 summarizer 的 `timeoutMs` 设为 1ms,重新跑同一调用,日志里 `mode: 'fallback_truncate'`,模型仍然能看到工具结果(虽然以 `[summarizer fallback:` 开头)。
5. **关闭后回退**:`Remove-Item Env:TOOL_RESULT_SUMMARIZER_ENABLED`,重启,行为完全回到第 1 步基线。

---

## 四、卡壳时怎么办

1. **`this.log.debug` 不存在** → 用 `this.log.debug?.(...)` 可选链,或者 noop 日志整体不打
2. **`config.getEnvOrConfig` 不存在** → grep 确认实际方法名,可能叫 `config.getEnv` 或 `config.read`,按现有约定
3. **`truncateToolResult` 签名变了** → 跟 Week 0 simulation 不一致时,以现有源码为准,简报里的引用也是当前源码
4. **`docs/07_research/` 目录还没建** → `mkdir -p docs/07_research` 后把简报放进去(如果 Cursor 当时是放别的位置,移过去)
5. **任何修改 toolLoop.js 中保护清单内的逻辑** → 停下来问 Zilong

---

## 五、完成后回报

- B.2 ~ B.6 5 个 commit 列表
- 离线测试 PASS 截图或日志
- 启用 + 灰度后的一条真实调用日志(脱敏)
- `docs/02_architecture/summarizer-service.md` 与 changelog 链接
- 任何越界修改 / 新发现的 toolLoop 隐性约束

Zilong 确认通过后,Track B 关闭,转入 Track C(Gateway 状态机骨架)。

---

## 附:本次接续没有涉及的事项

1. UI tool_result preview 不动(简报 5.5)
2. summarizer 接进对话历史滚动摘要(留 Week 4)
3. summarizer 接进 audiobook Agent 长章节预处理(留 Week 5)
4. 设置面板增加摘要开关 UI(留 Week 3)

# 2026-04-26 Gateway 摘要服务 Track B

## 背景

Week1 原计划 Track B 要在 Gateway 增加通用摘要基础设施，为后续真实内容创作 Agent 处理长章节、长工具结果和长对话历史做准备。

此前仓库已有 `oct-gateway/summarizer/` 目录，但该目录主要服务记忆系统的日/周/月总结。本次新增的是面向工具和内容制作 Agent 的通用服务层。

## 变更

1. 新增 `oct-gateway/services/chunker.js`。
   - 支持按字符、段落和章节切分文本。
   - 纯规则实现，不调用 LLM。
2. 新增 `oct-gateway/services/summarizer.js`。
   - 支持 `general`、`tool_result`、`chapter`、`scroll` 四种摘要用途。
   - 优先使用 `SUMMARIZER_*` 配置，缺省时降级当前 Gateway Provider。
   - 支持单段摘要和 Map-Reduce 式分块摘要。
3. 新增 `oct-gateway/tools/summarize_text.js`。
   - 将摘要服务注册为 Gateway 工具。
4. 新增 `oct-gateway/test/summarizer.test.js`。
   - 支持 `SKIP_LIVE_TESTS=1` 跳过真实 API 调用。
5. 新增 `docs/02_architecture/summarizer-service.md`。

## 影响

后续真实 Agent 可以复用同一套摘要能力处理长文本，不需要每个 Agent 自己实现分块和摘要逻辑。

## 验证

已通过：

```powershell
$env:SKIP_LIVE_TESTS='1'; node oct-gateway/test/summarizer.test.js
node oct-gateway/test/summarizer.test.js
node -e "require('./oct-gateway/services/chunker'); require('./oct-gateway/services/summarizer'); require('./oct-gateway/tools/summarize_text'); console.log('summarizer modules ok')"
node -e "const loader=require('./oct-gateway/tool_loader'); const ok=loader.getDefinitions().some(d=>d.function&&d.function.name==='summarize_text'); if(!ok) process.exit(1); console.log('summarize_text tool registered')"
npm run build
```

其中真实摘要调用测试结果为 `7/7 passed`，说明 Gateway 当前配置下可以实际调用摘要模型完成单段摘要、分块摘要和超时保护验证。

# 2026-04-29 内容制作模型配置 MVP 方案与落地

## 本次改动

1. 新增 `docs/03_specs/内容创作工作台/内容制作模型配置MVP方案.md`。
2. 明确 MVP 阶段优先使用阿里百炼 Key 和 Qwen 模型池。
3. 明确设置面板新增“内容制作模型”卡片，而不是继续把 Agent 作业模型塞入默认聊天模型配置。
4. 明确 DeepSeek / MiniMax 暂不进入 MVP 内容制作主链路，后续完成 reasoning 隔离与清洗后再作为实验模型开放。
5. 落地设置页高级连接模式中的“内容制作模型”卡片。
6. Electron 保存/读取新增 `SCRIPT_ADAPTER_*` 内容制作字段。
7. Gateway 支持 `scriptAdapter.models` 和 `resolveProviderFor('script_adapter.<role>')`，让业务分析、文本改写、角色音分类、演播设计、质检审校可各自选择模型。
8. 更新内容创作工作台规格目录入口。

## 设计结果

MVP 普通用户路径：

1. 进入设置面板。
2. 找到“内容制作模型”。
3. 选择“阿里百炼内容制作 MVP”。
4. 填入 `DASHSCOPE_API_KEY`。
5. 点击“测试连接”。

高级用户可以展开 Agent 模型映射，分别配置业务分析、文本改写、角色音分类、演播设计、质检审校和兜底复核模型。

## 验证

1. `npx tsc --noEmit`
2. `npx tsc -p tsconfig.electron.json --noEmit`
3. `node --check oct-gateway/services/llmClient.js`
4. `node --check oct-gateway/config.js`
5. `node oct-gateway/test/llmClientScriptAdapterModels.test.js`
6. `node oct-gateway/test/textRewriterAgent.test.js`
7. `node oct-gateway/test/textRewriterChunking.test.js`

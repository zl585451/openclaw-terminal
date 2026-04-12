# Mem0 中文提取修复 — 2026-04-12

## 问题

Mem0 默认使用纯英文 extraction prompt（"You are an expert at deducing facts..."），
对中文对话始终返回 `{"facts": []}` —— 这是 mem0 的已知问题，社区有多处报告。

## 根本原因

1. **mem0 英文 prompt 不支持中文**：LLM 收到英文提取指令 + 中文对话，选择返回空事实。
2. **Windows PowerShell 编码**：默认 code page 不是 UTF-8，中文字符在发送前被转成 `?`，导致调试期间看到的"模型不工作"实际上是服务器从未收到中文。

## 解决方案

### 路径1：mem0 官方 `prompt` 参数（主路径）

```python
result = mem0_instance.add(messages, user_id=uid, prompt=ZH_MEM0_PROMPT)
```

`ZH_MEM0_PROMPT` 用中文写提取指令并提供 few-shot 示例，覆盖默认英文 system prompt。

### 路径2：规则提取（兜底，零费用）

若 LLM 提取仍返回 0 事实：
- 把用户消息中的「我/我的/我自己」替换为「用户/用户的/用户自己」
- 按标点（，。！？；、…）分割成多条陈述句
- 过滤出包含「用户」的句子
- 直接调用 `mem0_instance.vector_store.insert()` 写入 Qdrant

示例：`"我叫小明，我是程序员"` → `["用户叫小明", "用户是程序员"]`

## 验证结果

```
POST /add {"user_message":"我叫小明，我是程序员","assistant_reply":"你好小明"}
→ facts_added=2  Inserting 2 vectors into collection oct_mem0 ✅

POST /search {"query":"这个人叫什么名字"}
→ hits=2  语义召回成功 ✅
```

## 变更文件

| 文件 | 变更 |
|------|------|
| `resources/mem0_service/server.py` | 新增 `_ZH_MEM0_PROMPT`（中文 prompt），`_rule_extract_facts()`（规则兜底），`_store_facts_directly()`（直接写 Qdrant），`/add` 双路径逻辑，httpx debug patch |
| `docs/02_architecture/mem0-dynamic-memory.md` | 更新配置表（SiliconFlow），补充中文支持方案 |

## PowerShell 测试注意

```powershell
chcp 65001
$OutputEncoding = [System.Text.Encoding]::UTF8
# 然后发请求加 -ContentType "application/json; charset=utf-8"
```

生产环境（Electron/Node.js）默认 UTF-8，无需此操作。

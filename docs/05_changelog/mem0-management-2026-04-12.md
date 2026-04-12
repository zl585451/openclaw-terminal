# Mem0 记忆管理完整化 — 2026-04-12

## 背景

Mem0 初版只有「进」没有「出」：只能写入和搜索，无法删除、清理、查看已存内容。
路径2（规则兜底）没有去重，同一事实可能重复写入。AI 也没有工具主动操控 Mem0。

## 变更内容

### 1. server.py — 新增端点 + 路径2去重

**新增端点：**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/delete` | POST | 按 memory_id 删除单条记忆（调用 `mem0.delete()`） |
| `/clear_all` | POST | 清空指定用户的全部记忆（调用 `mem0.delete_all()`） |

**路径2去重修复：**

`_store_facts_directly()` 写入前先调 `mem0.search()` 做语义相似度检查：
- 相似度 > 0.85 → 跳过，打日志 `规则去重: 跳过`
- 低于阈值 → 正常写入

### 2. mem0_client.js — 新增三个方法

```javascript
getAllMemories(userId)          // 获取全部记忆
deleteMemory(memoryId, userId)  // 删除单条
clearAll(userId)                // 清空全部
```

### 3. AI 工具 — 新增两个

**`oct-gateway/tools/mem0_search.js`**（riskLevel: safe）
- AI 主动语义搜索 Mem0 记忆
- 触发场景：用户问"你还记得…"、"关于X你知道什么"

**`oct-gateway/tools/mem0_delete.js`**（riskLevel: guarded）
- AI 删除指定记忆条目
- 需先用 mem0_search 找到 id 再调用
- 删除前应告知用户并获得确认

### 4. MemoryTabView.tsx — 记忆管理 UI

Mem0 区块（服务运行时）新增：
- **已存记忆**标题 + 条数徽章
- **查看记忆**按钮：展开列表，显示所有已存事实，每条可单独删除
- **清空全部**按钮：二次确认弹窗，不可撤销操作有防误触保护
- 列表滚动区域，最高 320px，不撑开页面

## 架构说明

删除 / 清空端点仅调用 mem0 官方 API（`mem0.delete()` / `mem0.delete_all()`），
不依赖内部属性，升级 mem0ai 版本不受影响。

## 变更文件

| 文件 | 变更 |
|------|------|
| `resources/mem0_service/server.py` | 新增 `/delete` `/clear_all` 端点；`_store_facts_directly` 加去重 |
| `oct-gateway/mem0_client.js` | 新增 `getAllMemories` `deleteMemory` `clearAll` |
| `oct-gateway/tools/mem0_search.js` | 新建 AI 工具 |
| `oct-gateway/tools/mem0_delete.js` | 新建 AI 工具 |
| `src/ui/settings/tabs/MemoryTabView.tsx` | Mem0 区块增加记忆查看/删除/清空 UI |

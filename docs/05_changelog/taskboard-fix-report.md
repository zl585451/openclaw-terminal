# 任务看板与 Nocturne 解耦修复报告

**日期**: 2025-12-22  
**状态**: ✅ Cursor 修复完成，待重启验证

---

## 🔍 问题根源

| # | 问题 | 说明 |
|---|------|------|
| ① | AGENTS.md 旧规范 | 仍指示 AMY 用 `memory_write` 写入 `core://my_user/daily/.../tasks/` |
| ② | extractAndSaveMemory 自动提炼 | LLM 自动生成 `core://oct/taskboard` 等路径并写入 |

---

## 🔧 修复方案

### 修复 1：AGENTS.md

**位置**: 第 87-88 行附近

**改动**:
- ❌ 移除表格中的「任务」与「停车场」行
- ✅ 替换为「任务看板操作规范」

**新规范内容**:
- 必须使用专用工具：`task_add`、`task_done`、`task_delete`、`task_list`、`parking_add`
- 禁止使用 `memory_write` 写入任何任务相关数据
- 任务数据存储在本地 `tasks.json`，与记忆系统完全独立

---

### 修复 2：oct-gateway/index.js

**位置**: `extractAndSaveMemory` 函数的 `onDone` 回调中，`memory.writeMemory` 调用前

**新增过滤逻辑**:
```javascript
// 过滤掉任务看板相关路径，这些由专用工具处理
const blockedPaths = ['taskboard', 'tasks', 'parking', 'parking_lot'];
const isBlocked = blockedPaths.some(p => uri.toLowerCase().includes(p));
if (isBlocked) {
  console.log('[Memory] 跳过任务路径写入:', uri);
  return;
}
```

**效果**: 若 LLM 输出包含 `taskboard`、`tasks`、`parking` 或 `parking_lot` 的 URI，将直接跳过写入并打印日志。

---

## ✅ 验证步骤

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 重启 OCT | 无报错 |
| 2 | 查看 Gateway 日志 | 不再出现 `core://oct/taskboard` 或任务相关路径 |
| 3 | 对 AMY 说「添加一个测试任务」 | 右侧任务看板出现新任务（通过工具写入） |

---

## 📝 验证记录

**重启时间**: _______________  
**日志检查结果**: _______________  
**任务测试结果**: _______________  
**验收状态**: ⬜ 通过 / ⬜ 失败

---

*修复完成，等待少爷重启验证*

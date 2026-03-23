# 记忆结构说明（Nocturne core 域）

> 运行 `node oct-gateway/init_memory_structure.js` 可初始化以下节点结构（已存在则跳过）。

## 节点层级（domain: core）

### AMY 自身

| path | content | priority |
|------|---------|----------|
| agent | AMY 根节点 | 0 |
| agent/rules | 行为规则根节点 | 0 |
| agent/corrections | 行为纠正记录根节点 | 1 |

### 少爷信息

| path | content | priority |
|------|---------|----------|
| my_user | 少爷信息根节点 | 0 |
| my_user/preferences | 少爷偏好和习惯 | 1 |
| my_user/communication | 沟通风格备注 | 1 |

### 项目

| path | content | priority |
|------|---------|----------|
| project | 项目根节点 | 0 |
| project/oct | OCT 项目 | 1 |
| project/oct/decisions | OCT 重要决策记录 | 1 |
| project/oct/status | OCT 当前状态 | 1 |
| project/oct/milestones | OCT 里程碑 | 2 |

### 结论存档

| path | content | priority |
|------|---------|----------|
| conclusions | 重要对话结论根节点 | 1 |

### 每日记录

| path | content | priority |
|------|---------|----------|
| daily | 每日摘要根节点 | 2 |

---

## 初始化脚本

- **文件**：`oct-gateway/init_memory_structure.js`
- **前置**：Nocturne 需已启动（默认 http://127.0.0.1:8000）
- **执行**：`node oct-gateway/init_memory_structure.js`

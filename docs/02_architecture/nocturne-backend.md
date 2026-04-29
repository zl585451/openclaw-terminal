# 1.6 Nocturne 记忆后端

> **最后更新**：2026-04-28 | **状态**：🟡 已补空库根节点自修

---

## 做什么
Python FastAPI 服务，SQLite 存储，提供记忆的增删改查

## 文件
- `oct-gateway/memory.js`（JS 客户端）
- `nocturne_memory/`（Python 后端）

## 调用链
```
memory.js → HTTP 请求 → 127.0.0.1:8000 → SQLite
```

## 启动
Electron main.ts spawn Python 进程

启动时 Electron 会先用 gateway 随包的 `better-sqlite3` 对 SQLite 空库做一次轻量自检，
确保固定根节点存在；随后 Nocturne 会创建表结构，并在源码初始化阶段再次兜底确保固定根节点
`00000000-0000-0000-0000-000000000000` 存在。这个根节点是所有顶层
`core://...` / `writer://...` 路径边的父节点；如果空库缺失它，初始化核心记忆会在写入
`edges.parent_uuid` 时触发 SQLite foreign key 失败，表现为设置页“初始化预设记忆”
HTTP 500。

## 健康检查
`memory.isAlive()` → GET /health → 200 则在线

## 已知问题
曾频繁掉线（2026-03-16 已修复 Electron 启动逻辑）

2026-04-28 发现清理后的空库可能只有表结构、没有根节点，导致核心记忆初始化失败；
已在 Electron 启动 Nocturne 前和 Nocturne DB 初始化阶段分别增加自修。

## 验证方法
`/memory status` 或 `/status` 看 Nocturne 是否 ✅

## 重启 Nocturne
1. **OCT 应用内**：设置 → 记忆系统 → 点击「重启 Nocturne 后端」
2. **进程僵死**：任务管理器结束 `python.exe`（端口 8000），重启 OCT 应用
3. **检查端口**：`netstat -ano | findstr :8000` 查看是否监听
4. **压力测试**：`cd oct-gateway && node stress_test.js` 验证读写

## 状态
⚠️ 偶尔掉线（是所有记忆功能的基础，掉了全失效）

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-04-28 | 修复空库缺少固定根节点导致核心记忆初始化 HTTP 500 |
| 2026-03-20 | 初始拆分 |
| 2026-03-16 | 修复 Electron 启动逻辑 |

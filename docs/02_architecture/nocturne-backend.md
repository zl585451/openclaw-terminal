# 1.6 Nocturne 记忆后端

> **最后更新**：2026-03-20 | **状态**：⚠️ 偶尔掉线

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

## 健康检查
`memory.isAlive()` → GET /health → 200 则在线

## 已知问题
曾频繁掉线（2026-03-16 已修复 Electron 启动逻辑）

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
| 2026-03-20 | 初始拆分 |
| 2026-03-16 | 修复 Electron 启动逻辑 |

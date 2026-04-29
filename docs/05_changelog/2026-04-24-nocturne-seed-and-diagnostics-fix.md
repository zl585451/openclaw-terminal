# 2026-04-24 Nocturne Seed And Diagnostics Fix

## 变更摘要

- 将 `seed-nocturne-memories` 从“调用本机 Python seed 脚本”改为“直接通过 Nocturne HTTP API 初始化核心记忆”
- 统一 Electron 自动生成 `.env` 中的 `CORE_MEMORY_URIS`，与 Gateway 启动健康检查保持一致
- 为 Nocturne 增加持久化诊断日志 `nocturne_diagnostics.log`
- 扩展 `get-nocturne-status` 返回值，补充数据库路径、日志路径、核心记忆逐项健康状态
- 设置页记忆系统面板增加核心记忆就绪数、缺失 URI、数据库路径、日志路径展示

## 修复的问题

- 发布版客户端可拉起 Nocturne 后端，但“初始化预设记忆”仍依赖用户机器安装 Python，导致普通用户初始化失败
- Electron 自动写入的 `CORE_MEMORY_URIS` 与 Gateway 健康检查列表不一致，造成“后端在线但核心记忆未加载”的误判和真实缺失
- 用户反馈“记忆点没加载”时，现有日志不足以快速区分空库、核心记忆缺失、还是写入链路失败

## 影响范围

- `electron/main.ts`
- `src/types/electronAPI.ts`
- `src/hooks/settings/useNocturneMemory.ts`
- `src/ui/settings/tabs/MemoryTabView.tsx`
- `docs/03_specs/ELECTRON_IPC_CHANNELS.md`

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`

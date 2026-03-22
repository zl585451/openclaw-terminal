# 第七层：Electron 桌面应用

> 最后更新：2026-03-22

---

## 7.1 AI 服务商与模型设置（Phase 2）

|| 项目 | 内容 |
|------|------|
| 做什么 | 在 Settings 连接配置中选服务商、填 API Key、选模型、测试连接 |
| 文件 | `src/components/SettingsPanel.tsx`、`electron/main.ts` |
| IPC | `get-provider-list`、`test-ai-connection`、`get-api-keys`/`save-api-keys`（扩展 OCT_PROVIDER 等） |
| 持久化 | 写入 `userData/config.json`，Gateway 启动时通过 OCT_CONFIG_FILE 读取 |
| 特性 | 服务商下拉、模型下拉（带 🔧🧠 标识）、Base URL 高级、测试连接、保存后重启 Gateway |
| 状态 | ✅ 正常 |

---

## 7.2 搜索引擎 API 配置

|| 项目 | 内容 |
|------|------|
| 做什么 | 在 Settings 配置搜索引擎 API Key |
| 文件 | `src/components/SettingsPanel.tsx`、`electron/main.ts`、`electron/preload.ts` |
| 特性 | Brave Search Key、Tavily Key 输入框，链接到获取页面 |
| 环境变量 | `BRAVE_SEARCH_API_KEY`、`TAVILY_API_KEY` |
| 优先级 | Brave → Tavily → DuckDuckGo（无需 Key，自动降级） |
| 状态 | ✅ 正常 |

---

## 7.3 Nocturne 后端管理

|| 项目 | 内容 |
|------|------|
| 做什么 | 启动/监控/重启 Nocturne Python 后端 |
| 文件 | `electron/main.ts` → `startNocturneBackend()` |
| 状态 | ⚠️ 修复过一次（2026-03-16），需持续观察 |

---

## 7.4 本地任务系统

|| 项目 | 内容 |
|------|------|
| 做什么 | 本地 JSON 文件存储任务和停车场，支持从 Nocturne 迁移 |
| 文件 | `electron/main.ts` → tasks-read/tasks-write IPC |
| 写到哪 | `userData/tasks.json` |
| 状态 | ✅ 正常 |

---

## 7.5 授权验证

|| 项目 | 内容 |
|------|------|
| 做什么 | License 激活码验证 |
| 文件 | `electron/main.ts` → `verifyLicenseCode()` |
| 状态 | ✅ 正常 |

---

## 7.6 会话状态持久化

|| 项目 | 内容 |
|------|------|
| 做什么 | 保存/恢复会话状态到本地文件 |
| 文件 | `electron/main.ts` → `saveSessionState()`/`loadSessionState()` |
| 状态 | ✅ 正常 |
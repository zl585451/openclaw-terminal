# 2026-04-27 AI.library Bundled Runtime

## Summary

- 新增 `AI.library` 的 Windows 打包脚手架，准备将书库服务做成随客户端分发的独立可执行程序
- Electron 主进程现在会优先启动内置 `ai_library_server.exe`，只有在 exe 不存在时才回退到 Python 源码模式
- `AI.library` 默认联动开关改为开启，目标是让安装后的客户端默认可用
- 打包脚本改为在 `resources/ai_library/.build-venv` 内创建隔离环境，避免系统 Python 权限和污染问题

## Files

- `package.json`
- `electron/main.ts`
- `scripts/build-ai-library-exe.bat`
- `scripts/build-ai-library-exe.ps1`
- `resources/ai_library/ai_library_launcher.py`
- `resources/ai_library/ai_library_server.spec`

## Notes

- 当前发布链路已经具备“把 AI.library 一起打进安装包”的基础能力
- 真正生成 `ai_library_server.exe` 仍依赖打包机本地 Python 环境和 `requirements.txt` 的安装成功
- 运行时目标不再要求最终用户手动安装 Python、配置路径或打开终端

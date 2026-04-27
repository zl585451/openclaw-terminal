#!/usr/bin/env python3
"""
AI.library - PyInstaller 入口
用于打包为独立 exe，OCT 安装后无需 Python 环境

环境变量（由 Electron main 进程注入）：
- API_HOST / API_PORT
- AI_LIBRARY_DATA_ROOT
- AI_LIBRARY_DOCS_ROOT
"""
import os
import uvicorn

from api_server import app

if __name__ == "__main__":
    host = os.getenv("API_HOST", "127.0.0.1")
    port = int(os.getenv("API_PORT", "8001"))
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
    )

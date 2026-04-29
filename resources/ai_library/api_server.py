#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI.library API Server
基于 FastAPI 的知识库查询服务

功能：
1. 知识检索 - /api/search
2. QA 查询 - /api/qa/search
3. 文档统计 - /api/stats
4. 健康检查 - /health

默认端口 8001（与 OpenClaw / Nocturne 的 8000 错开，避免冲突）。
环境变量 API_PORT 可覆盖。

启动命令：
    python api_server.py
    或
    uvicorn api_server:app --reload --host 0.0.0.0 --port 8001
"""

import os
import sys
import json
import uuid
import logging
import threading
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from pathlib import Path

# FastAPI
from fastapi import FastAPI, HTTPException, Query, Body, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# 导入知识库核心模块
from audio_knowledge_base import KnowledgeBaseAPI, Config

# 书库 Phase 2（追加模块，不影响检索核心）
import library_db
from chapter_splitter import split_into_chapters

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def ensure_data_dirs() -> None:
    """确保数据目录存在（由环境变量或 Config 默认路径决定）。"""
    dirs = [
        Path(Config._DATA_ROOT),
        Path(Config._DOCS_ROOT),
        Path(Config.CHROMA_DB_PATH),
        Path(Config.QA_CHROMA_DB_PATH),
        Path(Config.LIBRARY_DATA_ROOT),
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    logger.info("AI.library 数据根目录: %s", Config._DATA_ROOT)
    logger.info("AI.library 文档目录: %s", Config._DOCS_ROOT)


# FastAPI 应用
app = FastAPI(
    title="AI.library API",
    description="音频专业知识库查询服务",
    version="1.0.0"
)

# CORS 配置（MAS / OCT 前端与本地开发）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:18789",
        "http://127.0.0.1:18789",
        "http://localhost:18790",
        "http://127.0.0.1:18790",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup_ensure_ai_library_dirs() -> None:
    ensure_data_dirs()
    try:
        library_db.ensure_schema()
        logger.info("书库 Phase 2: SQLite 已就绪 %s", library_db.get_db_path())
    except Exception as e:
        logger.exception("书库 Phase 2: schema 初始化失败: %s", e)


# 全局知识库实例（单例模式）
kb_instance: Optional[KnowledgeBaseAPI] = None
kb_lock = threading.Lock()


def get_knowledge_base() -> KnowledgeBaseAPI:
    """获取知识库单例实例（线程安全）"""
    global kb_instance
    if kb_instance is None:
        with kb_lock:
            # 双重检查：防止多个线程同时通过第一个检查
            if kb_instance is None:
                logger.info("初始化知识库实例...")
                kb_instance = KnowledgeBaseAPI()
                logger.info(f"知识库加载完成：{kb_instance.get_stats()}")
    return kb_instance


# ============== 数据模型 ==============

class SearchRequest(BaseModel):
    """搜索请求（兼容 OCT ai_library 的 query + top_k）"""
    query: str = Field(..., description="搜索查询文本", min_length=1, max_length=1000)
    top_k: int = Field(default=3, description="返回结果数量，默认 3", ge=1, le=20)
    search_type: str = Field(default="hybrid", description="搜索类型：semantic/keyword/hybrid")


class SearchResponse(BaseModel):
    """搜索响应"""
    query: str
    results: List[Dict[str, Any]]
    total: int
    search_type: str
    latency_ms: float


class QARequest(BaseModel):
    """QA 查询请求"""
    question: str = Field(..., description="问题文本", min_length=1, max_length=1000)
    top_k: int = Field(default=3, description="返回结果数量", ge=1, le=10)


class QAResponse(BaseModel):
    """QA 响应"""
    question: str
    answers: List[Dict[str, Any]]
    total: int
    latency_ms: float


class StatsResponse(BaseModel):
    """统计信息响应"""
    total_documents: int
    total_chunks: int
    total_qa_pairs: int
    database_size_mb: float
    last_updated: Optional[str]


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str
    timestamp: str
    version: str
    knowledge_base_ready: bool


# ============== API 端点 ==============

@app.get("/health", response_model=HealthResponse, tags=["健康检查"])
async def health_check():
    """健康检查"""
    kb_ready = False
    try:
        kb = get_knowledge_base()
        kb_ready = kb is not None
    except Exception as e:
        logger.error(f"知识库初始化失败：{e}")
    
    return HealthResponse(
        status="healthy" if kb_ready else "degraded",
        timestamp=datetime.now().isoformat(),
        version="1.0.0",
        knowledge_base_ready=kb_ready
    )


@app.get("/api/stats", response_model=StatsResponse, tags=["统计信息"])
async def get_stats():
    """获取知识库统计信息"""
    try:
        kb = get_knowledge_base()
        stats = kb.get_stats()
        
        # 计算数据库大小
        db_path = Path(Config.CHROMA_DB_PATH)
        db_size_mb = 0.0
        if db_path.exists():
            db_size_mb = sum(f.stat().st_size for f in db_path.glob('**/*') if f.is_file()) / (1024 * 1024)
        
        return StatsResponse(
            total_documents=stats.get("total_documents", 0),
            total_chunks=stats.get("total_chunks", 0),
            total_qa_pairs=stats.get("total_qa_pairs", 0),
            database_size_mb=round(db_size_mb, 2),
            last_updated=stats.get("last_updated")
        )
    except Exception as e:
        logger.error(f"获取统计信息失败：{e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search", response_model=SearchResponse, tags=["知识检索"])
async def search_knowledge(request: SearchRequest):
    """
    知识检索接口
    
    支持三种搜索模式：
    - semantic: 语义搜索（向量相似度）
    - keyword: 关键词搜索
    - hybrid: 混合搜索（默认）
    """
    start_time = datetime.now()
    
    try:
        kb = get_knowledge_base()
        
        # 执行搜索
        results = kb.search(
            query=request.query,
            top_k=request.top_k,
            search_type=request.search_type
        )
        
        # 计算延迟
        latency_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        return SearchResponse(
            query=request.query,
            results=results,
            total=len(results),
            search_type=request.search_type,
            latency_ms=round(latency_ms, 2)
        )
    except Exception as e:
        logger.error(f"搜索失败：{e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/qa/search", response_model=QAResponse, tags=["QA 查询"])
async def search_qa(request: QARequest):
    """
    QA 对查询接口
    
    从预生成的 QA 对中寻找答案
    """
    start_time = datetime.now()
    
    try:
        kb = get_knowledge_base()
        
        # QA 搜索
        answers = kb.search_qa(
            question=request.question,
            top_k=request.top_k
        )
        
        # 计算延迟
        latency_ms = (datetime.now() - start_time).total_seconds() * 1000
        
        return QAResponse(
            question=request.question,
            answers=answers,
            total=len(answers),
            latency_ms=round(latency_ms, 2)
        )
    except Exception as e:
        logger.error(f"QA 搜索失败：{e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents", tags=["文档管理"])
async def list_documents():
    """获取所有文档列表"""
    try:
        kb = get_knowledge_base()
        documents = kb.list_documents()
        return {"documents": documents, "total": len(documents)}
    except Exception as e:
        logger.error(f"获取文档列表失败：{e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/documents/refresh", tags=["文档管理"])
async def refresh_documents():
    """刷新文档（重新扫描并增量更新）"""
    try:
        kb = get_knowledge_base()
        result = kb.process_all_documents()
        return {
            "status": "success",
            "message": f"处理完成：{result['processed']} 个文档，{result['updated']} 个更新"
        }
    except Exception as e:
        logger.error(f"刷新文档失败：{e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== 书库 Phase 2：/api/library/*（与 /api/search 独立） ==============


def _utc_upload_ts() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@app.post("/api/library/upload", tags=["书库"])
async def library_upload(
    file: UploadFile = File(...),
    title: str = Form(...),
    author: str = Form(""),
    source_type: str = Form("novel"),
):
    """上传一本书（.txt / .md），自动切章并入库。"""
    book_id = uuid.uuid4().hex[:12]
    suffix = Path(file.filename or "").suffix.lower().lstrip(".") or "txt"
    if suffix not in ("txt", "md"):
        raise HTTPException(status_code=400, detail=f"暂不支持 .{suffix}，Phase 2 只支持 .txt / .md")

    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = raw_bytes.decode("gbk")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="文件编码无法识别，请用 UTF-8 / GBK")

    sources_dir = os.path.join(Config.LIBRARY_DATA_ROOT, "sources")
    os.makedirs(sources_dir, exist_ok=True)
    source_rel = os.path.join("sources", f"{book_id}.{suffix}")
    full_source_path = os.path.join(Config.LIBRARY_DATA_ROOT, source_rel)
    with open(full_source_path, "w", encoding="utf-8") as f:
        f.write(text)

    chapters = split_into_chapters(text, book_id)
    uploaded_at = _utc_upload_ts()
    try:
        library_db.insert_book(
            book_id=book_id,
            title=title,
            author=author or None,
            source_type=source_type,
            source_format=suffix,
            source_path=source_rel,
            total_chars=len(text),
            chapter_count=len(chapters),
            uploaded_at=uploaded_at,
            metadata={},
        )
        library_db.insert_chapters(chapters)
    except Exception as e:
        try:
            if os.path.exists(full_source_path):
                os.remove(full_source_path)
        except OSError:
            pass
        logger.exception("书库入库失败，已回滚源文件: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "success": True,
        "book_id": book_id,
        "title": title,
        "total_chars": len(text),
        "chapter_count": len(chapters),
    }


@app.get("/api/library/list", tags=["书库"])
def library_list(limit: int = 50, offset: int = 0):
    books = library_db.list_books(limit=limit, offset=offset)
    return {"success": True, "books": books, "total": len(books)}


@app.get("/api/library/{book_id}/chapters", tags=["书库"])
def library_chapters(book_id: str):
    book = library_db.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    chapters = library_db.list_chapters(book_id)
    return {"success": True, "book_id": book_id, "chapters": chapters}


@app.get("/api/library/{book_id}/chapter/{chapter_index}", tags=["书库"])
def library_chapter_text(book_id: str, chapter_index: int):
    """返回指定章节的完整文本（从源文件按 start_char/end_char 切片）。"""
    book = library_db.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    chapters = library_db.list_chapters(book_id)
    target = next((c for c in chapters if c["chapter_index"] == chapter_index), None)
    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"Chapter {chapter_index} not found in book {book_id}",
        )
    full_path = os.path.join(Config.LIBRARY_DATA_ROOT, book["source_path"])
    if not os.path.exists(full_path):
        raise HTTPException(status_code=500, detail=f"Source file missing: {book['source_path']}")
    with open(full_path, "r", encoding="utf-8") as f:
        text = f.read()
    start = int(target["start_char"] or 0)
    end = int(target["end_char"] if target["end_char"] is not None else len(text))
    chapter_text = text[start:end]
    return {"success": True, "book_id": book_id, "chapter": target, "text": chapter_text}


@app.get("/api/library/{book_id}", tags=["书库"])
def library_get(book_id: str):
    book = library_db.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    return {"success": True, "book": book}


@app.delete("/api/library/{book_id}", tags=["书库"])
def library_delete(book_id: str):
    book = library_db.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    # 先删库记录（外键级联删 chapters），再删源文件，避免仅存孤儿文件
    deleted = library_db.delete_book(book_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    full_path = os.path.join(Config.LIBRARY_DATA_ROOT, book["source_path"])
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except OSError as e:
            logger.warning("书库删除：源文件删除失败 %s: %s", full_path, e)
    return {"success": True, "deleted": book_id}


# ============== 主程序入口 ==============

if __name__ == "__main__":
    import uvicorn
    
    # 配置
    HOST = os.getenv("API_HOST", "0.0.0.0")
    PORT = int(os.getenv("API_PORT", "8001"))
    DEBUG = os.getenv("DEBUG", "false").lower() == "true"
    
    logger.info(f"启动 AI.library API Server...")
    logger.info(f"监听地址：http://{HOST}:{PORT}")
    logger.info(f"调试模式：{DEBUG}")
    
    # 启动服务
    uvicorn.run(
        "api_server:app",
        host=HOST,
        port=PORT,
        reload=DEBUG,
        log_level="info"
    )

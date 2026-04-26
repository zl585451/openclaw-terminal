#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""书库 Phase 2 — SQLite 数据访问层。

数据文件: ${LIBRARY_DATA_ROOT}/library.sqlite3

每个连接均执行 PRAGMA foreign_keys = ON，使 ON DELETE CASCADE 生效。
"""
import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from audio_knowledge_base import Config

SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  source_type TEXT NOT NULL,
  source_format TEXT NOT NULL,
  source_path TEXT NOT NULL,
  total_chars INTEGER DEFAULT 0,
  chapter_count INTEGER DEFAULT 0,
  uploaded_at TEXT NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL,
  title TEXT,
  start_char INTEGER,
  end_char INTEGER,
  char_count INTEGER,
  preview TEXT,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
"""


def get_db_path() -> str:
    return os.path.join(Config.LIBRARY_DATA_ROOT, "library.sqlite3")


@contextmanager
def get_conn():
    os.makedirs(Config.LIBRARY_DATA_ROOT, exist_ok=True)
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    # SQLite 默认不强制外键；删除 books 时需级联 chapters
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def ensure_schema() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def insert_book(
    book_id: str,
    title: str,
    author: Optional[str],
    source_type: str,
    source_format: str,
    source_path: str,
    total_chars: int,
    chapter_count: int,
    uploaded_at: str,
    metadata: Optional[Dict[str, Any]],
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO books(id, title, author, source_type, source_format, source_path,
                              total_chars, chapter_count, uploaded_at, metadata)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                book_id,
                title,
                author,
                source_type,
                source_format,
                source_path,
                total_chars,
                chapter_count,
                uploaded_at,
                json.dumps(metadata or {}, ensure_ascii=False),
            ),
        )


def insert_chapters(chapters: List[Dict[str, Any]]) -> None:
    if not chapters:
        return
    with get_conn() as conn:
        conn.executemany(
            """
            INSERT INTO chapters(id, book_id, chapter_index, title, start_char, end_char, char_count, preview)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    c["id"],
                    c["book_id"],
                    c["chapter_index"],
                    c.get("title"),
                    c.get("start_char"),
                    c.get("end_char"),
                    c.get("char_count"),
                    c.get("preview"),
                )
                for c in chapters
            ],
        )


def list_books(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM books ORDER BY uploaded_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [_row_book(dict(row)) for row in rows]


def get_book(book_id: str) -> Optional[Dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
        return _row_book(dict(row)) if row else None


def _row_book(row: Dict[str, Any]) -> Dict[str, Any]:
    meta = row.get("metadata")
    if isinstance(meta, str) and meta:
        try:
            row = {**row, "metadata": json.loads(meta)}
        except json.JSONDecodeError:
            pass
    return row


def list_chapters(book_id: str) -> List[Dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_index ASC",
            (book_id,),
        ).fetchall()
        return [dict(row) for row in rows]


def delete_book(book_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        return cur.rowcount > 0

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
书库 Phase 2 冒烟：临时 AI_LIBRARY_DATA_ROOT，上传 / 列表 / 详情 / 章节 / 正文 / 删除 + 外键级联。

运行：在 resources/ai_library 目录下
  python test_library_phase2_smoke.py
依赖：fastapi、starlette（TestClient）、python-multipart
"""
import os
import sqlite3
import sys
import tempfile

# 必须在导入 Config / api_server 之前设置
_tmp = tempfile.mkdtemp(prefix="oct_lib_p2_")
os.environ["AI_LIBRARY_DATA_ROOT"] = os.path.join(_tmp, "data")
os.environ.setdefault("AI_LIBRARY_DOCS_ROOT", os.path.join(_tmp, "documents"))

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from fastapi.testclient import TestClient  # noqa: E402

import library_db  # noqa: E402
from api_server import app  # noqa: E402


def main() -> None:
    library_db.ensure_schema()
    client = TestClient(app)

    novel = (
        "第一章 开端\n这是第一段正文。\n\n"
        "第二章 发展\n更多内容在这里。\n\n"
        "第三章 收束\n结尾。\n"
    ).encode("utf-8")

    r = client.post(
        "/api/library/upload",
        files={"file": ("novel.txt", novel, "text/plain")},
        data={"title": "冒烟小说", "author": "Tester", "source_type": "novel"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True
    bid = body["book_id"]
    assert body["chapter_count"] >= 3, body

    r = client.get("/api/library/list")
    assert r.status_code == 200
    books = r.json()["books"]
    assert any(b["id"] == bid for b in books)

    r = client.get(f"/api/library/{bid}")
    assert r.status_code == 200
    assert r.json()["book"]["title"] == "冒烟小说"

    r = client.get(f"/api/library/{bid}/chapters")
    assert r.status_code == 200
    chaps = r.json()["chapters"]
    assert len(chaps) >= 3

    r = client.get(f"/api/library/{bid}/chapter/0")
    assert r.status_code == 200
    assert "第一章" in r.json()["text"]

    # 级联：删除前 chapters 行数 > 0，删除后应为 0
    dbp = library_db.get_db_path()
    conn = sqlite3.connect(dbp)
    conn.execute("PRAGMA foreign_keys = ON")
    n_before = conn.execute(
        "SELECT COUNT(*) FROM chapters WHERE book_id=?", (bid,)
    ).fetchone()[0]
    conn.close()
    assert n_before >= 1

    r = client.delete(f"/api/library/{bid}")
    assert r.status_code == 200, r.text

    conn = sqlite3.connect(dbp)
    conn.execute("PRAGMA foreign_keys = ON")
    n_after = conn.execute(
        "SELECT COUNT(*) FROM chapters WHERE book_id=?", (bid,)
    ).fetchone()[0]
    n_books = conn.execute("SELECT COUNT(*) FROM books WHERE id=?", (bid,)).fetchone()[0]
    conn.close()
    assert n_after == 0, "chapters 应在 ON DELETE CASCADE 下随 books 删除"
    assert n_books == 0

    src = os.path.join(os.environ["AI_LIBRARY_DATA_ROOT"], "sources", f"{bid}.txt")
    assert not os.path.exists(src), "源文件应已删除"

    print("PASS library Phase 2 smoke + FK cascade")


if __name__ == "__main__":
    main()

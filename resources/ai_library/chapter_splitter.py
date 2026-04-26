#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""章节切分 — 检测「第 X 章」「第 X 回」、Chapter N、Markdown 标题等。"""
import re
import uuid
from typing import Dict, List

CHAPTER_PATTERNS = [
    re.compile(r"(?:^|\n)\s*(第[一二三四五六七八九十百千零\d]+[章回][^\n]*)"),
    re.compile(r"(?:^|\n)\s*(Chapter\s+\d+[^\n]*)", re.IGNORECASE),
    re.compile(r"(?:^|\n)\s*(#{1,3}\s+[^\n]+)"),
]


def split_into_chapters(text: str, book_id: str) -> List[Dict[str, object]]:
    """切分章节，返回 chapters 列表（供 library_db.insert_chapters）。

    没找到任何章节标记时，把整本书当 1 章，title=\"全文\".
    """
    if not text:
        return []

    matches: List[tuple] = []
    for pattern in CHAPTER_PATTERNS:
        for m in pattern.finditer(text):
            title = m.group(1).strip()
            start = m.start(1)
            matches.append((start, title))
        if matches:
            break

    matches.sort(key=lambda x: x[0])
    # 仅去掉完全同一起点的重复匹配，避免短样章内多章标题被「<50 字」误杀
    deduped: List[tuple] = []
    for start, title in matches:
        if deduped and start == deduped[-1][0]:
            continue
        deduped.append((start, title))

    if not deduped:
        return [
            {
                "id": uuid.uuid4().hex[:12],
                "book_id": book_id,
                "chapter_index": 0,
                "title": "全文",
                "start_char": 0,
                "end_char": len(text),
                "char_count": len(text),
                "preview": text[:200],
            }
        ]

    chapters: List[Dict[str, object]] = []
    for i, (start, title) in enumerate(deduped):
        end = deduped[i + 1][0] if i + 1 < len(deduped) else len(text)
        content = text[start:end]
        chapters.append(
            {
                "id": uuid.uuid4().hex[:12],
                "book_id": book_id,
                "chapter_index": i,
                "title": title,
                "start_char": start,
                "end_char": end,
                "char_count": len(content),
                "preview": content[:200],
            }
        )

    return chapters

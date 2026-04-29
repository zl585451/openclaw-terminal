#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""章节切分 — 检测「第 X 章」「第 X 回」、Chapter N、Markdown 标题等。

目标是“通用稳健”，而不是为单本书写特判：
1. 允许目录/前置区里出现大量章节标题，但尽量跳过这些伪命中。
2. 过滤只有标题 + 分隔线的空壳章节。
3. 规范化重复标题，如「第2章 第2章 夜」。
"""
import re
import uuid
from typing import Dict, List

CHAPTER_PATTERNS = [
    re.compile(r"(?:^|\n)\s*(第[一二三四五六七八九十百千零\d]+[章回][^\n]*)"),
    re.compile(r"(?:^|\n)\s*(Chapter\s+\d+[^\n]*)", re.IGNORECASE),
    re.compile(r"(?:^|\n)\s*(#{1,3}\s+[^\n]+)"),
]
CHINESE_HEADING_PREFIX = re.compile(r"^(第[一二三四五六七八九十百千零\d]+[章回])")
ENGLISH_HEADING_PREFIX = re.compile(r"^(Chapter\s+\d+)\b", re.IGNORECASE)
BODY_SIGNAL_PATTERN = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]")
SEPARATOR_ONLY_PATTERN = re.compile(r"^[\s\-_=~*#·.。…—]+$")
MIN_SUBSTANTIAL_BODY_CHARS = 80
MAX_FRONT_MATTER_CANDIDATES = 24


def normalize_title(title: str) -> str:
    """折叠重复标题前缀，如「第2章 第2章 夜」→「第2章 夜」."""
    normalized = title.strip()
    for pattern in (CHINESE_HEADING_PREFIX, ENGLISH_HEADING_PREFIX):
        while True:
            match = pattern.match(normalized)
            if not match:
                break
            prefix = match.group(1)
            rest = normalized[len(prefix):].lstrip()
            if not rest.startswith(prefix):
                break
            normalized = f"{prefix} {rest[len(prefix):].lstrip()}".strip()
    return normalized


def body_text_without_title(content: str, title: str) -> str:
    body = content.lstrip("\ufeff")
    lines = body.splitlines()
    if not lines:
        return ""
    first_line = lines[0].strip()
    if first_line:
        body = "\n".join(lines[1:])
    elif body.startswith(title):
        body = body[len(title):]
    return body.lstrip("\r\n\t ")


def body_signal_chars(content: str, title: str) -> int:
    body = body_text_without_title(content, title)
    if not body:
        return 0
    compact = body.strip()
    if not compact:
        return 0
    if SEPARATOR_ONLY_PATTERN.match(compact):
        return 0
    return len(BODY_SIGNAL_PATTERN.findall(body))


def pick_first_real_candidate(candidates: List[Dict[str, object]]) -> int:
    """跳过目录/前置区中的章节标题密集命中。"""
    if not candidates:
        return 0
    limit = min(len(candidates), MAX_FRONT_MATTER_CANDIDATES)
    for i in range(limit):
        signal = int(candidates[i]["body_signal"])
        if signal >= MIN_SUBSTANTIAL_BODY_CHARS:
            return i
    return 0


def should_keep_candidate(candidate: Dict[str, object], has_next: bool) -> bool:
    """过滤只有标题/分隔线的空壳章节，保留真正有正文信号的短章。"""
    signal = int(candidate["body_signal"])
    return signal > 0


def split_into_chapters(text: str, book_id: str) -> List[Dict[str, object]]:
    """切分章节，返回 chapters 列表（供 library_db.insert_chapters）。

    没找到任何章节标记时，把整本书当 1 章，title=\"全文\".
    """
    if not text:
        return []
    text = text.lstrip("\ufeff")

    matches: List[tuple] = []
    for pattern in CHAPTER_PATTERNS:
        for m in pattern.finditer(text):
            title = normalize_title(m.group(1).strip())
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

    candidates: List[Dict[str, object]] = []
    for i, (start, title) in enumerate(deduped):
        end = deduped[i + 1][0] if i + 1 < len(deduped) else len(text)
        content = text[start:end]
        candidates.append(
            {
                "title": title,
                "start": start,
                "end": end,
                "content": content,
                "body_signal": body_signal_chars(content, title),
            }
        )

    start_index = pick_first_real_candidate(candidates)
    filtered: List[Dict[str, object]] = []
    for idx in range(start_index, len(candidates)):
        candidate = candidates[idx]
        if not should_keep_candidate(candidate, has_next=idx < len(candidates) - 1):
            continue
        filtered.append(candidate)

    if not filtered:
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
    for i, candidate in enumerate(filtered):
        content = str(candidate["content"])
        chapters.append(
            {
                "id": uuid.uuid4().hex[:12],
                "book_id": book_id,
                "chapter_index": i,
                "title": candidate["title"],
                "start_char": candidate["start"],
                "end_char": candidate["end"],
                "char_count": len(content),
                "preview": content[:200],
            }
        )

    return chapters

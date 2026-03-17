#!/usr/bin/env python3
"""
测试记忆搜索：调用 GET /browse/glossary 并按关键词匹配。
要求：Nocturne 已启动（http://127.0.0.1:8000）
运行：py -3 scripts/test_memory_search.py [关键词]
"""
import httpx
import sys

BASE = "http://127.0.0.1:8000"
QUERY = (sys.argv[1:] or ["邮箱"])[0]


def main():
    print("Nocturne 记忆搜索测试")
    print(f"  关键词: {QUERY}")
    print()

    with httpx.Client(timeout=10) as client:
        try:
            r = client.get(f"{BASE}/health")
            if r.status_code != 200:
                print("[FAIL] Nocturne 未就绪")
                return
        except Exception as e:
            print(f"[FAIL] Nocturne 不可达: {e}")
            return

        r = client.get(f"{BASE}/browse/glossary")
        if not r.ok:
            print(f"[FAIL] glossary: {r.status_code} {r.text[:200]}")
            return
        data = r.json()
        glossary = data.get("glossary") or []
        print(f"[OK] 索引词条数: {len(glossary)}")

        q = QUERY.lower()
        matches = []
        for entry in glossary:
            kw = (entry.get("keyword") or "").lower()
            if q in kw or kw in q:
                for node in entry.get("nodes") or []:
                    uri = node.get("uri") or ""
                    if uri:
                        matches.append({"uri": uri, "keyword": entry.get("keyword"), "snippet": (node.get("content_snippet") or "")[:80]})

        print(f"  匹配到: {len(matches)} 条")
        for i, m in enumerate(matches[:10], 1):
            print(f"  {i}. {m['uri']}")
            if m.get("snippet"):
                print(f"     {m['snippet']}...")


if __name__ == "__main__":
    main()

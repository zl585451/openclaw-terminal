#!/usr/bin/env python3
"""
测试对话摘要写入 Nocturne：core://my_user/history/YYYY-MM-DD/HH-MM-SS
要求：Nocturne 已启动（http://127.0.0.1:8000）
"""
import httpx
import json
from datetime import datetime

BASE = "http://127.0.0.1:8000"


def now_path():
    d = datetime.now()
    date_path = d.strftime("%Y-%m-%d")
    time_path = d.strftime("%H-%M-%S")
    return f"my_user/history/{date_path}/{time_path}", d.strftime("%Y-%m-%d %H:%M:%S")


def ensure_parent(client, domain, path_segments):
    """逐级创建父节点（POST），已存在则忽略"""
    for i in range(1, len(path_segments) + 1):
        path = "/".join(path_segments[:i])
        name = path_segments[i - 1]
        r = client.post(
            f"{BASE}/browse/node",
            params={"path": path, "domain": domain},
            json={"content": f"{name} 节点", "priority": 2, "disclosure": ""},
        )
        if r.status_code not in (200, 201) and "already exists" not in r.text.lower():
            print(f"  [WARN] parent {domain}://{path}: {r.status_code} {r.text[:80]}")


def write_summary(client, path, payload):
    r = client.post(
        f"{BASE}/browse/node",
        params={"path": path, "domain": "core"},
        json={
            "content": json.dumps(payload, ensure_ascii=False),
            "priority": 2,
            "disclosure": "",
        },
    )
    return r.status_code, r.text


def main():
    path_seg, timestamp = now_path()
    payload = {
        "timestamp": timestamp,
        "user": "用户消息前100字...（测试）",
        "amy": "AMY回复前200字...（测试）",
        "type": "chat",
        "feedback": None,
    }
    print("Nocturne 对话摘要写入测试")
    print(f"  路径: core://{path_seg}")
    print(f"  内容: {json.dumps(payload, ensure_ascii=False, indent=2)}")
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

        segments = path_seg.split("/")
        ensure_parent(client, "core", segments[:-1])
        code, text = write_summary(client, path_seg, payload)
        if code in (200, 201):
            print("[OK] 摘要已写入")
        else:
            print(f"[FAIL] {code} {text[:200]}")


if __name__ == "__main__":
    main()

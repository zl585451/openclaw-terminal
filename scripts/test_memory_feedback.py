#!/usr/bin/env python3
"""
测试反馈写入：模拟少爷说「好/不对/应该是」后写入的路径与格式。
要求：Nocturne 已启动（http://127.0.0.1:8000）
运行：py -3 scripts/test_memory_feedback.py
"""
import httpx
import json
from datetime import datetime

BASE = "http://127.0.0.1:8000"


def now_path():
    d = datetime.now()
    date_path = d.strftime("%Y-%m-%d")
    time_path = d.strftime("%H-%M-%S")
    return date_path, time_path, d.strftime("%Y-%m-%d %H:%M:%S")


def ensure_parent(client, domain, path_segments):
    for i in range(1, len(path_segments) + 1):
        path = "/".join(path_segments[:i])
        name = path_segments[i - 1]
        r = client.post(
            f"{BASE}/browse/node",
            params={"path": path, "domain": domain},
            json={"content": f"{name} 节点", "priority": 2, "disclosure": ""},
        )
        if r.status_code not in (200, 201) and "already exists" not in r.text.lower():
            print(f"  [WARN] parent {domain}://{path}: {r.status_code}")


def write_feedback(client, path_seg, payload):
    r = client.post(
        f"{BASE}/browse/node",
        params={"path": path_seg, "domain": "core"},
        json={
            "content": json.dumps(payload, ensure_ascii=False),
            "priority": 2,
            "disclosure": "",
        },
    )
    return r.status_code, r.text


def main():
    date_path, time_path, timestamp = now_path()
    user_msg = "好"
    amy_reply = "AMY 的回复前 200 字..."

    payload = {
        "timestamp": timestamp,
        "user_message": user_msg[:100],
        "amy_reply": amy_reply[:200],
        "feedback_type": "positive",
        "reason": "好",
        "action_taken": "已写入记忆",
    }

    path_seg = f"agent/feedback/positive/{date_path}/{time_path}"
    print("Nocturne 反馈写入测试")
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
        code, text = write_feedback(client, path_seg, payload)
        if code in (200, 201):
            print("[OK] 反馈已写入")
        else:
            print(f"[FAIL] {code} {text[:200]}")


if __name__ == "__main__":
    main()

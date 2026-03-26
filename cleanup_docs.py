import os
import shutil

docs_dir = r"E:\windows-window\OpenClaw-Terminal\docs"
archive_dir = os.path.join(docs_dir, "archive")
feature_map_dir = os.path.join(docs_dir, "feature-map")

# 确保 archive 目录存在
os.makedirs(archive_dir, exist_ok=True)

# 从 FEATURE_MAP.md 提取已索引的路径
feature_map_file = os.path.join(docs_dir, "FEATURE_MAP.md")
indexed_paths = set()

with open(feature_map_file, 'r', encoding='utf-8') as f:
    content = f.read()
    # 提取所有 docs/feature-map/xxx.md 的路径
    import re
    matches = re.findall(r'docs/(feature-map/[^)]+)', content)
    for m in matches:
        # 只取目录部分
        dir_name = m.split('/')[0]
        indexed_paths.add(dir_name)

# 额外保留的目录（可能在地图里或重要）
keep_dirs = {'feature-map', 'archive', 'architecture', 'for_claude'}

# 要移动的文件扩展名
move_extensions = {'.md', '.json', '.png'}

# 遍历 docs 目录
for item in os.listdir(docs_dir):
    item_path = os.path.join(docs_dir, item)
    
    # 跳过目录（除非是明确要移动的）
    if os.path.isdir(item_path):
        if item not in keep_dirs:
            # 移动整个目录到 archive
            dest = os.path.join(archive_dir, item)
            print(f"移动目录：{item} -> archive/{item}")
            if os.path.exists(dest):
                shutil.rmtree(dest)
            shutil.move(item_path, dest)
    else:
        # 文件处理
        _, ext = os.path.splitext(item)
        if ext.lower() in move_extensions:
            # 移动到 archive
            dest = os.path.join(archive_dir, item)
            print(f"移动文件：{item} -> archive/{item}")
            if os.path.exists(dest):
                os.remove(dest)
            shutil.move(item_path, dest)

print("\n整理完成！")

# -*- mode: python ; coding: utf-8 -*-
# AI.library - PyInstaller 打包配置
# 用法: pyinstaller ai_library_server.spec
# 输出: dist/ai_library_server/ai_library_server.exe

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

hidden_imports = []
for module_name in [
    'uvicorn',
    'fastapi',
    'starlette',
    'pydantic',
    'pydantic_core',
    'chromadb',
    'langchain_text_splitters',
    'fitz',
    'sentence_transformers',
    'tokenizers',
    'transformers',
    'openai',
    'cv2',
    'numpy',
    'pdf2image',
    'pytesseract',
    'paddleocr',
    'paddle',
]:
    try:
        hidden_imports += collect_submodules(module_name)
    except Exception:
        pass

datas = []
for module_name in [
    'chromadb',
    'sentence_transformers',
    'transformers',
    'tokenizers',
]:
    try:
        datas += collect_data_files(module_name)
    except Exception:
        pass

a = Analysis(
    ['ai_library_launcher.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ai_library_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ai_library_server',
)

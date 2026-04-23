# 2026-04-24 Script Sidebar Virtualization

## Summary

- Optimized the script chapter directory with lightweight virtualization.

## What Changed

- `ScriptSidebar` now renders only the visible window of chapter items plus a small overscan buffer.
- The chapter list uses a fixed-row virtual layout instead of mounting the full chapter list on expand.
- Active chapter changes automatically scroll the virtual list to keep the current item in view.

## User Impact

- Expanding and collapsing the chapter directory is noticeably smoother when documents contain many chapters.
- Scrolling the chapter list remains responsive without introducing a new dependency.

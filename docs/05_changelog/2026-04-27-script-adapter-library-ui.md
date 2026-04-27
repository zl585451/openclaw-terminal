# 2026-04-27 Script Adapter Library UI

## 这次做了什么

Week 6 Track 1 已落地：

1. 工作台主导航新增第 4 个 tab：`📚 我的书库`
2. 书库支持网页内上传 `.txt` / `.md`，不再要求用 curl
3. 书库支持列表浏览、章节抽屉预览、删除书籍
4. 继续复用原有 AI.library 6 个接口，没有改 ai_library 后端

补充调整：

1. 入口已从“工作台顶部 tab”迁到 Chat 顶部和内容创作首页
2. 工作台内部不再把书库和“团队流程 / Agent 池”并列
3. 书库现在更明确地作为“项目启动前的素材空间”存在

## 改动文件

1. `electron/main.ts`
2. `electron/preload.ts`
3. `src/types/electronAPI.ts`
4. `src/modules/script-adapter/services/aiLibraryClient.ts`
5. `src/modules/script-adapter/store/scriptAdapterStore.ts`
6. `src/modules/script-adapter/ui/ScriptAdapterLayout.tsx`
7. `src/modules/script-adapter/ui/Library/LibraryView.tsx`
8. `src/modules/script-adapter/ui/Library/BookCard.tsx`
9. `src/modules/script-adapter/ui/Library/UploadDialog.tsx`
10. `src/modules/script-adapter/ui/Library/BookDetailDrawer.tsx`
11. `src/modules/script-adapter/styles/scriptAdapter.module.css`

## 新增 IPC

1. `library:pickFile`
2. `library:upload`
3. `library:delete`

## 复制粘贴就能用的开关说明

不用开终端，不用改 config，不用复制任何命令。

1. 打开 OCT。
2. 在 Chat 顶部点 `📚 项目素材库`，或先进入“内容创作”首页再点 `项目素材库`。
3. 点 `+ 上传新书`，或者把 `.txt` / `.md` 直接拖进上传框。
4. 填书名后点 `开始上传`。
5. 上传成功后，列表会自动刷新；点 `查看` 可看章节，点 `删除` 可移除。

如果 Zilong 只是验收本功能，上面 5 步直接照着点就行。

## 验收结果

1. 空书库会显示空态卡片和上传引导。
2. AI.library 离线时，书库主页会显示红框错误，不会把页面打崩。
3. 章节抽屉右侧只预览前 5000 字，但工作台取章仍会拿完整正文。

## 已知限制

1. 目前只支持 `.txt` / `.md`，`.docx` 需要先转文本。
2. 还没有分页、搜索、标签和分组。
3. 50 本以上书库的性能本轮没有专项压测。

## 自测

1. `npx tsc --noEmit`
2. `npx tsc -p tsconfig.electron.json --noEmit`

# P0-3 补充 — ReviewGate 改前/改后预览

> 2026-04-29 更新：该方案中的“批准 / 重跑 / 跳过”阻塞式复核链路已被放弃。当前实现改为“非阻塞质检提示”：
> 质检报告继续生成，但不再把批次挂起在 `awaiting_review`，用户也不需要点“批准继续制作”才能完成本章。

> 优先级：P0 补充（接 P0-3 之后立即执行）  
> 预计耗时：半天  
> 前置条件：P0-cursor-tasks.md 全部完成（approveGate / rejectGate IPC 已接通）  
> 验证命令：`npx tsc --noEmit`（无新类型错误）

---

## 背景

P0-3 已让 ReviewGate 真正阻塞，前端有批准/拒绝两个按钮。  
但用户点按钮之前是盲的——不知道这章改得怎样，只能凭感觉决定。

这份文档记录的是当时的补充设计：在 `awaiting_review` 弹出块里加入：

1. **质检结论摘要**：qualityReviewer 的结论（通过/带条件/需返工）+ 最多 3 条问题  
2. **改前 / 改后对比**：抽 3 处代表性段落，左侧原文、右侧 AI 台本 + 改写说明  
3. **三选按钮**：批准 · 重跑 · 跳过标记（取代原来的两个按钮）

后续产品验证发现，这条“人工批准后继续”的链路会打断单章 / 小批量试产，因此现网已改成只保留预览组件，不再阻塞批次。

---

## 文件清单

```
新增
  src/modules/script-adapter/ui/Workbench/ReviewGatePreview.tsx

修改
  src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx  ← 引入组件，替换旧按钮区
  src/modules/script-adapter/styles/scriptAdapter.module.css     ← 新增 8 个 class
```

---

## TASK-P0-3-G：新建 `ReviewGatePreview.tsx`

**路径**：`src/modules/script-adapter/ui/Workbench/ReviewGatePreview.tsx`

完整写入以下内容，不要修改任何现有文件：

```tsx
import { useState, useEffect } from 'react';
import type { ChapterRunRecord } from '../../types/batch';
import type {
  AdaptedScriptPayload,
  AdaptedSegment,
  ArtifactEnvelope,
  ReviewReportPayload,
} from '../../types/execution';
import { getChapterText } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

const CONCLUSION_META: Record<string, { label: string; color: string }> = {
  pass:             { label: '✓ 质检通过，可交付',  color: '#1a7f4b' },
  pass_with_changes: { label: '△ 带条件通过',      color: '#a07000' },
  reject:           { label: '✗ 质检建议返工',      color: '#b0180a' },
};

const SEG_TYPE_LABEL: Record<string, string> = {
  narration:       '旁白',
  dialogue:        '对话',
  inner_monologue: '内心',
};

interface ReviewGatePreviewProps {
  run: ChapterRunRecord;
  bookId: string;
}

export function ReviewGatePreview({ run, bookId }: ReviewGatePreviewProps) {
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setFetchState('loading');
    setOriginalText(null);
    getChapterText(bookId, run.chapterIndex)
      .then(({ text }) => {
        if (!cancelled) {
          setOriginalText(text);
          setFetchState('ok');
        }
      })
      .catch(() => {
        if (!cancelled) setFetchState('error');
      });
    return () => { cancelled = true; };
  }, [bookId, run.chapterIndex]);

  const sheet = run.sheet;
  if (!sheet) return null;

  const allArtifacts = Object.values(sheet.artifacts) as ArtifactEnvelope[];
  const adapted  = findArtifact<AdaptedScriptPayload>(allArtifacts, 'adapted_script');
  const reviewed = findArtifact<ReviewReportPayload>(allArtifacts, 'review_report');

  const segments   = adapted?.payload?.segments ?? [];
  const conclusion = reviewed?.payload?.conclusion;
  const issues     = reviewed?.payload?.issues ?? [];

  // 挑 3 个代表性段落：优先有改写说明的 + 旁白 + 对话各一段
  const picks = pickRepresentativeSegments(segments);

  // 原文按段落分割，与 picks 按位置比例对齐
  const originalParas = splitParas(originalText ?? '');

  return (
    <div className={styles.reviewGatePreview}>
      {/* ── 质检摘要 ── */}
      <div className={styles.reviewGateSummary}>
        <p className={styles.reviewGateConclusion}
           style={{ color: CONCLUSION_META[conclusion ?? '']?.color ?? 'inherit' }}>
          {CONCLUSION_META[conclusion ?? '']?.label ?? '质检结果加载中…'}
        </p>
        {issues.length > 0 && (
          <ul className={styles.reviewGateIssueList}>
            {issues.slice(0, 3).map((issue, idx) => (
              <li key={idx}>
                <strong>[{issue.severity}] {issue.category}</strong>
                {issue.location ? <em> @ {issue.location}</em> : null}
                {' — '}{issue.description}
              </li>
            ))}
            {issues.length > 3 && (
              <li className={styles.reviewGateMoreIssues}>
                还有 {issues.length - 3} 条问题，批准后可在交付预览中查看完整报告。
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ── 对比表头 ── */}
      {picks.length > 0 && (
        <div className={styles.reviewGateCompareHeader}>
          <span>改写前（原文节选）</span>
          <span>改写后（AI 台本）</span>
        </div>
      )}

      {/* ── 逐行对比 ── */}
      {picks.map((seg, rowIdx) => {
        const alignedPara = alignPara(originalParas, segments, seg, rowIdx);
        return (
          <div key={seg.segmentId ?? rowIdx} className={styles.reviewGateCompareRow}>
            {/* 左：原文 */}
            <div className={styles.reviewGateOriginal}>
              {fetchState === 'loading' && (
                <span className={styles.reviewGateDim}>正在加载原文…</span>
              )}
              {fetchState === 'error' && (
                <span className={styles.reviewGateDim}>原文服务暂不可用</span>
              )}
              {fetchState === 'ok' && alignedPara && (
                <p>{truncate(alignedPara, 220)}</p>
              )}
              {fetchState === 'ok' && !alignedPara && (
                <span className={styles.reviewGateDim}>此处无对应原文段落</span>
              )}
            </div>
            {/* 右：AI 台本 */}
            <div className={styles.reviewGateAdapted}>
              <small className={styles.reviewGateSegLabel}>
                [{SEG_TYPE_LABEL[seg.type] ?? seg.type}
                {seg.speaker ? ` · ${seg.speaker}` : ''}]
              </small>
              <p>{seg.text}</p>
              {seg.rewriteNote && (
                <small className={styles.reviewGateNote}>
                  改写说明：{seg.rewriteNote}
                </small>
              )}
            </div>
          </div>
        );
      })}

      {picks.length === 0 && (
        <p className={styles.reviewGateDim}>textRewriter 产物尚未生成，无法展示对比。</p>
      )}
    </div>
  );
}

// ── 工具函数 ────────────────────────────────────────────────

function findArtifact<T>(
  artifacts: ArtifactEnvelope[],
  type: string,
): ArtifactEnvelope<T> | undefined {
  return artifacts.find((a) => a.artifactType === type) as ArtifactEnvelope<T> | undefined;
}

function pickRepresentativeSegments(segments: AdaptedSegment[]): AdaptedSegment[] {
  if (segments.length === 0) return [];
  const withNote  = segments.find((s) => s.rewriteNote);
  const narration = segments.find((s) => s.type === 'narration' && s !== withNote);
  const dialogue  = segments.find(
    (s) => s.type === 'dialogue' && s !== withNote && s !== narration,
  );
  const candidates = [withNote, narration, dialogue].filter(
    (s): s is AdaptedSegment => Boolean(s),
  );
  // 不够 3 个时从头补
  for (const s of segments) {
    if (candidates.length >= 3) break;
    if (!candidates.includes(s)) candidates.push(s);
  }
  return candidates.slice(0, 3);
}

function splitParas(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15);
}

function alignPara(
  paras: string[],
  allSegs: AdaptedSegment[],
  seg: AdaptedSegment,
  rowIdx: number,
): string | null {
  if (paras.length === 0) return null;
  const segIdx = allSegs.indexOf(seg);
  const ratio  = allSegs.length > 1 ? segIdx / (allSegs.length - 1) : rowIdx / 2;
  const paraIdx = Math.min(paras.length - 1, Math.round(ratio * (paras.length - 1)));
  return paras[paraIdx] ?? null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…';
}
```

**验收**：`npx tsc --noEmit` 无新错误。

---

## TASK-P0-3-H：修改 `BatchProgressView.tsx`

**路径**：`src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx`

### 改动 1 — 顶部新增 import

在文件第 4 行（`import { DeliveryPreview }` 之前）插入：

```tsx
import { ReviewGatePreview } from './ReviewGatePreview';
```

### 改动 2 — 替换 `gateReviewBlock` 区域

找到现有的这段（约 131–158 行）：

```tsx
{sortedRuns.some((run) => run.status === 'awaiting_review') ? (
  <div className={styles.gateReviewBlock}>
    {sortedRuns
      .filter((run) => run.status === 'awaiting_review' && run.pendingGateId)
      .map((run) => (
        <div key={run.id} className={styles.gateReviewActions}>
          <div>
            <strong>质检完成，等待你复核</strong>
            <p>{run.chapterTitle || `第 ${run.chapterIndex + 1} 章`} 的质检节点已暂停，批准后会继续进入打包。</p>
          </div>
          <button
            type="button"
            className={styles.confirmStartButton}
            onClick={() => void approveGatewayGate(batch.id, run.pendingGateId!, '').then(onRefresh)}
          >
            批准，继续制作
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => void rejectGatewayGate(batch.id, run.pendingGateId!, '需要重做').then(onRefresh)}
          >
            拒绝，重新执行此章
          </button>
        </div>
      ))}
  </div>
) : null}
```

**整体替换为**：

```tsx
{sortedRuns.some((run) => run.status === 'awaiting_review') ? (
  <div className={styles.gateReviewBlock}>
    {sortedRuns
      .filter((run) => run.status === 'awaiting_review' && run.pendingGateId)
      .map((run) => (
        <div key={run.id}>
          <div className={styles.gateReviewActions}>
            <div>
              <strong>质检完成，等待你复核</strong>
              <p>
                {run.chapterTitle || `第 ${run.chapterIndex + 1} 章`}{' '}
                的质检节点已暂停，确认后继续打包；拒绝则重跑；跳过则标记此章待人工处理。
              </p>
            </div>
            <button
              type="button"
              className={styles.confirmStartButton}
              onClick={() => void approveGatewayGate(batch.id, run.pendingGateId!, '').then(onRefresh)}
            >
              ✓ 批准，继续制作
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void rejectGatewayGate(batch.id, run.pendingGateId!, 'rerun').then(onRefresh)}
            >
              🔁 重跑此章
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void rejectGatewayGate(batch.id, run.pendingGateId!, 'skip_flag').then(onRefresh)}
            >
              ⏭ 跳过，标记待处理
            </button>
          </div>
          <ReviewGatePreview run={run} bookId={batch.bookId} />
        </div>
      ))}
  </div>
) : null}
```

**注意**：`batch.bookId` 已在 `BatchJob` 类型上，无需额外 prop 传递。

**验收**：`npx tsc --noEmit` 无新错误；热更新后 `awaiting_review` 状态行展开时能看到预览块。

---

## TASK-P0-3-I：追加 CSS

**路径**：`src/modules/script-adapter/styles/scriptAdapter.module.css`

在文件末尾追加以下内容（紧接在最后一个 `}` 之后）：

```css
/* ── ReviewGatePreview ─────────────────────────────────────── */

.reviewGatePreview {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.reviewGateSummary {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(180, 140, 60, 0.22);
}

.reviewGateConclusion {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 6px;
}

.reviewGateIssueList {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: rgba(40, 30, 10, 0.75);
  line-height: 1.6;
}

.reviewGateMoreIssues {
  color: rgba(40, 30, 10, 0.45);
  font-style: italic;
}

.reviewGateCompareHeader {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(60, 50, 20, 0.5);
  padding: 0 4px;
}

.reviewGateCompareRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: start;
}

.reviewGateOriginal,
.reviewGateAdapted {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.65;
}

.reviewGateOriginal {
  background: rgba(245, 240, 228, 0.7);
  border: 1px solid rgba(180, 160, 100, 0.2);
  color: rgba(50, 40, 15, 0.8);
}

.reviewGateAdapted {
  background: rgba(232, 244, 255, 0.75);
  border: 1px solid rgba(80, 150, 220, 0.2);
  color: rgba(15, 40, 70, 0.85);
}

.reviewGateOriginal p,
.reviewGateAdapted p {
  margin: 4px 0 0;
}

.reviewGateSegLabel {
  font-size: 11px;
  font-weight: 600;
  color: rgba(30, 80, 160, 0.65);
  letter-spacing: 0.04em;
}

.reviewGateNote {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(30, 80, 160, 0.55);
  font-style: italic;
  border-left: 2px solid rgba(80, 150, 220, 0.3);
  padding-left: 6px;
}

.reviewGateDim {
  font-size: 12px;
  color: rgba(80, 70, 40, 0.4);
  font-style: italic;
}
```

**验收**：热更新后样式渲染正确，无 CSS Module 报错。

---

## 整体验收清单

执行完三个任务后，依次确认：

- [ ] `npx tsc --noEmit` — 0 错误
- [ ] 热更新 — 无运行时报错
- [ ] 触发一个单章批次跑到 `quality_review` gate（mock 模式即可）
- [ ] `awaiting_review` 状态下弹出块内：
  - [ ] 质检结论文字出现（颜色区分 pass / pass_with_changes / reject）
  - [ ] 最多 3 条问题列表正常展示
  - [ ] 对比区域出现两列（左原文 / 右 AI 台本）
  - [ ] 原文列：Library 在线时显示原文片段；离线时显示"原文服务暂不可用"灰字
  - [ ] AI 台本列：类型标签 + 台本文字 + 改写说明（若有）
  - [ ] 三个按钮（批准 / 重跑 / 跳过）均可点击且触发对应 IPC

---

## 补充说明（给 Cursor 读）

### "跳过标记"的行为

`rejectGatewayGate(batchId, gateId, 'skip_flag')` 会把这一章标记为 `failed`，批次继续跑后续章节。  
`skip_flag` 只是 reason 字段，不需要网关特殊处理——现有逻辑已满足。  
人工处理阶段（Phase 3）会统一汇总所有 `skip_flag` 章节到复核工作台。

### Library 离线降级

`getChapterText` 抛错时 `fetchState` 变为 `'error'`，左列显示灰色提示文字。  
**不要在这种情况下阻止批准/拒绝按钮**——用户可以在没有原文对比的情况下仍然做决定。

### 不需要做的事

- 不要持久化 `originalText` 到 store 或 SQLite
- 不要在 `ReviewGatePreview` 里处理批准/拒绝逻辑（按钮保留在父组件 `BatchProgressView`）
- 不要引入任何新的第三方依赖

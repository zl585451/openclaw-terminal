import { useEffect, useState } from 'react';
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
  pass: { label: '✓ 质检通过，可交付', color: '#1a7f4b' },
  pass_with_changes: { label: '△ 带条件通过', color: '#a07000' },
  reject: { label: '✗ 质检建议返工', color: '#b0180a' },
};

const SEG_TYPE_LABEL: Record<string, string> = {
  narration: '旁白',
  dialogue: '对话',
  inner_monologue: 'OS',
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
    return () => {
      cancelled = true;
    };
  }, [bookId, run.chapterIndex]);

  const sheet = run.sheet;
  if (!sheet) return null;

  const allArtifacts = Object.values(sheet.artifacts) as ArtifactEnvelope[];
  const adapted = findArtifact<AdaptedScriptPayload>(allArtifacts, 'adapted_script');
  const reviewed = findArtifact<ReviewReportPayload>(allArtifacts, 'review_report');
  if (!adapted || !reviewed) return null;

  const segments = adapted?.payload?.segments ?? [];
  const conclusion = reviewed?.payload?.conclusion;
  const issues = reviewed?.payload?.issues ?? [];
  const picks = pickRepresentativeSegments(segments);
  const originalParas = splitParas(originalText ?? '');

  return (
    <div className={styles.reviewGatePreview}>
      <div className={styles.reviewGateSummary}>
        <p
          className={styles.reviewGateConclusion}
          style={{ color: CONCLUSION_META[conclusion ?? '']?.color ?? 'inherit' }}
        >
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

      {picks.length > 0 && (
        <div className={styles.reviewGateCompareHeader}>
          <span>改写前（原文节选）</span>
          <span>改写后（AI 台本）</span>
        </div>
      )}

      {picks.map((seg, rowIdx) => {
        const alignedPara = alignPara(originalParas, segments, seg, rowIdx);
        return (
          <div key={seg.segmentId ?? rowIdx} className={styles.reviewGateCompareRow}>
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

function findArtifact<T>(
  artifacts: ArtifactEnvelope[],
  type: string,
): ArtifactEnvelope<T> | undefined {
  return artifacts.find((artifact) => artifact.artifactType === type) as ArtifactEnvelope<T> | undefined;
}

function pickRepresentativeSegments(segments: AdaptedSegment[]): AdaptedSegment[] {
  if (segments.length === 0) return [];
  const withNote = segments.find((segment) => segment.rewriteNote);
  const narration = segments.find((segment) => segment.type === 'narration' && segment !== withNote);
  const dialogue = segments.find(
    (segment) => segment.type === 'dialogue' && segment !== withNote && segment !== narration,
  );
  const candidates = [withNote, narration, dialogue].filter(
    (segment): segment is AdaptedSegment => Boolean(segment),
  );
  for (const segment of segments) {
    if (candidates.length >= 3) break;
    if (!candidates.includes(segment)) candidates.push(segment);
  }
  return candidates.slice(0, 3);
}

function splitParas(text: string): string[] {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 15);
}

function alignPara(
  paras: string[],
  allSegs: AdaptedSegment[],
  seg: AdaptedSegment,
  rowIdx: number,
): string | null {
  if (paras.length === 0) return null;
  const segIdx = allSegs.indexOf(seg);
  const ratio = allSegs.length > 1 ? segIdx / (allSegs.length - 1) : rowIdx / 2;
  const paraIdx = Math.min(paras.length - 1, Math.round(ratio * (paras.length - 1)));
  return paras[paraIdx] ?? null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…';
}

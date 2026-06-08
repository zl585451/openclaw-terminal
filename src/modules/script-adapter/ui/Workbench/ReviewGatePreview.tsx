import { useMemo, useState } from 'react';
import type { ChapterRunRecord } from '../../types/batch';
import type {
  AdaptedScriptPayload,
  AdaptedSegment,
  ArtifactEnvelope,
  ReviewGate,
  ReviewIssue,
  ReviewReportPayload,
} from '../../types/execution';
import styles from '../../styles/scriptAdapter.module.css';

const SEG_TYPE_LABEL: Record<string, string> = {
  narration: '旁白',
  dialogue: '对话',
  inner_monologue: 'OS',
  document_reading: '待确认',
};

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'narration', label: '旁白' },
  { id: 'dialogue', label: '对话' },
  { id: 'inner_monologue', label: 'OS' },
  { id: 'review', label: '待确认' },
] as const;

type ReviewTab = 'script' | 'questions' | 'report';
type SegmentFilter = typeof FILTERS[number]['id'];

interface ReviewGatePreviewProps {
  run: ChapterRunRecord;
  bookId: string;
  pendingGate?: ReviewGate | null;
  applying?: boolean;
  error?: string;
  onApplyDecision?: (
    segmentId: string,
    decision: { type: string; speaker?: string; note?: string },
  ) => Promise<void> | void;
  onFinishReview?: () => Promise<void> | void;
}

interface ReviewQuestion {
  segment: AdaptedSegment;
  segmentIndex: number;
  reason: string;
  speakerOptions: string[];
}

export function ReviewGatePreview({
  run,
  pendingGate,
  applying = false,
  error,
  onApplyDecision,
  onFinishReview,
}: ReviewGatePreviewProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>('script');
  const [filter, setFilter] = useState<SegmentFilter>('all');
  const [customSpeakerBySegment, setCustomSpeakerBySegment] = useState<Record<string, string>>({});

  const sheet = run.sheet;
  const artifacts = useMemo(
    () => Object.values(sheet?.artifacts || {}) as ArtifactEnvelope[],
    [sheet],
  );
  const adapted = useMemo(() => findAdaptedScript(artifacts), [artifacts]);
  const reviewed = useMemo(() => findArtifact<ReviewReportPayload>(artifacts, 'review_report'), [artifacts]);
  const segments = adapted?.payload?.segments ?? [];
  const questions = useMemo(() => buildReviewQuestions(segments), [segments]);
  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.segment.segmentId, question])),
    [questions],
  );
  const visibleSegments = useMemo(
    () => filterSegments(segments, questionById, filter),
    [segments, questionById, filter],
  );
  const issues = reviewed?.payload?.issues ?? [];
  const statusLabel = questions.length > 0 ? '△ 带条件通过' : '✓ 可继续';

  if (!sheet) return null;

  const applyNarration = async (question: ReviewQuestion) => {
    await onApplyDecision?.(question.segment.segmentId, {
      type: 'narration',
      speaker: '旁白',
      note: `${question.segment.segmentId} 确认为旁白`,
    });
  };

  const applySpeaker = async (question: ReviewQuestion, speaker: string) => {
    await onApplyDecision?.(question.segment.segmentId, {
      type: 'dialogue',
      speaker,
      note: `${question.segment.segmentId} 确认为 ${speaker}`,
    });
  };

  const applyAllNarration = async () => {
    for (const question of questions) {
      await applyNarration(question);
    }
  };

  return (
    <div className={styles.reviewPanel}>
      <header className={styles.reviewPanelTitle}>
        <div>
          <strong>{run.chapterTitle || `第 ${run.chapterIndex + 1} 章`} · 台本审核</strong>
          <span>{pendingGate?.description || '系统不确定的声线已在台本流中高亮；直接在对应位置选择即可。'}</span>
        </div>
        <em>{statusLabel}</em>
      </header>

      <div className={styles.reviewPanelTabs}>
        <button
          type="button"
          className={activeTab === 'script' ? styles.reviewPanelTabActive : styles.reviewPanelTab}
          onClick={() => setActiveTab('script')}
        >
          台本预览
        </button>
        <button
          type="button"
          className={activeTab === 'questions' ? styles.reviewPanelTabActive : styles.reviewPanelTab}
          onClick={() => {
            setActiveTab('questions');
            setFilter('review');
          }}
        >
          待确认项 <span>{questions.length}</span>
        </button>
        <button
          type="button"
          className={activeTab === 'report' ? styles.reviewPanelTabActive : styles.reviewPanelTab}
          onClick={() => setActiveTab('report')}
        >
          质检报告
        </button>
      </div>

      <div className={styles.reviewPanelBody}>
        {activeTab !== 'report' ? (
          <>
            <div className={styles.reviewFilterChips}>
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? styles.reviewFilterChipActive : styles.reviewFilterChip}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}{item.id === 'review' && questions.length > 0 ? ` ${questions.length}` : ''}
                </button>
              ))}
            </div>

            {adapted ? (
              <div className={styles.reviewScriptFlow}>
                {visibleSegments.map((segment) => (
                  <ScriptFlowRow
                    key={segment.segmentId}
                    segment={segment}
                    question={questionById.get(segment.segmentId)}
                    applying={applying}
                    customSpeaker={customSpeakerBySegment[segment.segmentId] || ''}
                    onCustomSpeakerChange={(value) => setCustomSpeakerBySegment((current) => ({
                      ...current,
                      [segment.segmentId]: value,
                    }))}
                    onApplyNarration={applyNarration}
                    onApplySpeaker={applySpeaker}
                  />
                ))}
                {visibleSegments.length === 0 ? (
                  <p className={styles.reviewPanelEmpty}>当前筛选下没有台本片段。</p>
                ) : null}
              </div>
            ) : (
              <div className={styles.reviewPanelEmptyBox}>
                <strong>台本内容尚未生成或未写入产物</strong>
                <p>当前章节有 pending gate，但没有找到 `adapted_script`。这类节点不能做声线审核。</p>
              </div>
            )}
          </>
        ) : (
          <ReviewReportPanel issues={issues} />
        )}
      </div>

      <footer className={styles.reviewPanelFooter}>
        <p>
          {questions.length > 0
            ? `还有 ${questions.length} 个待确认项未处理。可直接继续，待确认标记会保留在台本中。`
            : '待确认项已处理完，可以继续后续章节。'}
        </p>
        {error ? <div className={styles.reviewErrorText}>{error}</div> : null}
        <div className={styles.reviewPanelActions}>
          {questions.length > 0 ? (
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void applyAllNarration()}
              disabled={applying}
            >
              全部待确认先按旁白
            </button>
          ) : null}
          <button
            type="button"
            className={styles.approveButton}
            onClick={() => void onFinishReview?.()}
            disabled={applying}
          >
            {applying ? '处理中...' : '通过，继续下一章'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function ScriptFlowRow({
  segment,
  question,
  applying,
  customSpeaker,
  onCustomSpeakerChange,
  onApplyNarration,
  onApplySpeaker,
}: {
  segment: AdaptedSegment;
  question?: ReviewQuestion;
  applying: boolean;
  customSpeaker: string;
  onCustomSpeakerChange: (value: string) => void;
  onApplyNarration: (question: ReviewQuestion) => Promise<void>;
  onApplySpeaker: (question: ReviewQuestion, speaker: string) => Promise<void>;
}) {
  if (!question) {
    return (
      <div className={styles.reviewScriptLine}>
        <span>{formatSegmentLabel(segment)}</span>
        <p>{segment.text}</p>
      </div>
    );
  }

  return (
    <div className={styles.reviewScriptLineReview}>
      <span>{formatSegmentLabel(segment)}</span>
      <div>
        <p>{segment.text}</p>
        <small>{question.reason}</small>
        <div className={styles.reviewInlineChoices}>
          <button type="button" onClick={() => void onApplyNarration(question)} disabled={applying}>
            旁白读
          </button>
          {question.speakerOptions.map((speaker) => (
            <button
              key={speaker}
              type="button"
              onClick={() => void onApplySpeaker(question, speaker)}
              disabled={applying}
            >
              {speaker}读
            </button>
          ))}
        </div>
        <div className={styles.reviewInlineCustom}>
          <input
            value={customSpeaker}
            onChange={(event) => onCustomSpeakerChange(event.target.value)}
            placeholder="自定义角色名"
            disabled={applying}
          />
          <button
            type="button"
            onClick={() => customSpeaker.trim() && void onApplySpeaker(question, customSpeaker.trim())}
            disabled={applying || !customSpeaker.trim()}
          >
            应用自定义
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewReportPanel({ issues }: { issues: ReviewIssue[] }) {
  if (issues.length === 0) {
    return <p className={styles.reviewPanelEmpty}>暂无质检问题。</p>;
  }
  return (
    <div className={styles.reviewReportList}>
      {issues.map((issue, index) => (
        <div key={`${issue.category}-${index}`} className={styles.reviewReportItem}>
          <span>[{issue.severity}] {issue.category}</span>
          <p>{issue.description}</p>
          {issue.suggestion ? <small>{issue.suggestion}</small> : null}
        </div>
      ))}
    </div>
  );
}

function findArtifact<T>(
  artifacts: ArtifactEnvelope[],
  type: string,
): ArtifactEnvelope<T> | undefined {
  return artifacts.find((artifact) => artifact.artifactType === type) as ArtifactEnvelope<T> | undefined;
}

function findAdaptedScript(artifacts: ArtifactEnvelope[]): ArtifactEnvelope<AdaptedScriptPayload> | undefined {
  const direct = findArtifact<AdaptedScriptPayload>(artifacts, 'adapted_script');
  if (direct) return direct;
  const packaged = artifacts.find((artifact) => {
    const payload = artifact?.payload as { adapted_script?: AdaptedScriptPayload } | undefined;
    return artifact?.artifactType === 'final_package' && Array.isArray(payload?.adapted_script?.segments);
  }) as ArtifactEnvelope<{ adapted_script: AdaptedScriptPayload }> | undefined;
  if (!packaged) return undefined;
  return {
    ...packaged,
    artifactType: 'adapted_script',
    payload: packaged.payload.adapted_script,
  } as ArtifactEnvelope<AdaptedScriptPayload>;
}

function buildReviewQuestions(segments: AdaptedSegment[]): ReviewQuestion[] {
  const speakers = collectSpeakers(segments);
  return segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => needsManualReview(segment))
    .map(({ segment, index }) => ({
      segment,
      segmentIndex: index,
      reason: getQuestionReason(segment),
      speakerOptions: buildSpeakerOptions(segment, speakers),
    }));
}

function filterSegments(
  segments: AdaptedSegment[],
  questionById: Map<string, ReviewQuestion>,
  filter: SegmentFilter,
): AdaptedSegment[] {
  if (filter === 'all') return segments;
  if (filter === 'review') return segments.filter((segment) => questionById.has(segment.segmentId));
  return segments.filter((segment) => segment.type === filter);
}

function needsManualReview(segment: AdaptedSegment): boolean {
  if (segment.type === 'document_reading') return true;
  if (segment.type !== 'dialogue' && segment.type !== 'inner_monologue') return false;
  const speaker = String(segment.speaker || '').trim();
  return !speaker || /未定|待确认|unknown|unresolved|文献/i.test(speaker);
}

function getQuestionReason(segment: AdaptedSegment): string {
  if (segment.type === 'document_reading') return 'AI 无法确定这段文字应该归旁白还是角色声线';
  if (segment.type === 'inner_monologue') return 'AI 无法确定这段 OS 属于哪个角色';
  return 'AI 无法确定这句台词的说话人';
}

function collectSpeakers(segments: AdaptedSegment[]): string[] {
  const values = new Set<string>();
  for (const segment of segments) {
    const speaker = String(segment.speaker || '').trim();
    if (!speaker || /未定|待确认|unknown|unresolved|文献|SFX|系统音/i.test(speaker)) continue;
    values.add(speaker);
  }
  return [...values].slice(0, 5);
}

function buildSpeakerOptions(segment: AdaptedSegment, speakers: string[]): string[] {
  const current = String(segment.speaker || '').trim();
  const values = new Set<string>();
  if (current && !/未定|待确认|unknown|unresolved|文献/i.test(current)) values.add(current);
  for (const speaker of speakers) values.add(speaker);
  return [...values].slice(0, 3);
}

function formatSegmentLabel(segment: AdaptedSegment): string {
  if (segment.type === 'narration') return '旁白';
  if (segment.type === 'document_reading') return '待确认';
  return segment.speaker || SEG_TYPE_LABEL[segment.type] || '未定';
}

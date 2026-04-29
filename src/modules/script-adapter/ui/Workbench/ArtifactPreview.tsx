import { useState } from 'react';
import type {
  AdaptedScriptPayload,
  AdaptedSegment,
  ArtifactEnvelope,
  DeliveryPackagePayload,
  PerformanceDesignPayload,
  ReviewIssue,
  ReviewReportPayload,
  VoiceRoleMarkersPayload,
} from '../../types/execution';
import styles from '../../styles/scriptAdapter.module.css';

const ROLE_CATEGORY_LABEL: Record<string, string> = {
  narrator: '旁白',
  main: '主要',
  support: '配角',
  unresolved: '待定',
  sfx: '功能音',
};

const CONCLUSION_LABEL: Record<string, string> = {
  pass: '可直接交付',
  pass_with_changes: '带条件交付',
  reject: '需返工',
};

interface ArtifactPreviewProps {
  artifact: ArtifactEnvelope;
  mode?: 'compact' | 'full';
}

export function ArtifactPreview({ artifact, mode = 'compact' }: ArtifactPreviewProps) {
  const [open, setOpen] = useState(mode === 'full');
  const [copied, setCopied] = useState(false);
  const failed = artifact.metrics?.error === 1;
  const modeClass = open || mode === 'full' ? styles['artifactPreview--full'] : styles['artifactPreview--compact'];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(artifact.payload ?? {}, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <article className={`${styles.artifactPreviewCard} ${modeClass} ${failed ? styles.artifactPreviewFailed : ''}`}>
      <div className={styles.artifactPreviewHeader}>
        <div>
          <span>{artifact.artifactType}</span>
          <strong>{artifact.title}</strong>
        </div>
        <div className={styles.artifactHeaderActions}>
          <em>{formatMetrics(artifact.metrics)}</em>
          <button type="button" className={styles.copyJsonButton} onClick={handleCopy}>
            {copied ? '已复制' : '复制为 JSON'}
          </button>
        </div>
      </div>
      <p>{artifact.summary}</p>
      <details
        className={styles.artifactDetails}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>{open ? '收起结构化产物' : '展开结构化产物'}</summary>
        {failed ? <div className={styles.artifactErrorBox}>{artifact.summary}</div> : null}
        <ArtifactPayload artifact={artifact} />
      </details>
    </article>
  );
}

function ArtifactPayload({ artifact }: { artifact: ArtifactEnvelope }) {
  if (artifact.artifactType === 'adapted_script') {
    return <AdaptedScriptView payload={artifact.payload as AdaptedScriptPayload} />;
  }

  if (artifact.artifactType === 'voice_registry') {
    return <VoiceRegistryView payload={artifact.payload as VoiceRoleMarkersPayload} />;
  }

  if (artifact.artifactType === 'performance_design') {
    return <PerformanceDesignView payload={artifact.payload as PerformanceDesignPayload} />;
  }

  if (artifact.artifactType === 'review_report') {
    return <ReviewReportView payload={artifact.payload as ReviewReportPayload} />;
  }

  return <FinalPackageView payload={artifact.payload as DeliveryPackagePayload} />;
}

function AdaptedScriptView({ payload }: { payload: AdaptedScriptPayload }) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  return (
    <div className={styles.scriptSegmentList}>
      <div className={styles.artifactSectionHeader}>
        <strong>{payload?.chapterTitle || '未命名台本'}</strong>
        <span>{segments.length} 段 · {payload?.totalCharCount || 0} 字</span>
      </div>
      {segments.map((segment) => (
        <ScriptSegmentBubble key={segment.segmentId} segment={segment} />
      ))}
      {segments.length === 0 ? <div className={styles.emptyArtifactState}>暂无台本片段。</div> : null}
    </div>
  );
}

function ScriptSegmentBubble({ segment }: { segment: AdaptedSegment }) {
  const speaker = segment.speaker ?? (segment.type === 'narration' ? '旁白' : '内心');
  return (
    <div className={`${styles.scriptSegmentBubble} ${styles[`scriptLine--${segment.type}`] || ''}`}>
      <span>{speaker} · {segment.segmentId}</span>
      <p>{segment.text}</p>
      {segment.rewriteNote ? <small>{segment.rewriteNote}</small> : null}
    </div>
  );
}

function VoiceRegistryView({ payload }: { payload: VoiceRoleMarkersPayload }) {
  const registry = Array.isArray(payload?.registry) ? payload.registry : [];
  return (
    <div className={styles.voiceRoleTableWrap}>
      <table className={styles.artifactTable}>
        <thead>
          <tr>
            <th>角色名</th>
            <th>类别</th>
            <th>出场</th>
            <th>声线建议</th>
          </tr>
        </thead>
        <tbody>
          {registry.map((role) => (
            <tr key={role.roleName}>
              <td>{role.roleName}</td>
              <td>
                <span className={`${styles.roleCategory} ${styles[`roleCategory--${role.category}`]}`}>
                  {ROLE_CATEGORY_LABEL[role.category] ?? role.category}
                </span>
              </td>
              <td>{role.appearanceCount}</td>
              <td>{role.voiceHint}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {registry.length === 0 ? <div className={styles.emptyArtifactState}>暂无角色音标注。</div> : null}
      {payload?.unresolved?.length ? <p className={styles.artifactFinePrint}>待确认:{payload.unresolved.join(' / ')}</p> : null}
    </div>
  );
}

function PerformanceDesignView({ payload }: { payload: PerformanceDesignPayload }) {
  const sfxList = Array.isArray(payload?.sfxList) ? payload.sfxList : [];
  const cvDirections = Array.isArray(payload?.cvDirections) ? payload.cvDirections : [];
  return (
    <div className={styles.performanceStructured}>
      <section>
        <h4>BGM</h4>
        <div className={styles.bgmCard}>
          <strong>{payload?.bgmTrack?.mood || '未设置'}</strong>
          <p>{payload?.bgmTrack?.suggestion || '暂无 BGM 建议。'}</p>
        </div>
      </section>
      <details open>
        <summary>SFX 音效列表({sfxList.length})</summary>
        <div className={styles.performancePreviewList}>
          {sfxList.map((item, index) => (
            <div key={`${item.atSegmentId}-${item.sfxType}-${index}`}>
              <strong>{item.sfxType} · {item.atSegmentId}</strong>
              <span>{item.description}</span>
            </div>
          ))}
          {sfxList.length === 0 ? <div>无设计建议</div> : null}
        </div>
      </details>
      <details open>
        <summary>CV 演播指导({cvDirections.length})</summary>
        <div className={styles.performancePreviewList}>
          {cvDirections.map((item, index) => (
            <div key={`${item.atSegmentId}-${index}`}>
              <strong>CV · {item.atSegmentId}</strong>
              <span>{item.emotion} · {item.pace}</span>
            </div>
          ))}
          {cvDirections.length === 0 ? <div>无演播指导</div> : null}
        </div>
      </details>
    </div>
  );
}

function ReviewReportView({ payload }: { payload: ReviewReportPayload }) {
  const issues = Array.isArray(payload?.issues) ? payload.issues : [];
  const groups = groupIssues(issues);
  return (
    <div className={styles.reviewIssueList}>
      <div className={styles.reviewConclusionBadge} data-conclusion={payload?.conclusion}>
        {CONCLUSION_LABEL[payload?.conclusion] ?? '待确认'}
      </div>
      {(['P0', 'P1', 'P2'] as const).map((severity) => (
        <section key={severity} className={`${styles.reviewSeverityGroup} ${styles[`reviewSeverityGroup--${severity.toLowerCase()}`]}`}>
          <h4>{severity} · {groups[severity].length} 条</h4>
          {groups[severity].map((issue, index) => (
            <div key={`${issue.severity}-${issue.category}-${index}`}>
              <span className={`${styles.severityBadge} ${styles[`severityBadge--${issue.severity.toLowerCase()}`]}`}>
                {issue.severity}
              </span>
              <strong>{issue.category} · {issue.location ?? '全局'}</strong>
              <p>{issue.description}</p>
              {issue.suggestion ? <small>{issue.suggestion}</small> : null}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function FinalPackageView({ payload }: { payload: DeliveryPackagePayload }) {
  const manifest = Array.isArray(payload?.manifest) ? payload.manifest : [];
  const adapted = payload?.adapted_script;
  const voices = payload?.voice_markers || payload?.voice_registry;
  const review = payload?.basic_qc_report || payload?.review_report;
  return (
    <div className={styles.deliveryManifestList}>
      <div className={styles.packageVersionRow}>
        <strong>versionTag</strong>
        <code>{payload?.versionTag || '-'}</code>
      </div>
      {adapted ? (
        <details open>
          <summary>多人演播台本 · {adapted.segments?.length || 0} 段</summary>
          <AdaptedScriptView payload={adapted} />
        </details>
      ) : null}
      {voices ? (
        <details open>
          <summary>角色音表 · {voices.registry?.length || 0} 个角色</summary>
          <VoiceRegistryView payload={voices} />
        </details>
      ) : null}
      {review ? (
        <details open>
          <summary>基础质检 · {CONCLUSION_LABEL[review.conclusion] ?? review.conclusion}</summary>
          <ReviewReportView payload={review} />
        </details>
      ) : null}
      <table className={styles.artifactTable}>
        <thead>
          <tr>
            <th>文件</th>
            <th>类型</th>
            <th>大小</th>
          </tr>
        </thead>
        <tbody>
          {manifest.map((item) => (
            <tr key={item.name}>
              <td>{item.name}</td>
              <td>{item.type}</td>
              <td>{item.size}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{payload?.notes || '暂无交付说明。'}</p>
    </div>
  );
}

function groupIssues(issues: ReviewIssue[]) {
  return issues.reduce<Record<'P0' | 'P1' | 'P2', ReviewIssue[]>>(
    (acc, issue) => {
      const key = ['P0', 'P1', 'P2'].includes(issue.severity) ? issue.severity : 'P2';
      acc[key].push(issue);
      return acc;
    },
    { P0: [], P1: [], P2: [] },
  );
}

function formatMetrics(metrics?: Record<string, number>) {
  if (!metrics) return '已生成';
  return Object.entries(metrics)
    .map(([key, value]) => `${key} ${value}`)
    .join(' · ');
}

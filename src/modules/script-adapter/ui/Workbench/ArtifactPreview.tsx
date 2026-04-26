import { useState } from 'react';
import type {
  AdaptedScriptPayload,
  ArtifactEnvelope,
  DeliveryPackagePayload,
  PerformanceDesignPayload,
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

interface ArtifactPreviewProps {
  artifact: ArtifactEnvelope;
  mode?: 'compact' | 'full';
}

export function ArtifactPreview({ artifact, mode = 'compact' }: ArtifactPreviewProps) {
  const [showFull, setShowFull] = useState(mode === 'full');

  const resolvedMode: 'compact' | 'full' = showFull ? 'full' : mode;
  const modeClass = resolvedMode === 'compact' ? styles['artifactPreview--compact'] : styles['artifactPreview--full'];

  return (
    <article className={`${styles.artifactPreviewCard} ${modeClass}`}>
      <div className={styles.artifactPreviewHeader}>
        <div>
          <span>{artifact.artifactType}</span>
          <strong>{artifact.title}</strong>
        </div>
        <em>{formatMetrics(artifact.metrics)}</em>
      </div>
      <p>{artifact.summary}</p>
      <ArtifactPayload artifact={artifact} mode={resolvedMode} onExpand={() => setShowFull(true)} />
    </article>
  );
}

interface ArtifactPayloadProps {
  artifact: ArtifactEnvelope;
  mode: 'compact' | 'full';
  onExpand: () => void;
}

function ArtifactPayload({ artifact, mode, onExpand }: ArtifactPayloadProps) {
  const limit = mode === 'compact' ? 3 : Infinity;
  if (artifact.artifactType === 'adapted_script') {
    const payload = artifact.payload as AdaptedScriptPayload;
    const visible = payload.segments.slice(0, limit);
    return (
      <div className={styles.scriptSegmentList}>
        {visible.map((segment) => (
          <div key={segment.segmentId}>
            <span>{segment.speaker ?? (segment.type === 'narration' ? '旁白' : '内心')}</span>
            <p>{segment.text}</p>
          </div>
        ))}
        <ExpandPrompt mode={mode} shown={visible.length} total={payload.segments.length} onExpand={onExpand} />
      </div>
    );
  }

  if (artifact.artifactType === 'voice_registry') {
    const payload = artifact.payload as VoiceRoleMarkersPayload;
    const visible = payload.registry.slice(0, limit);
    return (
      <div className={styles.voiceRoleGrid}>
        {visible.map((role) => (
          <div key={role.roleName}>
            <strong>{role.roleName}</strong>
            <span className={`${styles.roleCategory} ${styles[`roleCategory--${role.category}`]}`}>
              {ROLE_CATEGORY_LABEL[role.category] ?? role.category}
            </span>
            <p>{role.voiceHint}</p>
          </div>
        ))}
        <ExpandPrompt mode={mode} shown={visible.length} total={payload.registry.length} onExpand={onExpand} />
      </div>
    );
  }

  if (artifact.artifactType === 'performance_design') {
    const payload = artifact.payload as PerformanceDesignPayload;
    const totalItems = 1 + payload.sfxList.length + payload.cvDirections.length;
    return (
      <div className={styles.performancePreviewList}>
        <div>
          <strong>BGM</strong>
          <span>{payload.bgmTrack?.mood ?? '未设置'}：{payload.bgmTrack?.suggestion ?? ''}</span>
        </div>
        {payload.sfxList.slice(0, mode === 'compact' ? 2 : Infinity).map((item) => (
          <div key={`${item.atSegmentId}-${item.sfxType}`}>
            <strong>{item.sfxType}</strong>
            <span>{item.description}</span>
          </div>
        ))}
        {mode === 'compact' && payload.sfxList.length > 2 ? (
          <ExpandPrompt mode={mode} shown={2 + 1} total={totalItems} onExpand={onExpand} />
        ) : null}
        {mode === 'full'
          ? payload.cvDirections.map((item) => (
              <div key={item.atSegmentId}>
                <strong>CV</strong>
                <span>{item.emotion} · {item.pace}</span>
              </div>
            ))
          : null}
      </div>
    );
  }

  if (artifact.artifactType === 'review_report') {
    const payload = artifact.payload as ReviewReportPayload;
    const visible = payload.issues.slice(0, limit);
    return (
      <div className={styles.reviewIssueList}>
        <div className={styles.reviewConclusionBadge} data-conclusion={payload.conclusion}>
          {payload.conclusion === 'pass' ? '通过' : payload.conclusion === 'reject' ? '不通过' : '带条件通过'}
        </div>
        {visible.map((issue, index) => (
          <div key={`${issue.severity}-${issue.category}-${index}`}>
            <span className={`${styles.severityBadge} ${styles[`severityBadge--${issue.severity.toLowerCase()}`]}`}>
              {issue.severity}
            </span>
            <span>{issue.category} · {issue.location ?? '全局'}</span>
            <p>{issue.description}</p>
          </div>
        ))}
        <ExpandPrompt mode={mode} shown={visible.length} total={payload.issues.length} onExpand={onExpand} />
      </div>
    );
  }

  const payload = artifact.payload as DeliveryPackagePayload;
  const visible = payload.manifest.slice(0, limit);
  return (
    <div className={styles.deliveryManifestList}>
      {visible.map((item) => (
        <div key={item.name}>
          <strong>{item.name}</strong>
          <span>{item.type} · {item.size}</span>
        </div>
      ))}
      <ExpandPrompt mode={mode} shown={visible.length} total={payload.manifest.length} onExpand={onExpand} />
    </div>
  );
}

function ExpandPrompt({ mode, shown, total, onExpand }: { mode: 'compact' | 'full'; shown: number; total: number; onExpand: () => void }) {
  if (mode !== 'compact' || shown >= total) return null;
  return (
    <button type="button" className={styles.expandPromptButton} onClick={onExpand}>
      查看完整（共 {total} 项）
    </button>
  );
}

function formatMetrics(metrics?: Record<string, number>) {
  if (!metrics) return '已生成';
  return Object.entries(metrics)
    .map(([key, value]) => `${key} ${value}`)
    .join(' · ');
}

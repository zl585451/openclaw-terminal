import type {
  AdaptedScriptPayload,
  ArtifactEnvelope,
  DeliveryPackagePayload,
  PerformanceDesignPayload,
  ReviewReportPayload,
  VoiceRoleMarkersPayload,
} from '../../types/execution';
import styles from '../../styles/scriptAdapter.module.css';

interface ArtifactPreviewProps {
  artifact: ArtifactEnvelope;
}

export function ArtifactPreview({ artifact }: ArtifactPreviewProps) {
  return (
    <article className={styles.artifactPreviewCard}>
      <div className={styles.artifactPreviewHeader}>
        <div>
          <span>{artifact.artifactType}</span>
          <strong>{artifact.title}</strong>
        </div>
        <em>{formatMetrics(artifact.metrics)}</em>
      </div>
      <p>{artifact.summary}</p>
      <ArtifactPayload artifact={artifact} />
    </article>
  );
}

function ArtifactPayload({ artifact }: ArtifactPreviewProps) {
  if (artifact.artifactType === 'AdaptedScript') {
    const payload = artifact.payload as AdaptedScriptPayload;
    return (
      <div className={styles.scriptSegmentList}>
        {payload.segments.map((segment) => (
          <div key={segment.segmentId}>
            <span>{segment.speaker ?? (segment.type === 'narration' ? '旁白' : '内心')}</span>
            <p>{segment.text}</p>
          </div>
        ))}
      </div>
    );
  }

  if (artifact.artifactType === 'VoiceRoleMarkers') {
    const payload = artifact.payload as VoiceRoleMarkersPayload;
    return (
      <div className={styles.voiceRoleGrid}>
        {payload.registry.map((role) => (
          <div key={role.roleName}>
            <strong>{role.roleName}</strong>
            <span>{role.category}</span>
            <p>{role.voiceHint}</p>
          </div>
        ))}
      </div>
    );
  }

  if (artifact.artifactType === 'PerformanceDesign') {
    const payload = artifact.payload as PerformanceDesignPayload;
    return (
      <div className={styles.performancePreviewList}>
        <div>
          <strong>BGM</strong>
          <span>{payload.bgmTrack?.mood ?? '未设置'}：{payload.bgmTrack?.suggestion ?? ''}</span>
        </div>
        {payload.sfxList.map((item) => (
          <div key={`${item.atSegmentId}-${item.sfxType}`}>
            <strong>{item.sfxType}</strong>
            <span>{item.description}</span>
          </div>
        ))}
      </div>
    );
  }

  if (artifact.artifactType === 'ReviewReport') {
    const payload = artifact.payload as ReviewReportPayload;
    return (
      <div className={styles.reviewIssueList}>
        {payload.issues.map((issue, index) => (
          <div key={`${issue.severity}-${issue.category}-${index}`}>
            <strong>{issue.severity}</strong>
            <span>{issue.category} · {issue.location ?? '全局'}</span>
            <p>{issue.description}</p>
          </div>
        ))}
      </div>
    );
  }

  const payload = artifact.payload as DeliveryPackagePayload;
  return (
    <div className={styles.deliveryManifestList}>
      {payload.manifest.map((item) => (
        <div key={item.name}>
          <strong>{item.name}</strong>
          <span>{item.type} · {item.size}</span>
        </div>
      ))}
    </div>
  );
}

function formatMetrics(metrics?: Record<string, number>) {
  if (!metrics) return '已生成';
  return Object.entries(metrics)
    .map(([key, value]) => `${key} ${value}`)
    .join(' · ');
}

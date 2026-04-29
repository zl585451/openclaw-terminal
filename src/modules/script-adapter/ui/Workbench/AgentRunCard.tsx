import { useState } from 'react';
import type { AgentRun, ArtifactEnvelope, PlannedAgent } from '../../types/execution';
import { ArtifactPreview } from './ArtifactPreview';
import styles from '../../styles/scriptAdapter.module.css';

const STATUS_COPY: Record<AgentRun['status'], string> = {
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  awaiting_review: '待复核',
};

const STATUS_ICON: Record<AgentRun['status'], string> = {
  pending: '○',
  running: '⟳',
  completed: '✓',
  failed: '✗',
  awaiting_review: '⏸',
};

function formatDuration(ms?: number): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface AgentRunCardProps {
  agent: PlannedAgent;
  run: AgentRun;
  artifact?: ArtifactEnvelope;
}

export function AgentRunCard({ agent, run, artifact }: AgentRunCardProps) {
  const [expanded, setExpanded] = useState(false);
  const statusClassName = styles[`executionAgentCard-${run.status}`] ?? '';
  const iconClassName = styles[`executionStatusIcon-${run.status}`] ?? '';

  const durationMs =
    run.completedAt && run.startedAt
      ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
      : run.startedAt && run.status === 'running'
        ? Date.now() - new Date(run.startedAt).getTime()
        : undefined;

  return (
    <article className={`${styles.executionAgentCard} ${statusClassName}`}>
      <div className={`${styles.executionAgentOrder} ${iconClassName}`}>
        {STATUS_ICON[run.status]}
      </div>
      <div className={styles.executionAgentMain}>
        <div
          className={styles.executionAgentHeader}
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded((v) => !v);
            }
          }}
        >
          <div>
            <strong>{agent.displayName}</strong>
          </div>
          <div className={styles.executionAgentStatusGroup}>
            <em>{STATUS_COPY[run.status]}</em>
            {durationMs != null ? <small>{formatDuration(durationMs)}</small> : null}
            <span className={expanded ? styles.expandArrowOpen : styles.expandArrow}>▼</span>
          </div>
        </div>

        {run.status === 'running' ? (
          <div className={styles.executionProgressTrack}>
            <span style={{ width: `${run.progressPercent ?? 0}%` }} />
          </div>
        ) : null}

        <div className={styles.executionAgentFooter}>
          <span>{run.progressSummary ?? '等待执行'}</span>
          {artifact?.title ? <b>{artifact.title}</b> : null}
        </div>

        {expanded ? (
          <div className={styles.executionAgentDetail}>
            <p className={styles.executionAgentRoleSummary}>{agent.roleSummary}</p>
            {artifact ? (
              <div className={styles.executionAgentArtifact}>
                <ArtifactPreview artifact={artifact} mode="compact" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

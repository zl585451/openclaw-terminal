import type { AgentRun, PlannedAgent } from '../../types/execution';
import styles from '../../styles/scriptAdapter.module.css';

const STATUS_COPY: Record<AgentRun['status'], string> = {
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  awaiting_review: '待复核',
};

interface AgentRunCardProps {
  agent: PlannedAgent;
  run: AgentRun;
  artifactTitle?: string;
}

export function AgentRunCard({ agent, run, artifactTitle }: AgentRunCardProps) {
  const statusClassName = styles[`executionAgentCard-${run.status}`] ?? '';

  return (
    <article className={`${styles.executionAgentCard} ${statusClassName}`}>
      <div className={styles.executionAgentOrder}>{agent.order}</div>
      <div className={styles.executionAgentMain}>
        <div className={styles.executionAgentHeader}>
          <div>
            <strong>{agent.displayName}</strong>
            <span>{agent.roleSummary}</span>
          </div>
          <em>{STATUS_COPY[run.status]}</em>
        </div>

        <div className={styles.executionProgressTrack}>
          <span style={{ width: `${run.progressPercent ?? 0}%` }} />
        </div>

        <div className={styles.executionAgentFooter}>
          <span>{run.progressSummary ?? '等待执行'}</span>
          {artifactTitle ? <b>{artifactTitle}</b> : null}
        </div>
      </div>
    </article>
  );
}

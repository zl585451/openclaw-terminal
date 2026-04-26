import { Fragment, useEffect, useState } from 'react';
import type { TaskExecutionSheet } from '../../types/execution';
import { abortPipeline } from '../../services/mockAgentExecution';
import { AgentRunCard } from './AgentRunCard';
import { ArtifactPreview } from './ArtifactPreview';
import styles from '../../styles/scriptAdapter.module.css';

const GATE_TYPE_LABEL: Record<string, string> = {
  strategy_confirmation: '修改策略',
  quality_review: '质检结果',
  target_scope_confirmation: '目标范围',
};

interface ExecutionViewProps {
  sheet: TaskExecutionSheet;
  onBackToContract: () => void;
  onRetry?: () => void;
}

export function ExecutionView({ sheet, onBackToContract, onRetry }: ExecutionViewProps) {
  const [now, setNow] = useState(() => Date.now());
  const artifacts = Object.values(sheet.artifacts);
  const completedCount = sheet.runs.filter((run) => run.status === 'completed').length;
  const currentRun = sheet.runs.find((run) => run.status === 'running');
  const currentAgent = currentRun
    ? sheet.plan.agents.find((agent) => agent.agentId === currentRun.agentId)
    : null;
  const elapsedMs = sheet.overallStatus === 'running'
    ? now - new Date(sheet.createdAt).getTime()
    : new Date(sheet.updatedAt).getTime() - new Date(sheet.createdAt).getTime();
  const elapsedLabel = formatElapsed(elapsedMs);
  const statusLabel = sheet.overallStatus === 'completed'
    ? 'COMPLETE'
    : sheet.overallStatus === 'failed'
      ? 'FAILED'
      : 'RUNNING';

  useEffect(() => {
    if (sheet.overallStatus !== 'running') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sheet.overallStatus]);

  return (
    <main className={styles.taskMain}>
      <section className={`${styles.card} ${styles.executionHeroCard}`}>
        <div>
          <div className={styles.workOrderKicker}>制作执行中</div>
          <h2>
            {sheet.overallStatus === 'completed'
              ? '本轮多人演播样章制作已完成。'
              : currentAgent
                ? `${currentAgent.displayName}正在处理样章。`
                : '正在准备制作队列。'}
          </h2>
          <p>
            已完成 {completedCount}/{sheet.plan.agents.length} 个制作角色。系统会按顺序生成台本、角色音、演播设计、质检报告和交付包。
          </p>
        </div>
        <div className={styles.executionHeroActions}>
          <strong>{statusLabel}</strong>
          <small className={styles.executionElapsed}>{elapsedLabel}</small>
          <button type="button" className={styles.ghostButton} onClick={onBackToContract}>
            返回开工确认书
          </button>
          {sheet.overallStatus === 'running' ? (
            <button type="button" className={styles.ghostButton} onClick={abortPipeline}>
              取消执行
            </button>
          ) : sheet.overallStatus === 'failed' ? (
            <button type="button" className={styles.confirmStartButton} onClick={onRetry}>
              重试
            </button>
          ) : null}
        </div>
      </section>

      <section className={`${styles.card} ${styles.executionQueueCard}`}>
        <div className={styles.productionTeamHeader}>
          <div>
            <div className={styles.sectionTitle}>Agent 制作进度</div>
            <p>这里展示的是用户可理解的制作角色，技术输入输出仍保留在下方细节里。</p>
          </div>
          <span className={styles.executionCompletionPill}>{completedCount}/{sheet.plan.agents.length}</span>
        </div>

        <div className={styles.executionAgentList}>
          {sheet.plan.agents.map((agent) => {
            const run = sheet.runs.find((item) => item.agentId === agent.agentId);
            const artifact = run?.outputArtifactIds[0] ? sheet.artifacts[run.outputArtifactIds[0]] : undefined;
            const gate = sheet.gates.find((item) => item.afterAgentId === agent.agentId);
            return (
              <Fragment key={agent.agentId}>
                {run ? (
                  <AgentRunCard
                    agent={agent}
                    run={run}
                    artifact={artifact}
                  />
                ) : null}
                {gate ? (
                  <div
                    className={`${styles.gateBanner} ${
                      gate.status === 'approved'
                        ? styles['gateBanner--approved']
                        : gate.status === 'rejected'
                          ? styles['gateBanner--rejected']
                          : styles['gateBanner--pending']
                    }`}
                  >
                    <span>{gate.status === 'approved' ? '✓' : gate.status === 'rejected' ? '✗' : '⏸'}</span>
                    <strong>
                      {GATE_TYPE_LABEL[gate.gateType] ?? gate.gateType}
                      {gate.status === 'approved' ? ' 已通过' : gate.status === 'rejected' ? ' 未通过' : ' 确认'}
                    </strong>
                    <em>{gate.status === 'pending' ? '自动通过中...' : gate.description}</em>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </section>

      <section className={styles.executionResultGrid}>
        <div className={`${styles.card} ${styles.artifactDeckCard}`}>
          <div className={styles.sectionTitle}>本轮产物预览</div>
          {artifacts.length > 0 ? (
            <div className={styles.artifactDeck}>
              {artifacts.map((artifact) => (
                <ArtifactPreview key={artifact.artifactId} artifact={artifact} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyArtifactState}>产物生成后会在这里出现。</div>
          )}
        </div>

        <div className={`${styles.card} ${styles.executionGateCard}`}>
          <div className={styles.sectionTitle}>确认闸门</div>
          <div className={styles.gateList}>
            {sheet.gates.map((gate) => (
              <div key={gate.gateId}>
                <strong>{gate.gateType}</strong>
                <span>{gate.status === 'approved' ? '已通过' : '等待触发'}</span>
                <p>{gate.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

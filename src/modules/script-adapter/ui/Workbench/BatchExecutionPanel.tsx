import type { BatchActivityEntry, BatchJob, ChapterRunRecord } from '../../types/batch';
import { BatchProgressView } from './BatchProgressView';
import { exportBatchDeliveryAsDocx, exportBatchDeliveryAsMarkdown } from '../../services/exportClient';
import { deleteGatewayBatch, rerunGatewayBatchChapter, cancelGatewayBatch } from '../../services/gatewayBatch';
import { scriptAdapterActions } from '../../store/actions';
import styles from '../../styles/scriptAdapter.module.css';

const TEAM_ROLE_COPY: Record<string, { title: string; shortDesc: string; promise: string }> = {
  'stage-text-adaptation': {
    title: '文本改编师',
    shortDesc: '把原文改成更适合多人演播的口语化样章。',
    promise: '保留剧情，只让旁白和对白更好听。',
  },
  'stage-voice-classification': {
    title: '角色音统筹',
    shortDesc: '标出谁在说话、哪些声音暂时未定、哪些需要后续分配 CV。',
    promise: '不把文件记录、OS、未定声音硬塞给旁白。',
  },
  'stage-performance-design': {
    title: '演播设计师',
    shortDesc: '补充 BGM、音效、CV 情绪、气息和动作提示。',
    promise: '让剧组拿到后能直接理解怎么演。',
  },
  'stage-quality-review': {
    title: '质检审校',
    shortDesc: '检查有没有改剧情、角色音是否混乱、演播提示是否可执行。',
    promise: '发现风险会停下来提醒你确认。',
  },
  'stage-export': {
    title: '交付打包员',
    shortDesc: '整理成剧组能看的台本、角色音表和制作说明。',
    promise: '把零散产物打包成清楚的交付件。',
  },
};

interface BatchExecutionPanelProps {
  batch: BatchJob;
  chapterRuns: ChapterRunRecord[];
  batchHistory: BatchJob[];
  currentBatchId: string | null;
  activity: BatchActivityEntry[];
  lastEventAt: string | null;
  onBatchSelect: (id: string) => void;
  onRefresh: () => void;
  onBatchRefreshHistory: () => void;
}

export function BatchExecutionPanel({
  batch,
  chapterRuns,
  batchHistory,
  currentBatchId,
  activity,
  lastEventAt,
  onBatchSelect,
  onRefresh,
  onBatchRefreshHistory,
}: BatchExecutionPanelProps) {
  const completed = batch.status === 'completed' && batch.failedChapters === 0;
  const running = batch.status === 'running';
  const teamKeys = Object.keys(TEAM_ROLE_COPY);

  const handleExportMarkdown = async () => {
    await exportBatchDeliveryAsMarkdown(batch, chapterRuns);
  };

  const handleExportDocx = async () => {
    await exportBatchDeliveryAsDocx(batch, chapterRuns);
  };

  return (
    <>
      {running ? (
        <section className={`${styles.card} ${styles.lifecycleStatusCard}`}>
          <div>
            <div className={styles.workOrderKicker}>开工中</div>
            <h2>正在试产，批次运行中。</h2>
            <p>详细进度见下方批次进度卡。</p>
          </div>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => scriptAdapterActions.setViewMode('pipeline')}
          >
            查看制作阶段
          </button>
        </section>
      ) : null}

      <BatchProgressView
        batch={batch}
        chapterRuns={chapterRuns}
        activity={activity}
        lastEventAt={lastEventAt}
        onRefresh={onRefresh}
        onRerun={(chapterIndex) => {
          void rerunGatewayBatchChapter(batch.id, chapterIndex).then(onRefresh);
        }}
        onExport={() => void handleExportMarkdown()}
        onExportDocx={() => void handleExportDocx()}
        onCancel={() => {
          void cancelGatewayBatch(batch.id).then(() => {
            onBatchRefreshHistory();
            onRefresh();
          });
        }}
      />

      {completed ? (
        <details className={`${styles.card} ${styles.collapsibleWorkbenchSection}`}>
          <summary>查看批次历史</summary>
          <section className={styles.batchHistoryCard}>
            <div className={styles.productionTeamHeader}>
              <div>
                <div className={styles.sectionTitle}>批次历史</div>
                <p>重启后状态由 Gateway 持久化恢复。</p>
              </div>
              <button type="button" className={styles.ghostButton} onClick={onBatchRefreshHistory}>
                刷新历史
              </button>
            </div>
            <div className={styles.batchHistoryList}>
              {batchHistory.length === 0 ? (
                <div className={styles.batchHistoryEmpty}>还没有批次记录。</div>
              ) : batchHistory.map((item) => (
                <div key={item.id} className={item.id === currentBatchId ? styles.batchHistoryItemActive : styles.batchHistoryItem}>
                  <button type="button" className={styles.batchHistoryMain} onClick={() => onBatchSelect(item.id)}>
                    <strong>{item.bookTitle}</strong>
                    <span>{item.completedChapters}/{item.totalChapters} · {item.status}</span>
                    <em>{new Date(item.createdAt).toLocaleString('zh-CN')}</em>
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    disabled={item.status === 'running'}
                    onClick={() => void deleteGatewayBatch(item.id).then(onBatchRefreshHistory)}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </section>
        </details>
      ) : null}

      <details className={`${styles.card} ${styles.collapsibleWorkbenchSection}`}>
        <summary>查看制作角色和保护条款</summary>
        <section className={styles.productionTeamCard}>
          <div className={styles.productionTeamHeader}>
            <div>
              <div className={styles.sectionTitle}>谁在为你干活</div>
              <p>这几位“制作角色”会按顺序帮你完成样章。</p>
            </div>
          </div>
          <div className={styles.productionTeamGrid}>
            {teamKeys.map((key, idx) => {
              const role = TEAM_ROLE_COPY[key];
              return (
                <div key={key} className={styles.productionTeamMember}>
                  <div className={styles.productionMemberTop}>
                    <span>{idx + 1}</span>
                  </div>
                  <strong>{role.title}</strong>
                  <p>{role.shortDesc}</p>
                  <small>{role.promise}</small>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.contractDeliveryGrid}>
          <div className={`${styles.card} ${styles.contractGuardCard}`}>
            <div className={styles.sectionTitle}>保护条款</div>
            <div className={styles.contractGuardList}>
              <div><strong>不会改核心剧情</strong><span>只优化表达和演播可执行性，不改变人物关系和关键事件。</span></div>
              <div><strong>不会提前解释悬疑</strong><span>旧物、对讲机和关键线索仍按原来的信息顺序出现。</span></div>
              <div><strong>不会乱归角色音</strong><span>未定来源声音会保留为候选，交给你或统筹后续确认。</span></div>
            </div>
          </div>
        </section>
      </details>
    </>
  );
}

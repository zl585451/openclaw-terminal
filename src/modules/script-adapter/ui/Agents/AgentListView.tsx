import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import styles from '../../styles/scriptAdapter.module.css';

export function AgentListView() {
  const agents = useScriptAdapterStore((state) => state.agents);

  if (agents.length === 0) {
    return <div className={`${styles.card} ${styles.placeholderCard}`}>等待 Agent 数据加载。</div>;
  }

  return (
    <section className={styles.agentsTable}>
      {agents.map((agent) => (
        <div key={`${agent.id}@${agent.version}`} className={`${styles.card} ${styles.agentRow}`}>
          <div className={styles.agentMain}>
            <div className={styles.agentId}>
              {agent.id}@{agent.version}
            </div>
            <div className={styles.agentRole}>{agent.role}</div>
          </div>

          <div className={styles.agentMetaGroup}>
            <span className={styles.agentMetaTag}>阶段 {agent.stageIdx}</span>
            <span className={styles.agentMetaTag}>{agent.preferredModel}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

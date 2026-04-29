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
            <div className={styles.agentRoleTitle}>{agent.role}</div>
            <div className={styles.agentId}>{agent.id}@{agent.version}</div>
            {agent.description ? <div className={styles.agentRole}>{agent.description}</div> : null}
          </div>

          <div className={styles.agentMetaGroup}>
            <span className={styles.agentMetaTag}>阶段 {agent.stageIdx}</span>
            <span className={styles.agentMetaTag}>{agent.preferredModel}</span>
            <span className={styles.agentMetaTag}>{agent.canModifySource ? '可改正文' : '不改正文'}</span>
            {agent.requiresHumanReview ? <span className={styles.agentMetaTag}>需人工确认</span> : null}
          </div>

          <div className={styles.agentContract}>
            <span>输入：{agent.inputArtifactTypes.join(', ') || '无'}</span>
            <span>输出：{agent.outputArtifactTypes.join(', ') || '无'}</span>
            {agent.ruleDocPath ? <span>规则：{agent.ruleDocPath}</span> : null}
          </div>
        </div>
      ))}
    </section>
  );
}

import { useScriptAdapterStore, type ViewMode } from '../store/scriptAdapterStore';
import { scriptAdapterActions } from '../store/actions';
import { WorkbenchView } from './Workbench/WorkbenchView';
import { PipelineView } from './Pipeline/PipelineView';
import { AgentListView } from './Agents/AgentListView';
import styles from '../styles/scriptAdapter.module.css';

const VIEW_LABEL: Record<ViewMode, string> = {
  workbench: '工作台',
  pipeline: '流程总览',
  agents: 'Agent 清单',
};

export function ScriptAdapterLayout() {
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const viewMode = useScriptAdapterStore((state) => state.viewMode);

  return (
    <div className={styles.layout}>
      <div className={styles.layoutHeader}>
        <div className={styles.tabList} role="tablist" aria-label="Script Adapter Views">
          {(Object.keys(VIEW_LABEL) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              className={`${styles.tabButton} ${viewMode === mode ? styles.tabButtonActive : ''}`}
              onClick={() => scriptAdapterActions.setViewMode(mode)}
            >
              {VIEW_LABEL[mode]}
            </button>
          ))}
        </div>

        <div className={styles.projectMeta}>
          <div className={styles.projectName}>{project?.name ?? '未加载项目'}</div>
          <div className={styles.projectSub}>
            {project ? `模板：${project.templateId} · v${project.templateVersion}` : '等待项目数据'}
          </div>
        </div>
      </div>

      <div className={styles.viewFrame}>
        {viewMode === 'workbench' && <WorkbenchView />}
        {viewMode === 'pipeline' && <PipelineView />}
        {viewMode === 'agents' && <AgentListView />}
      </div>
    </div>
  );
}

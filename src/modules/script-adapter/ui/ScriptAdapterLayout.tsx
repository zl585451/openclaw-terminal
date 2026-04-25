import { useScriptAdapterStore, type ViewMode } from '../store/scriptAdapterStore';
import { scriptAdapterActions } from '../store/actions';
import { WorkbenchView } from './Workbench/WorkbenchView';
import { PipelineView } from './Pipeline/PipelineView';
import { AgentListView } from './Agents/AgentListView';
import styles from '../styles/scriptAdapter.module.css';

const VIEW_LABEL: Record<ViewMode, string> = {
  workbench: '工作台',
  pipeline: '团队流程',
  agents: 'Agent 池',
};

interface ScriptAdapterLayoutProps {
  onBack?: () => void;
}

export function ScriptAdapterLayout({ onBack }: ScriptAdapterLayoutProps) {
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const viewMode = useScriptAdapterStore((state) => state.viewMode);
  const template = useScriptAdapterStore((state) =>
    project ? state.templates[project.templateId] : null,
  );

  return (
    <div className={styles.layout}>
      <div className={styles.layoutHeader}>
        <div className={styles.layoutControls}>
          {onBack ? (
            <button type="button" className={styles.backButton} onClick={onBack}>
              ← 返回 Chat
            </button>
          ) : null}

          <div className={styles.tabList} role="tablist" aria-label="Content Workbench Views">
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
        </div>

        <div className={styles.projectMeta}>
          <div className={styles.projectName}>内容制作工作台</div>
          <div className={styles.projectSub}>
            {project && template
              ? `${project.name} · ${template.name} · v${project.templateVersion}`
              : '等待项目数据'}
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

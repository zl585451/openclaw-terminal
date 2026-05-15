import { ExecutionView } from './ExecutionView';
import { TaskWorkbenchRail } from './TaskWorkbenchRail';
import { scriptAdapterActions } from '../../store/actions';
import type { TaskExecutionSheet } from '../../types/execution';
import styles from '../../styles/scriptAdapter.module.css';

interface ExecutionWorkbenchPanelProps {
  projectName: string;
  chapterLabel: string;
  sheet: TaskExecutionSheet;
  currentProjectId: string | null;
  onRetry: () => void;
  onCancel?: () => void;
}

export function ExecutionWorkbenchPanel({
  projectName,
  chapterLabel,
  sheet,
  currentProjectId,
  onRetry,
  onCancel,
}: ExecutionWorkbenchPanelProps) {
  return (
    <div className={styles.taskWorkbench}>
      <TaskWorkbenchRail
        sidebarLabel="正在制作"
        projectName={projectName}
        chapterLabel={chapterLabel}
        metaLabel={sheet.overallStatus === 'completed' ? '已完成' : '执行中'}
        executionSummary={`${sheet.runs.filter((run) => run.status === 'completed').length}/${sheet.runs.length} 已完成`}
      />

      <ExecutionView
        sheet={sheet}
        onBackToContract={() => {
          if (currentProjectId) scriptAdapterActions.clearExecutionSheet(currentProjectId);
        }}
        onRetry={onRetry}
        onCancel={onCancel}
      />
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { useScriptAdapterStore } from '../../store/scriptAdapterStore';
import { scriptAdapterActions } from '../../store/actions';
import {
  abortPipeline,
  createExecutionPlan,
  runFullPipeline,
} from '../../services/mockAgentExecution';
import {
  startGatewayExecution,
  subscribeGatewayExecutionEvents,
} from '../../services/gatewayExecution';
import type { DeliveryOptions, TaskCreationContract } from '../../types/batch';
import { BatchSetupPanel } from './BatchSetupPanel';
import { BatchExecutionPanel } from './BatchExecutionPanel';
import { ExecutionWorkbenchPanel } from './ExecutionWorkbenchPanel';
import { TaskWorkbenchRail } from './TaskWorkbenchRail';
import { useWorkbenchBatchState } from './useWorkbenchBatchState';
import styles from '../../styles/scriptAdapter.module.css';

const DEFAULT_DELIVERY_OPTIONS: DeliveryOptions = {
  adaptedScript: true,
  voiceRegistry: true,
  qualityReview: true,
  cvDirections: false,
  bgmSfx: false,
  finalPackage: true,
};

interface WorkbenchViewProps {
  taskContract?: TaskCreationContract | null;
}

export function WorkbenchView({ taskContract }: WorkbenchViewProps) {
  const currentProjectId = useScriptAdapterStore((state) => state.currentProjectId);
  const project = useScriptAdapterStore((state) =>
    currentProjectId ? state.projects[currentProjectId] : null,
  );
  const chapters = useScriptAdapterStore((state) =>
    currentProjectId ? state.chapters[currentProjectId] ?? [] : [],
  );
  const executionSheet = useScriptAdapterStore((state) =>
    currentProjectId ? state.executionSheets[currentProjectId] ?? null : null,
  );

  const executionSheetRef = useRef(executionSheet);
  executionSheetRef.current = executionSheet;
  const shouldAutoResumeExistingBatch = !taskContract;
  const {
    batchHistory,
    currentBatchId,
    setCurrentBatchId,
    currentBatch,
    currentBatchRuns,
    currentBatchIdRef,
    refreshBatchHistory,
    loadBatchStatus,
  } = useWorkbenchBatchState({ autoResumeActiveBatch: shouldAutoResumeExistingBatch });

  const currentChapter = chapters.find((chapter) => chapter.id === project?.meta.currentChapterId) ?? chapters[0];
  const retryDeliveryOptions = taskContract?.deliveryOptions ?? DEFAULT_DELIVERY_OPTIONS;

  const startMockExecution = () => {
    const taskId = project?.id ?? 'demo-content-task';
    const taskTitle = `${project?.name ?? '长夜未瞑'} · 多人演播样章`;
    const sheet = createExecutionPlan(taskId, taskTitle);
    scriptAdapterActions.setExecutionSheet(taskId, sheet);

    void runFullPipeline(sheet, {
      onSheetCreated: (createdSheet) => scriptAdapterActions.setExecutionSheet(taskId, createdSheet),
      onAgentStart: (_agentId, run) => {
        scriptAdapterActions.updateExecutionRun(taskId, run);
      },
      onAgentProgress: (agentId, stage, percent) => {
        scriptAdapterActions.updateExecutionProgress(taskId, agentId, stage, percent);
      },
      onAgentComplete: (_agentId, artifact, run) => {
        scriptAdapterActions.updateExecutionRun(taskId, run);
        scriptAdapterActions.addExecutionArtifact(taskId, artifact);
      },
      onGateReached: (gate) => {
        scriptAdapterActions.updateExecutionGate(taskId, gate.gateId, { status: 'pending' });
      },
      onAllComplete: (completedSheet) => scriptAdapterActions.setExecutionSheet(taskId, completedSheet),
      onAgentFailed: (agentId, error) => {
        scriptAdapterActions.failExecutionRun(taskId, agentId, error);
      },
    });
  };

  const startExecution = async () => {
    const taskId = project?.id ?? 'demo-content-task';
    const taskTitle = `${project?.name ?? '长夜未瞑'} · 多人演播样章`;
    scriptAdapterActions.setExecutionSheet(taskId, createExecutionPlan(taskId, taskTitle));

    const result = await startGatewayExecution({
      taskId,
      taskTitle,
      source: 'content-workbench',
      sourceText: '',
      config: {
        realAgents: 'all',
        includePerformanceDesign: retryDeliveryOptions.cvDirections || retryDeliveryOptions.bgmSfx,
        deliveryOptions: retryDeliveryOptions,
      },
    });

    if (!result?.success) {
      console.warn('[ScriptAdapter] Gateway execution unavailable, fallback to frontend mock:', result?.error);
      startMockExecution();
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeGatewayExecutionEvents((event) => {
      if (currentProjectId && event.taskId !== currentProjectId) return;

      if (event.event === 'sheet_created' || event.event === 'all_completed') {
        scriptAdapterActions.setExecutionSheet(event.taskId, event.sheet);
        return;
      }

      if (event.event === 'agent_started') {
        scriptAdapterActions.updateExecutionRun(event.taskId, event.run);
        return;
      }

      if (event.event === 'agent_progress') {
        scriptAdapterActions.updateExecutionProgress(
          event.taskId,
          event.agentId,
          event.progressSummary,
          event.progressPercent,
        );
        return;
      }

      if (event.event === 'artifact_created') {
        scriptAdapterActions.updateExecutionRun(event.taskId, event.run);
        scriptAdapterActions.addExecutionArtifact(event.taskId, event.artifact);
        return;
      }

      if (event.event === 'gate_reached' || event.event === 'gate_updated') {
        scriptAdapterActions.updateExecutionGate(event.taskId, event.gate.gateId, event.gate);
        return;
      }

      if (event.event === 'run_failed') {
        const firstRunning = executionSheetRef.current?.runs.find((run) => run.status === 'running');
        if (firstRunning) {
          scriptAdapterActions.failExecutionRun(event.taskId, firstRunning.agentId, event.error);
        }
      }
    });

    return () => {
      unsubscribe();
      abortPipeline();
    };
  }, [currentProjectId]);

  if (executionSheet) {
    return (
      <ExecutionWorkbenchPanel
        projectName={project?.name ?? '未命名项目'}
        chapterLabel={currentChapter ? `第${currentChapter.index}章：${currentChapter.title}` : '未选择章节'}
        sheet={executionSheet}
        currentProjectId={currentProjectId}
        onRetry={() => {
          if (currentProjectId) {
            scriptAdapterActions.clearExecutionSheet(currentProjectId);
          }
          window.setTimeout(() => {
            void startExecution();
          }, 0);
        }}
      />
    );
  }

  return (
    <div className={styles.taskWorkbench}>
      <TaskWorkbenchRail
        sidebarLabel="已锁定任务"
        projectName={project?.name ?? '未命名项目'}
        chapterLabel={currentChapter ? `第${currentChapter.index}章：${currentChapter.title}` : '未选择章节'}
        metaLabel="开工前确认"
        onBack={() => scriptAdapterActions.setViewMode('pipeline')}
      />

      <main className={styles.taskMain}>
        {!currentBatch ? (
          <BatchSetupPanel
            taskContract={taskContract}
            onBatchStarted={async (batchId) => {
              setCurrentBatchId(batchId);
              await refreshBatchHistory(batchId);
              await loadBatchStatus(batchId);
            }}
          />
        ) : null}

        {currentBatch ? (
          <BatchExecutionPanel
            batch={currentBatch}
            chapterRuns={currentBatchRuns}
            batchHistory={batchHistory}
            currentBatchId={currentBatchId}
            onBatchSelect={setCurrentBatchId}
            onRefresh={() => void loadBatchStatus(currentBatch.id)}
            onBatchRefreshHistory={() => void refreshBatchHistory(currentBatchIdRef.current)}
          />
        ) : null}
      </main>
    </div>
  );
}

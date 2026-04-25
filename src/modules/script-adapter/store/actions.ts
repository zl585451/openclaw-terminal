import { useScriptAdapterStore } from './scriptAdapterStore';
import type { Project, Chapter } from '../types/project';
import type { Stage } from '../types/stage';
import type { Artifact } from '../types/artifact';
import type { AgentDef } from '../types/agent';
import type { TeamTemplate } from '../types/template';
import type { AgentRun, ArtifactEnvelope, ReviewGate, TaskExecutionSheet } from '../types/execution';
import type { ViewMode } from './scriptAdapterStore';

export const scriptAdapterActions = {
  loadProject(
    project: Project,
    chapters: Chapter[],
    stages: Stage[],
    artifacts: Artifact[],
    templates: TeamTemplate[] = [],
  ) {
    useScriptAdapterStore.getState()._set((state) => ({
      currentProjectId: project.id,
      projects: { ...state.projects, [project.id]: project },
      chapters: { ...state.chapters, [project.id]: chapters },
      stages: { ...state.stages, [project.id]: stages },
      artifacts: { ...state.artifacts, [project.id]: artifacts },
      templates: {
        ...state.templates,
        ...Object.fromEntries(templates.map((template) => [template.id, template])),
      },
    }));
    console.log('[ScriptAdapter] loaded project', project.id);
  },

  setAgents(agents: AgentDef[]) {
    useScriptAdapterStore.getState()._set(() => ({ agents }));
  },

  setViewMode(mode: ViewMode) {
    useScriptAdapterStore.getState()._set(() => ({ viewMode: mode }));
    console.log('[ScriptAdapter] view mode changed to', mode);
  },

  selectStage(idx: number) {
    useScriptAdapterStore.getState()._set(() => ({ selectedStageIdx: idx }));
    console.log('[ScriptAdapter] selected stage', idx);
  },

  openStageInWorkbench(idx: number) {
    useScriptAdapterStore.getState()._set(() => ({ viewMode: 'workbench', selectedStageIdx: idx }));
    console.log('[ScriptAdapter] opened stage in workbench', idx);
  },

  setExecutionSheet(projectId: string, sheet: TaskExecutionSheet) {
    useScriptAdapterStore.getState()._set((state) => ({
      executionSheets: {
        ...state.executionSheets,
        [projectId]: sheet,
      },
    }));
  },

  clearExecutionSheet(projectId: string) {
    useScriptAdapterStore.getState()._set((state) => {
      const nextSheets = { ...state.executionSheets };
      delete nextSheets[projectId];
      return { executionSheets: nextSheets };
    });
  },

  updateExecutionRun(projectId: string, nextRun: AgentRun) {
    useScriptAdapterStore.getState()._set((state) => {
      const sheet = state.executionSheets[projectId];
      if (!sheet) return {};
      return {
        executionSheets: {
          ...state.executionSheets,
          [projectId]: {
            ...sheet,
            runs: sheet.runs.map((run) => (run.runId === nextRun.runId ? nextRun : run)),
            overallStatus: sheet.overallStatus === 'pending' ? 'running' : sheet.overallStatus,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  updateExecutionProgress(projectId: string, agentId: string, progressSummary: string, progressPercent: number) {
    useScriptAdapterStore.getState()._set((state) => {
      const sheet = state.executionSheets[projectId];
      if (!sheet) return {};
      return {
        executionSheets: {
          ...state.executionSheets,
          [projectId]: {
            ...sheet,
            runs: sheet.runs.map((run) =>
              run.agentId === agentId
                ? {
                    ...run,
                    status: 'running',
                    progressSummary,
                    progressPercent,
                  }
                : run,
            ),
            overallStatus: 'running',
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  failExecutionRun(projectId: string, agentId: string, error: string) {
    useScriptAdapterStore.getState()._set((state) => {
      const sheet = state.executionSheets[projectId];
      if (!sheet) return {};
      return {
        executionSheets: {
          ...state.executionSheets,
          [projectId]: {
            ...sheet,
            runs: sheet.runs.map((run) =>
              run.agentId === agentId
                ? {
                    ...run,
                    status: 'failed',
                    error,
                    progressSummary: error,
                  }
                : run,
            ),
            overallStatus: 'failed',
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  addExecutionArtifact(projectId: string, artifact: ArtifactEnvelope) {
    useScriptAdapterStore.getState()._set((state) => {
      const sheet = state.executionSheets[projectId];
      if (!sheet) return {};
      return {
        executionSheets: {
          ...state.executionSheets,
          [projectId]: {
            ...sheet,
            artifacts: {
              ...sheet.artifacts,
              [artifact.artifactId]: artifact,
            },
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  updateExecutionGate(projectId: string, gateId: string, updates: Partial<ReviewGate>) {
    useScriptAdapterStore.getState()._set((state) => {
      const sheet = state.executionSheets[projectId];
      if (!sheet) return {};
      return {
        executionSheets: {
          ...state.executionSheets,
          [projectId]: {
            ...sheet,
            gates: sheet.gates.map((gate) =>
              gate.gateId === gateId
                ? {
                    ...gate,
                    ...updates,
                  }
                : gate,
            ),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  rejectArtifact(artifactId: string, reason: string) {
    console.log('[ScriptAdapter] TODO: reject artifact', artifactId, 'reason:', reason);
  },

  openArtifact(artifactId: string) {
    console.log('[ScriptAdapter] TODO: open artifact', artifactId);
  },

  viewArtifactHistory(artifactId: string) {
    console.log('[ScriptAdapter] TODO: view artifact history', artifactId);
  },

  rerunScene(projectId: string, sceneId: string) {
    console.log('[ScriptAdapter] TODO: rerun scene', projectId, sceneId);
  },

  pauseStage(projectId: string, stageIdx: number) {
    console.log('[ScriptAdapter] TODO: pause stage', projectId, stageIdx);
  },
};

if (typeof window !== 'undefined') {
  (window as Window & { __scriptAdapter?: typeof scriptAdapterActions }).__scriptAdapter = scriptAdapterActions;
}

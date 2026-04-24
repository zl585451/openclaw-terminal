import { useScriptAdapterStore } from './scriptAdapterStore';
import type { Project, Chapter } from '../types/project';
import type { Stage } from '../types/stage';
import type { Artifact } from '../types/artifact';
import type { AgentDef } from '../types/agent';
import type { ViewMode } from './scriptAdapterStore';

export const scriptAdapterActions = {
  loadProject(project: Project, chapters: Chapter[], stages: Stage[], artifacts: Artifact[]) {
    useScriptAdapterStore.getState()._set((state) => ({
      currentProjectId: project.id,
      projects: { ...state.projects, [project.id]: project },
      chapters: { ...state.chapters, [project.id]: chapters },
      stages: { ...state.stages, [project.id]: stages },
      artifacts: { ...state.artifacts, [project.id]: artifacts },
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

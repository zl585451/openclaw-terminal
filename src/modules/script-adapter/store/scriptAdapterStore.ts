import { create } from 'zustand';
import type { Project, Chapter } from '../types/project';
import type { Stage } from '../types/stage';
import type { Artifact } from '../types/artifact';
import type { AgentDef } from '../types/agent';

export type ViewMode = 'workbench' | 'pipeline' | 'agents';

interface ScriptAdapterState {
  currentProjectId: string | null;
  projects: Record<string, Project>;
  chapters: Record<string, Chapter[]>;
  stages: Record<string, Stage[]>;
  artifacts: Record<string, Artifact[]>;
  agents: AgentDef[];

  viewMode: ViewMode;
  selectedStageIdx: number;

  _set: (updater: (state: ScriptAdapterState) => Partial<ScriptAdapterState>) => void;
}

export const useScriptAdapterStore = create<ScriptAdapterState>((set) => ({
  currentProjectId: null,
  projects: {},
  chapters: {},
  stages: {},
  artifacts: {},
  agents: [],

  viewMode: 'workbench',
  selectedStageIdx: 0,

  _set: (updater) => set((state) => ({ ...state, ...updater(state) })),
}));

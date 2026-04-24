export type SourceType = 'novel' | 'screenplay' | 'other';
export type TargetType = 'audiobook' | 'radiodrama';
export type ProjectStatus = 'draft' | 'running' | 'paused' | 'done' | 'archived';

export interface Project {
  id: string;
  name: string;
  sourceType: SourceType;
  targetType: TargetType;
  templateId: string;
  templateVersion: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  meta: {
    totalChars: number;
    totalChapters: number;
    genre?: string;
  };
}

export interface Chapter {
  id: string;
  projectId: string;
  index: number;
  title: string;
  timeLabel?: string;
  charCount: number;
}

export interface WorkflowRun {
  id: string;
  projectId: string;
  templateId: string;
  templateVersion: string;
  currentStageIdx: number;
  status: 'pending' | 'running' | 'paused' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
}

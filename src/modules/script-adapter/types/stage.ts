export type StageStatus = 'pending' | 'running' | 'review' | 'done' | 'failed';

export interface Stage {
  idx: number;
  id: string;
  name: string;
  description: string;
  agentRef: string;
  status: StageStatus;
  inputArtifactTypes: string[];
  outputArtifactTypes: string[];
  ruleDocPath?: string;
  requiresHumanReview?: boolean;
  tokensUsed: number;
  runtimeSeconds: number;
  artifactCount: number;
  startedAt?: string;
  finishedAt?: string;
}

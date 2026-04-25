export interface AgentDef {
  id: string;
  version: string;
  role: string;
  stageIdx: number;
  preferredModel: string;
  inputArtifactTypes: string[];
  outputArtifactTypes: string[];
  ruleDocPath?: string;
  canModifySource: boolean;
  requiresHumanReview: boolean;
  description?: string;
}

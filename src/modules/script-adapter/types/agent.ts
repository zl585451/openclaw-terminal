export interface AgentDef {
  id: string;
  version: string;
  role: string;
  stageIdx: number;
  preferredModel: string;
  description?: string;
}

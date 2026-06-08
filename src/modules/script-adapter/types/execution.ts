export interface AgentExecutionPlan {
  planId: string;
  taskId: string;
  agents: PlannedAgent[];
  reviewGates: ReviewGate[];
  createdAt: string;
}

export interface PlannedAgent {
  agentId: string;
  displayName: string;
  order: number;
  inputArtifactTypes: string[];
  outputArtifactTypes: string[];
  parallelizable: boolean;
  roleSummary: string;
}

export type ExecutionStageStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'awaiting_review';

export interface AgentRun {
  runId: string;
  planId: string;
  agentId: string;
  status: ExecutionStageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  progressSummary?: string;
  progressPercent?: number;
  outputArtifactIds: string[];
  error?: string;
}

// 复用现有 types/artifact.ts 的 ArtifactType（snake_case），避免两套 ArtifactType 同名歧义。
// Week 5 真实 Agent 接入时,store 的 stage / artifact 与 execution 链路共用同一个枚举。
import type { ArtifactType } from './artifact';

export type { ArtifactType };

export interface ArtifactEnvelope<T = unknown> {
  artifactId: string;
  artifactType: ArtifactType;
  producedBy: string;
  producedAt: string;
  title: string;
  summary: string;
  payload: T;
  metrics?: Record<string, number>;
}

export interface ReviewGate {
  gateId: string;
  afterAgentId: string;
  gateType: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  relatedArtifactId?: string;
}

export interface TaskExecutionSheet {
  taskId: string;
  taskTitle: string;
  plan: AgentExecutionPlan;
  runs: AgentRun[];
  artifacts: Record<string, ArtifactEnvelope>;
  gates: ReviewGate[];
  overallStatus: ExecutionStageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdaptedScriptPayload {
  chapterTitle: string;
  totalCharCount: number;
  segments: AdaptedSegment[];
}

export interface AdaptedSegment {
  segmentId: string;
  type: 'narration' | 'dialogue' | 'inner_monologue' | 'document_reading';
  speaker?: string;
  text: string;
  rewriteNote?: string;
}

export interface VoiceRoleMarkersPayload {
  registry: VoiceRoleEntry[];
  unresolved: string[];
}

export interface VoiceRoleEntry {
  roleName: string;
  category: 'narrator' | 'main' | 'support' | 'unresolved' | 'sfx';
  voiceHint: string;
  appearanceCount: number;
}

export interface PerformanceDesignPayload {
  bgmTrack?: { mood: string; suggestion: string };
  sfxList: Array<{ atSegmentId: string; sfxType: string; description: string }>;
  cvDirections: Array<{ atSegmentId: string; emotion: string; pace: string }>;
}

export interface ReviewReportPayload {
  conclusion: 'pass' | 'pass_with_changes' | 'reject';
  issues: ReviewIssue[];
}

export interface ReviewIssue {
  severity: 'P0' | 'P1' | 'P2';
  category: string;
  location?: string;
  description: string;
  suggestion?: string;
}

export interface DeliveryPackagePayload {
  manifest: Array<{ name: string; type: string; size: string }>;
  versionTag: string;
  notes: string;
  adapted_script?: AdaptedScriptPayload;
  voice_markers?: VoiceRoleMarkersPayload;
  voice_registry?: VoiceRoleMarkersPayload;
  basic_qc_report?: ReviewReportPayload;
  review_report?: ReviewReportPayload;
  performance_design?: PerformanceDesignPayload;
}

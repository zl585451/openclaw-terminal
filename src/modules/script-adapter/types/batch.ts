import type { TaskExecutionSheet, VoiceRoleEntry } from './execution';

export type ChapterRangeMode = 'range' | 'discrete' | 'all';

export interface BatchEstimate {
  chapterCount: number;
  totalChars: number;
  estimatedDurationMinutes: number;
  estimatedCostCny: number;
  baseCostCny: number;
  cvCostCny: number;
  bgmSfxCostCny: number;
  warnings: string[];
}

export type TrialExecutionMode = 'mock' | 'real';

export interface DeliveryOptions {
  adaptedScript: true;
  voiceRegistry: boolean;
  qualityReview: boolean;
  cvDirections: boolean;
  bgmSfx: boolean;
  finalPackage: boolean;
}

export interface TaskCreationContract {
  bookId: string;
  bookTitle: string;
  chapterIndices: number[];
  rangeLabel: string;
  totalChars: number;
  chapterCount: number;
  workGoal: string;
  strategyTitle: string;
  strategyDesc?: string;
  deliveryOptions: DeliveryOptions;
}

export interface BatchConfig {
  executionMode?: TrialExecutionMode;
  realAgents?: 'off' | 'all' | string[];
  includePerformanceDesign?: boolean;
  deliveryOptions?: DeliveryOptions;
  budget?: BatchEstimate | null;
  sharedContext?: {
    voiceRegistry?: VoiceRoleEntry[];
    lastUpdatedAtChapter?: number | null;
  };
}

export interface BatchJob {
  id: string;
  bookId: string;
  bookTitle: string;
  selectedChapterIndices: number[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  config?: BatchConfig;
}

export interface ChapterRunRecord {
  id: string;
  batchId: string;
  bookId: string;
  chapterIndex: number;
  chapterTitle?: string | null;
  sourceChars?: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  sheet?: TaskExecutionSheet | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  cost?: number | null;
  attempt?: number;
}

import type {
  AdaptedScriptPayload,
  AgentExecutionPlan,
  AgentRun,
  ArtifactEnvelope,
  DeliveryPackagePayload,
  ExecutionStageStatus,
  PerformanceDesignPayload,
  ReviewGate,
  ReviewReportPayload,
  TaskExecutionSheet,
  VoiceRoleMarkersPayload,
} from '../types/execution';

const AGENTS = [
  {
    agentId: 'adapter.audiobook_text_rewriter@1.0',
    displayName: '文本改编师',
    roleSummary: '把原文改成更适合多人演播的口语化样章。',
    inputArtifactTypes: ['SourceDocument', 'AnalysisReport', 'ModificationStrategy'],
    outputArtifactTypes: ['AdaptedScript'],
  },
  {
    agentId: 'classifier.voice_role_marker@1.0',
    displayName: '角色音统筹',
    roleSummary: '标出旁白、明确角色音、未定来源声音和占位。',
    inputArtifactTypes: ['AdaptedScript'],
    outputArtifactTypes: ['VoiceRoleMarkers'],
  },
  {
    agentId: 'designer.performance_audio@1.0',
    displayName: '演播设计师',
    roleSummary: '补充 BGM、音效、CV 情绪、气息和动作提示。',
    inputArtifactTypes: ['AdaptedScript', 'VoiceRoleMarkers'],
    outputArtifactTypes: ['PerformanceDesign'],
  },
  {
    agentId: 'reviewer.production_quality@1.0',
    displayName: '质检审校',
    roleSummary: '检查剧情忠实度、角色音合理性和演播提示可执行性。',
    inputArtifactTypes: ['AdaptedScript', 'VoiceRoleMarkers', 'PerformanceDesign'],
    outputArtifactTypes: ['ReviewReport'],
  },
  {
    agentId: 'packager.content_delivery@1.0',
    displayName: '交付打包员',
    roleSummary: '把样章台本、角色音表、演播设计和质检报告整理成交付包。',
    inputArtifactTypes: ['AdaptedScript', 'VoiceRoleMarkers', 'PerformanceDesign', 'ReviewReport'],
    outputArtifactTypes: ['DeliveryPackage'],
  },
];

export interface PipelineCallbacks {
  onSheetCreated?: (sheet: TaskExecutionSheet) => void;
  onAgentStart?: (agentId: string, run: AgentRun) => void;
  onAgentProgress?: (agentId: string, stage: string, percent: number) => void;
  onAgentComplete?: (agentId: string, artifact: ArtifactEnvelope, run: AgentRun) => void;
  onAgentFailed?: (agentId: string, error: string) => void;
  onGateReached?: (gate: ReviewGate) => void;
  onAllComplete?: (sheet: TaskExecutionSheet) => void;
}

let currentAbortController: AbortController | null = null;

export function createExecutionPlan(taskId: string, taskTitle: string): TaskExecutionSheet {
  const createdAt = new Date().toISOString();
  const plan: AgentExecutionPlan = {
    planId: `plan-${taskId}`,
    taskId,
    agents: AGENTS.map((agent, index) => ({
      ...agent,
      order: index + 1,
      parallelizable: false,
    })),
    reviewGates: [
      {
        gateId: `gate-strategy-${taskId}`,
        afterAgentId: 'adapter.audiobook_text_rewriter@1.0',
        gateType: 'strategy_confirmation',
        description: '修改策略已在开工前确认，MVP 演示中自动通过。',
        status: 'pending',
      },
      {
        gateId: `gate-quality-${taskId}`,
        afterAgentId: 'reviewer.production_quality@1.0',
        gateType: 'quality_review',
        description: '质检结果需要复核，MVP 演示中自动通过。',
        status: 'pending',
      },
    ],
    createdAt,
  };

  return {
    taskId,
    taskTitle,
    plan,
    runs: plan.agents.map((agent) => ({
      runId: `run-${taskId}-${agent.order}`,
      planId: plan.planId,
      agentId: agent.agentId,
      status: 'pending',
      progressSummary: '等待开工',
      progressPercent: 0,
      outputArtifactIds: [],
    })),
    artifacts: {},
    gates: plan.reviewGates,
    overallStatus: 'pending',
    createdAt,
    updatedAt: createdAt,
  };
}

export async function executeAgentRun(
  plan: AgentExecutionPlan,
  agentId: string,
  onProgress: (stage: string, percent: number) => void,
  signal?: AbortSignal,
): Promise<ArtifactEnvelope> {
  const plannedAgent = plan.agents.find((agent) => agent.agentId === agentId);
  if (!plannedAgent) throw new Error(`未找到 Agent: ${agentId}`);

  await waitWithProgress(450, signal);
  onProgress('开始读取上游产物', 8);
  await waitWithProgress(650, signal);
  onProgress('正在生成结构化产物', 48);
  await waitWithProgress(700, signal);
  onProgress('正在整理交付摘要', 88);
  await waitWithProgress(450, signal);

  return createArtifactForAgent(agentId, plannedAgent.displayName);
}

export async function runFullPipeline(initialSheet: TaskExecutionSheet, callbacks: PipelineCallbacks) {
  const controller = new AbortController();
  currentAbortController = controller;
  let sheet = cloneSheet(initialSheet);
  const startedAt = new Date().toISOString();

  sheet = {
    ...sheet,
    overallStatus: 'running',
    updatedAt: startedAt,
  };
  callbacks.onSheetCreated?.(sheet);

  try {
    for (const agent of sheet.plan.agents) {
      if (controller.signal.aborted) throw new Error('用户取消');

      const runIndex = sheet.runs.findIndex((run) => run.agentId === agent.agentId);
      const startedRun: AgentRun = {
        ...sheet.runs[runIndex],
        status: 'running',
        startedAt: new Date().toISOString(),
        progressSummary: '开始执行',
        progressPercent: 5,
      };
      sheet = updateRun(sheet, runIndex, startedRun);
      callbacks.onAgentStart?.(agent.agentId, startedRun);

      const artifact = await executeAgentRun(
        sheet.plan,
        agent.agentId,
        (stage, percent) => {
          const currentRunIndex = sheet.runs.findIndex((run) => run.agentId === agent.agentId);
          sheet = updateRun(sheet, currentRunIndex, {
            ...sheet.runs[currentRunIndex],
            progressSummary: stage,
            progressPercent: percent,
          });
          callbacks.onAgentProgress?.(agent.agentId, stage, percent);
        },
        controller.signal,
      );

      const completedAt = new Date().toISOString();
      const completedRun: AgentRun = {
        ...sheet.runs[runIndex],
        status: 'completed',
        completedAt,
        durationMs: sheet.runs[runIndex].startedAt
          ? new Date(completedAt).getTime() - new Date(sheet.runs[runIndex].startedAt).getTime()
          : undefined,
        progressSummary: '已生成产物',
        progressPercent: 100,
        outputArtifactIds: [artifact.artifactId],
      };
      sheet = {
        ...updateRun(sheet, runIndex, completedRun),
        artifacts: {
          ...sheet.artifacts,
          [artifact.artifactId]: artifact,
        },
        updatedAt: completedAt,
      };
      callbacks.onAgentComplete?.(agent.agentId, artifact, completedRun);

      const gate = sheet.gates.find((item) => item.afterAgentId === agent.agentId && item.status === 'pending');
      if (gate) {
        const waitingGate = { ...gate };
        callbacks.onGateReached?.(waitingGate);
        await waitWithProgress(800, controller.signal);
        sheet = {
          ...sheet,
          gates: sheet.gates.map((item) =>
            item.gateId === gate.gateId ? { ...item, status: 'approved', relatedArtifactId: artifact.artifactId } : item,
          ),
        };
      }
    }

    sheet = {
      ...sheet,
      overallStatus: 'completed',
      updatedAt: new Date().toISOString(),
    };
    callbacks.onAllComplete?.(sheet);
    return sheet;
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行失败';
    const runningIndex = sheet.runs.findIndex((run) => run.status === 'running');
    if (runningIndex >= 0) {
      sheet = updateRun(sheet, runningIndex, {
        ...sheet.runs[runningIndex],
        status: 'failed',
        error: message,
        completedAt: new Date().toISOString(),
        progressSummary: message,
      });
      callbacks.onAgentFailed?.(sheet.runs[runningIndex].agentId, message);
    }
    return {
      ...sheet,
      overallStatus: 'failed' as ExecutionStageStatus,
      updatedAt: new Date().toISOString(),
    };
  } finally {
    currentAbortController = null;
  }
}

export function abortPipeline() {
  currentAbortController?.abort();
}

function createArtifactForAgent(agentId: string, displayName: string): ArtifactEnvelope {
  if (agentId === 'adapter.audiobook_text_rewriter@1.0') {
    const payload: AdaptedScriptPayload = {
      chapterTitle: '第1章 · 樟木箱',
      totalCharCount: 286,
      segments: [
        {
          segmentId: 'seg-001',
          type: 'narration',
          text: '三月的风从楼道窗缝里灌进来，带着一股灰尘和旧木头的味道。周佳宁站在门口，看着周婉云把钥匙插进那把发涩的锁里。',
          rewriteNote: '保留原场景信息，拆短句并增加可听化停顿。',
        },
        {
          segmentId: 'seg-002',
          type: 'dialogue',
          speaker: '周婉云',
          text: '东西都搬得差不多了。就剩阁楼上那些旧东西，你自己上去收拾一下。',
          rewriteNote: '对白改得更自然，保留人物冷淡的交代感。',
        },
        {
          segmentId: 'seg-003',
          type: 'dialogue',
          speaker: '周佳宁',
          text: '嗯。',
          rewriteNote: '短回应保留压抑情绪，不额外解释。',
        },
        {
          segmentId: 'seg-004',
          type: 'inner_monologue',
          speaker: '周佳宁',
          text: '她没有马上动。那扇通往阁楼的小门像一直等在那里，等她把某些不该翻出来的东西重新翻开。',
          rewriteNote: '内心感受保持悬疑，不提前揭示真相。',
        },
      ],
    };
    return envelope('AdaptedScript', agentId, displayName, '多人演播样章台本', '已完成第1章前半段的听感改编样稿。', payload, {
      segments: payload.segments.length,
      chars: payload.totalCharCount,
    });
  }

  if (agentId === 'classifier.voice_role_marker@1.0') {
    const payload: VoiceRoleMarkersPayload = {
      registry: [
        { roleName: '旁白', category: 'narrator', voiceHint: '冷静克制，悬疑感轻压', appearanceCount: 2 },
        { roleName: '周佳宁', category: 'main', voiceHint: '年轻女性，压抑、少话，反应慢半拍', appearanceCount: 2 },
        { roleName: '周婉云', category: 'main', voiceHint: '中年女性，语气利落，情绪不外露', appearanceCount: 1 },
        { roleName: '未定记录者A', category: 'unresolved', voiceHint: '文件或回忆中出现，暂不绑定正式角色', appearanceCount: 1 },
      ],
      unresolved: ['未定记录者A'],
    };
    return envelope('VoiceRoleMarkers', agentId, displayName, '角色音标注表', '已标出旁白、主要角色和一个待确认来源声音。', payload, {
      roles: payload.registry.length,
      unresolved: payload.unresolved.length,
    });
  }

  if (agentId === 'designer.performance_audio@1.0') {
    const payload: PerformanceDesignPayload = {
      bgmTrack: { mood: '空屋静场', suggestion: '低频稀疏铺底，保持人声清楚，进入阁楼前轻微收紧。' },
      sfxList: [
        { atSegmentId: 'seg-001', sfxType: 'AMB', description: '老楼道空旷底噪，轻微风声，持续但弱。' },
        { atSegmentId: 'seg-001', sfxType: 'SFX', description: '钥匙插入旧锁，近景，一次性。' },
        { atSegmentId: 'seg-004', sfxType: 'SFX', description: '阁楼小门木轴轻响，远近感由外到内。' },
      ],
      cvDirections: [
        { atSegmentId: 'seg-002', emotion: '克制/2级', pace: '平稳偏快，句尾收住。' },
        { atSegmentId: 'seg-004', emotion: '迟疑/2级 -> 紧绷/3级', pace: '前半句放慢，尾句留半拍。' },
      ],
    };
    return envelope('PerformanceDesign', agentId, displayName, '演播设计提示', '已补充场景底噪、关键音效和 CV 情绪方向。', payload, {
      sfx: payload.sfxList.length,
      directions: payload.cvDirections.length,
    });
  }

  if (agentId === 'reviewer.production_quality@1.0') {
    const payload: ReviewReportPayload = {
      conclusion: 'pass_with_changes',
      issues: [
        {
          severity: 'P1',
          category: '角色音',
          location: '未定记录者A',
          description: '该声音暂未在当前片段确认来源，需要后续统筹复核。',
          suggestion: '保持独立占位，不进入旁白池。',
        },
        {
          severity: 'P2',
          category: '可听度',
          location: 'seg-004',
          description: '内心旁白仍略偏文学化，但不影响样章试跑。',
          suggestion: '如继续扩全章，可再做一次轻口语化。',
        },
        {
          severity: 'P2',
          category: '演播设计',
          location: 'seg-001',
          description: '楼道底噪和风声可二选一，避免开场过满。',
          suggestion: '后期制作时优先保留楼道底噪。',
        },
      ],
    };
    return envelope('ReviewReport', agentId, displayName, '质检问题清单', '未发现 P0，建议带一条角色音复核进入交付。', payload, {
      issues: payload.issues.length,
      p1: 1,
      p2: 2,
    });
  }

  const payload: DeliveryPackagePayload = {
    manifest: [
      { name: '第1章前半段_多人演播样章.md', type: '台本', size: '3.2 KB' },
      { name: '第1章前半段_角色音标注表.json', type: '角色音', size: '1.1 KB' },
      { name: '第1章前半段_演播设计稿.md', type: '演播设计', size: '2.4 KB' },
      { name: '第1章前半段_质检报告.md', type: '质检', size: '1.5 KB' },
      { name: 'delivery_manifest.json', type: '清单', size: '0.8 KB' },
    ],
    versionTag: 'audiobook-mvp-sample-v0.1',
    notes: '本包为 mock 交付预览，用于验证执行链路和 UI 行为。',
  };
  return envelope('DeliveryPackage', agentId, displayName, '制作交付包', '样章台本、角色音表、演播设计和质检报告已整理完成。', payload, {
    files: payload.manifest.length,
  });
}

function envelope<T>(
  artifactType: ArtifactEnvelope<T>['artifactType'],
  producedBy: string,
  displayName: string,
  title: string,
  summary: string,
  payload: T,
  metrics?: Record<string, number>,
): ArtifactEnvelope<T> {
  return {
    artifactId: `artifact-${artifactType}-${Date.now()}`,
    artifactType,
    producedBy,
    producedAt: new Date().toISOString(),
    title,
    summary: `${displayName}：${summary}`,
    payload,
    metrics,
  };
}

function waitWithProgress(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('用户取消'));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new Error('用户取消'));
      },
      { once: true },
    );
  });
}

function updateRun(sheet: TaskExecutionSheet, runIndex: number, run: AgentRun): TaskExecutionSheet {
  return {
    ...sheet,
    runs: sheet.runs.map((item, index) => (index === runIndex ? run : item)),
    updatedAt: new Date().toISOString(),
  };
}

function cloneSheet(sheet: TaskExecutionSheet): TaskExecutionSheet {
  return {
    ...sheet,
    plan: {
      ...sheet.plan,
      agents: sheet.plan.agents.map((agent) => ({ ...agent })),
      reviewGates: sheet.plan.reviewGates.map((gate) => ({ ...gate })),
    },
    runs: sheet.runs.map((run) => ({ ...run })),
    artifacts: { ...sheet.artifacts },
    gates: sheet.gates.map((gate) => ({ ...gate })),
  };
}

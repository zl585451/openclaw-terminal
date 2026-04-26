// artifact 类型沿用 src/modules/script-adapter/types/artifact.ts 的 snake_case 命名,
// 确保 Gateway 推送的 artifactType 与前端 ArtifactPreview / store 的判断分支可以对上。
const AGENTS = [
  {
    agentId: 'adapter.audiobook_text_rewriter@1.0',
    displayName: '文本改编师',
    roleSummary: '把原文改成更适合多人演播的口语化样章。',
    inputArtifactTypes: ['source_document', 'analysis_report', 'modification_strategy'],
    outputArtifactTypes: ['adapted_script'],
  },
  {
    agentId: 'classifier.voice_role_marker@1.0',
    displayName: '角色音统筹',
    roleSummary: '标出旁白、明确角色音、未定来源声音和占位。',
    inputArtifactTypes: ['adapted_script'],
    outputArtifactTypes: ['voice_registry'],
  },
  {
    agentId: 'designer.performance_audio@1.0',
    displayName: '演播设计师',
    roleSummary: '补充 BGM、音效、CV 情绪、气息和动作提示。',
    inputArtifactTypes: ['adapted_script', 'voice_registry'],
    outputArtifactTypes: ['performance_design'],
  },
  {
    agentId: 'reviewer.production_quality@1.0',
    displayName: '质检审校',
    roleSummary: '检查剧情忠实度、角色音合理性和演播提示可执行性。',
    inputArtifactTypes: ['adapted_script', 'voice_registry', 'performance_design'],
    outputArtifactTypes: ['review_report'],
  },
  {
    agentId: 'packager.content_delivery@1.0',
    displayName: '交付打包员',
    roleSummary: '把样章台本、角色音表、演播设计和质检报告整理成交付包。',
    inputArtifactTypes: ['adapted_script', 'voice_registry', 'performance_design', 'review_report'],
    outputArtifactTypes: ['final_package'],
  },
];

function createExecutionPlan(taskId, taskTitle) {
  const createdAt = new Date().toISOString();
  const plan = {
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

function startMockScriptAdapterRun(params, connection, logger) {
  const taskId = String(params?.taskId || `script-adapter-${Date.now()}`);
  const taskTitle = String(params?.taskTitle || '多人演播有声书样章');
  let sheet = createExecutionPlan(taskId, taskTitle);

  const emit = (event, payload = {}) => {
    if (!connection?.isOpen?.()) return;
    connection.send({
      type: 'event',
      event: 'script-adapter',
      payload: {
        event,
        taskId,
        ...payload,
      },
    });
  };

  setTimeout(() => {
    runPipeline().catch((error) => {
      logger?.error?.('script adapter mock run failed', { taskId, error: error?.message || String(error) });
      emit('run_failed', { error: error?.message || String(error) });
    });
  }, 0);

  async function runPipeline() {
    sheet = { ...sheet, overallStatus: 'running', updatedAt: new Date().toISOString() };
    emit('sheet_created', { sheet });

    for (const agent of sheet.plan.agents) {
      const runIndex = sheet.runs.findIndex((run) => run.agentId === agent.agentId);
      let run = {
        ...sheet.runs[runIndex],
        status: 'running',
        startedAt: new Date().toISOString(),
        progressSummary: '开始执行',
        progressPercent: 5,
      };
      sheet = updateRun(sheet, runIndex, run);
      emit('agent_started', { agentId: agent.agentId, run });

      for (const step of [
        ['开始读取上游产物', 8],
        ['正在生成结构化产物', 48],
        ['正在整理交付摘要', 88],
      ]) {
        await wait(520);
        run = {
          ...run,
          progressSummary: step[0],
          progressPercent: step[1],
        };
        sheet = updateRun(sheet, runIndex, run);
        emit('agent_progress', {
          agentId: agent.agentId,
          progressSummary: step[0],
          progressPercent: step[1],
        });
      }

      await wait(360);
      const artifact = createArtifactForAgent(agent.agentId, agent.displayName);
      const completedAt = new Date().toISOString();
      run = {
        ...run,
        status: 'completed',
        completedAt,
        durationMs: run.startedAt ? new Date(completedAt).getTime() - new Date(run.startedAt).getTime() : undefined,
        progressSummary: '已生成产物',
        progressPercent: 100,
        outputArtifactIds: [artifact.artifactId],
      };
      sheet = {
        ...updateRun(sheet, runIndex, run),
        artifacts: {
          ...sheet.artifacts,
          [artifact.artifactId]: artifact,
        },
        updatedAt: completedAt,
      };
      emit('artifact_created', { agentId: agent.agentId, artifact, run });

      const gate = sheet.gates.find((item) => item.afterAgentId === agent.agentId && item.status === 'pending');
      if (gate) {
        emit('gate_reached', { gate });
        await wait(500);
        const approvedGate = { ...gate, status: 'approved', relatedArtifactId: artifact.artifactId };
        sheet = {
          ...sheet,
          gates: sheet.gates.map((item) => (item.gateId === gate.gateId ? approvedGate : item)),
        };
        emit('gate_updated', { gate: approvedGate });
      }
    }

    sheet = { ...sheet, overallStatus: 'completed', updatedAt: new Date().toISOString() };
    emit('all_completed', { sheet });
  }

  return {
    taskId,
    planId: sheet.plan.planId,
  };
}

function createArtifactForAgent(agentId, displayName) {
  if (agentId === 'adapter.audiobook_text_rewriter@1.0') {
    return envelope('adapted_script', agentId, displayName, '多人演播样章台本', '已完成第1章前半段的听感改编样稿。', {
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
      ],
    }, { segments: 2, chars: 286 });
  }

  if (agentId === 'classifier.voice_role_marker@1.0') {
    return envelope('voice_registry', agentId, displayName, '角色音标注表', '已标出旁白、主要角色和一个待确认来源声音。', {
      registry: [
        { roleName: '旁白', category: 'narrator', voiceHint: '冷静克制，悬疑感轻压', appearanceCount: 2 },
        { roleName: '周佳宁', category: 'main', voiceHint: '年轻女性，压抑、少话，反应慢半拍', appearanceCount: 2 },
        { roleName: '周婉云', category: 'main', voiceHint: '中年女性，语气利落，情绪不外露', appearanceCount: 1 },
        { roleName: '未定记录者A', category: 'unresolved', voiceHint: '文件或回忆中出现，暂不绑定正式角色', appearanceCount: 1 },
      ],
      unresolved: ['未定记录者A'],
    }, { roles: 4, unresolved: 1 });
  }

  if (agentId === 'designer.performance_audio@1.0') {
    return envelope('performance_design', agentId, displayName, '演播设计提示', '已补充场景底噪、关键音效和 CV 情绪方向。', {
      bgmTrack: { mood: '空屋静场', suggestion: '低频稀疏铺底，保持人声清楚，进入阁楼前轻微收紧。' },
      sfxList: [
        { atSegmentId: 'seg-001', sfxType: 'AMB', description: '老楼道空旷底噪，轻微风声，持续但弱。' },
        { atSegmentId: 'seg-001', sfxType: 'SFX', description: '钥匙插入旧锁，近景，一次性。' },
      ],
      cvDirections: [
        { atSegmentId: 'seg-002', emotion: '克制/2级', pace: '平稳偏快，句尾收住。' },
      ],
    }, { sfx: 2, directions: 1 });
  }

  if (agentId === 'reviewer.production_quality@1.0') {
    return envelope('review_report', agentId, displayName, '质检问题清单', '未发现 P0，建议带一条角色音复核进入交付。', {
      conclusion: 'pass_with_changes',
      issues: [
        {
          severity: 'P1',
          category: '角色音',
          location: '未定记录者A',
          description: '该声音暂未在当前片段确认来源，需要后续统筹复核。',
          suggestion: '保持独立占位，不进入旁白池。',
        },
      ],
    }, { issues: 1, p1: 1 });
  }

  return envelope('final_package', agentId, displayName, '制作交付包', '样章台本、角色音表、演播设计和质检报告已整理完成。', {
    manifest: [
      { name: '第1章前半段_多人演播样章.md', type: '台本', size: '3.2 KB' },
      { name: '第1章前半段_角色音标注表.json', type: '角色音', size: '1.1 KB' },
      { name: '第1章前半段_演播设计稿.md', type: '演播设计', size: '2.4 KB' },
      { name: '第1章前半段_质检报告.md', type: '质检', size: '1.5 KB' },
    ],
    versionTag: 'audiobook-mvp-sample-v0.1',
    notes: '本包为 Gateway mock 交付预览，用于验证执行链路和 UI 行为。',
  }, { files: 4 });
}

function envelope(artifactType, producedBy, displayName, title, summary, payload, metrics) {
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

function updateRun(sheet, runIndex, run) {
  return {
    ...sheet,
    runs: sheet.runs.map((item, index) => (index === runIndex ? run : item)),
    updatedAt: new Date().toISOString(),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  startMockScriptAdapterRun,
};

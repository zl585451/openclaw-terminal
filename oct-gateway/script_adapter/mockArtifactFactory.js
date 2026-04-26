// artifact 类型沿用 src/modules/script-adapter/types/artifact.ts 的 snake_case 命名,
// 确保 Gateway 推送的 artifactType 与前端 ArtifactPreview / store 的判断分支可以对上。
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

module.exports = {
  createArtifactForAgent,
};

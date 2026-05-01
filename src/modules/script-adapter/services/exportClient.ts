import type { TaskExecutionSheet } from '../types/execution';
import type { BatchJob, ChapterRunRecord, DeliveryOptions } from '../types/batch';

export async function exportDeliveryAsMarkdown(
  sheet: TaskExecutionSheet,
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  if (!window.electronAPI?.delivery?.exportMarkdown) {
    return { success: false, error: 'delivery API unavailable' };
  }

  const filename = `${sanitize(sheet.taskTitle || 'delivery')}.md`;
  const content = renderDeliveryMarkdown(sheet);
  return window.electronAPI.delivery.exportMarkdown({ filename, content });
}

export async function exportDeliveryAsDocx(
  sheet: TaskExecutionSheet,
  options: {
    bookTitle?: string;
    chapterRange?: string;
    executionMode?: 'mock' | 'real';
    deliveryOptions?: Partial<DeliveryOptions>;
  } = {},
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  if (!window.electronAPI?.delivery?.exportDocx) {
    return { success: false, error: 'delivery API unavailable' };
  }
  const filename = `${sanitize(options.bookTitle || sheet.taskTitle || 'delivery')}.docx`;
  const data = buildSingleDocxPayload(sheet, options);
  return window.electronAPI.delivery.exportDocx({
    filename,
    documentTitle: data.documentTitle,
    data,
  });
}

export function renderDeliveryMarkdown(sheet: TaskExecutionSheet): string {
  const artifacts = Object.values(sheet.artifacts);
  const adapted = artifacts.find((item) => item.artifactType === 'adapted_script');
  const voices = artifacts.find((item) => item.artifactType === 'voice_registry');
  const performance = artifacts.find((item) => item.artifactType === 'performance_design');
  const review = artifacts.find((item) => item.artifactType === 'review_report');
  const pack = artifacts.find((item) => item.artifactType === 'final_package');

  const lines: string[] = [];
  lines.push(`# ${sheet.taskTitle || '多人演播交付包'}`);
  lines.push('');
  lines.push(`> 生成时间：${new Date(sheet.createdAt).toLocaleString('zh-CN')}`);
  lines.push(`> 版本：${String((pack?.payload as { versionTag?: string } | undefined)?.versionTag || '—')}`);
  lines.push('');

  if (adapted) {
    const payload = adapted.payload as {
      chapterTitle?: string;
      segments?: Array<{
        type?: string;
        speaker?: string;
        text?: string;
        rewriteNote?: string;
      }>;
    };
    lines.push('## 改编台本');
    lines.push('');
    if (payload.chapterTitle) {
      lines.push(`> 章节：${payload.chapterTitle}`);
      lines.push('');
    }
    for (const segment of payload.segments || []) {
      const speaker = formatScriptSpeaker(segment);
      const text = String(segment.text || '');
      const body = segment.type === 'inner_monologue' ? `_${text}_` : text;
      lines.push(`**[${speaker}]** ${body}`);
      if (segment.rewriteNote) {
        lines.push(`> 改编说明：${segment.rewriteNote}`);
      }
      lines.push('');
    }
  }

  if (voices) {
    const payload = voices.payload as {
      registry?: Array<{ roleName?: string; category?: string; appearanceCount?: number; voiceHint?: string }>;
    };
    lines.push('## 角色音表');
    lines.push('');
    lines.push('| 角色 | 类别 | 出场 | 声线建议 |');
    lines.push('| --- | --- | --- | --- |');
    for (const role of payload.registry || []) {
      lines.push(
        `| ${escapeTable(role.roleName)} | ${escapeTable(role.category)} | ${role.appearanceCount ?? 0} | ${escapeTable(role.voiceHint)} |`,
      );
    }
    lines.push('');
  }

  if (performance) {
    const payload = performance.payload as {
      bgmTrack?: { mood?: string; suggestion?: string };
      sfxList?: Array<{ atSegmentId?: string; sfxType?: string; description?: string }>;
      cvDirections?: Array<{ atSegmentId?: string; emotion?: string; pace?: string }>;
    };
    const hasBgm = Boolean(payload.bgmTrack?.mood || payload.bgmTrack?.suggestion);
    const hasSfx = Boolean(payload.sfxList && payload.sfxList.length > 0);
    const hasCv = Boolean(payload.cvDirections && payload.cvDirections.length > 0);
    lines.push('## 演播设计');
    lines.push('');
    if (hasBgm) {
      lines.push(
        `**BGM**：${payload.bgmTrack?.mood || '—'}${payload.bgmTrack?.suggestion ? ` · ${payload.bgmTrack.suggestion}` : ''}`,
      );
      lines.push('');
    }
    if (hasSfx) {
      lines.push('**音效建议**：');
      for (const item of payload.sfxList || []) {
        lines.push(`- [${item.atSegmentId || '-'}] ${item.sfxType || 'SFX'}：${item.description || ''}`);
      }
      lines.push('');
    }
    if (hasCv) {
      lines.push('**CV 演播指导**：');
      for (const item of payload.cvDirections || []) {
        lines.push(`- [${item.atSegmentId || '-'}] 情绪：${item.emotion || '-'} / 节奏：${item.pace || '-'}`);
      }
      lines.push('');
    }
  }

  if (review) {
    const payload = review.payload as {
      conclusion?: string;
      issues?: Array<{ severity?: string; category?: string; location?: string; description?: string; suggestion?: string }>;
    };
    const labels: Record<string, string> = {
      pass: '可直接交付',
      pass_with_changes: '带条件交付',
      reject: '需返工',
    };
    lines.push('## 质检报告');
    lines.push('');
    lines.push(`**结论**：${labels[payload.conclusion || ''] || payload.conclusion || '—'}`);
    lines.push('');
    for (const issue of payload.issues || []) {
      lines.push(
        `- **${issue.severity || 'P2'}** [${issue.category || 'general'}/${issue.location || '全局'}] ${issue.description || ''}`,
      );
      if (issue.suggestion) {
        lines.push(`  建议：${issue.suggestion}`);
      }
    }
    if (!payload.issues || payload.issues.length === 0) lines.push('- 无');
    lines.push('');
  }

  if (pack) {
    const payload = pack.payload as {
      manifest?: Array<{ name?: string; type?: string; size?: string }>;
      notes?: string;
    };
    lines.push('## 交付清单');
    lines.push('');
    for (const item of payload.manifest || []) {
      lines.push(`- ${item.name || '未命名'}（${item.type || '-'} / ${item.size || '-'}）`);
    }
    if (!payload.manifest || payload.manifest.length === 0) lines.push('- 暂无');
    lines.push('');
    if (payload.notes) {
      lines.push(`> ${payload.notes}`);
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export async function exportBatchDeliveryAsMarkdown(
  batch: BatchJob,
  chapterRuns: ChapterRunRecord[],
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  if (!window.electronAPI?.delivery?.exportMarkdown) {
    return { success: false, error: 'delivery API unavailable' };
  }
  const filename = `${sanitize(batch.bookTitle || batch.id)}_batch_${batch.id.slice(-6)}.md`;
  const content = renderBatchDeliveryMarkdown(batch, chapterRuns);
  return window.electronAPI.delivery.exportMarkdown({ filename, content });
}

export async function exportBatchDeliveryAsDocx(
  batch: BatchJob,
  chapterRuns: ChapterRunRecord[],
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  if (!window.electronAPI?.delivery?.exportDocx) {
    return { success: false, error: 'delivery API unavailable' };
  }
  const filename = `${sanitize(batch.bookTitle || batch.id)}_试产交付.docx`;
  const data = buildBatchDocxPayload(batch, chapterRuns);
  return window.electronAPI.delivery.exportDocx({
    filename,
    documentTitle: data.documentTitle,
    data,
  });
}

export function renderBatchDeliveryMarkdown(batch: BatchJob, chapterRuns: ChapterRunRecord[]): string {
  const sortedRuns = [...chapterRuns].sort((a, b) => a.chapterIndex - b.chapterIndex);
  const completedRuns = sortedRuns.filter((run) => run.status === 'completed' && run.sheet);
  const failedRuns = sortedRuns.filter((run) => run.status === 'failed');
  const lines: string[] = [];
  lines.push(`# ${batch.bookTitle} · 批次交付汇总`);
  lines.push('');
  lines.push(`> 批次 ID：${batch.id}`);
  lines.push(`> 章节数：${batch.totalChapters}（完成 ${batch.completedChapters} / 失败 ${batch.failedChapters}）`);
  lines.push(`> 预计费用：¥${Number(batch.estimatedCost || 0).toFixed(2)} · 实际累计：¥${Number(batch.actualCost || 0).toFixed(2)}`);
  lines.push('');

  const sharedRegistry = batch.config?.sharedContext?.voiceRegistry || [];
  if (sharedRegistry.length > 0) {
    lines.push('## 整批角色音表');
    lines.push('');
    lines.push('| 角色 | 类别 | 出场 | 声线建议 |');
    lines.push('| --- | --- | --- | --- |');
    for (const role of sharedRegistry) {
      lines.push(
        `| ${escapeTable(role.roleName)} | ${escapeTable(role.category)} | ${role.appearanceCount ?? 0} | ${escapeTable(role.voiceHint)} |`,
      );
    }
    lines.push('');
  }

  for (const run of completedRuns) {
    lines.push(`## ${run.chapterTitle || `第 ${run.chapterIndex + 1} 章`}`);
    lines.push('');
    lines.push(renderDeliveryMarkdown(run.sheet!).trimEnd());
    lines.push('');
  }

  if (failedRuns.length > 0) {
    lines.push('## 失败章节');
    lines.push('');
    for (const run of failedRuns) {
      lines.push(`- ${run.chapterTitle || `第 ${run.chapterIndex + 1} 章`}：${run.errorMessage || '未知错误'}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function sanitize(name: string): string {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'delivery';
}

function escapeTable(value: unknown): string {
  return String(value || '').replace(/\|/g, '\\|');
}

export function formatScriptSpeaker(segment: { type?: string; speaker?: string; text?: string }): string {
  if (segment?.type === 'narration') return '旁白';
  if (segment?.type === 'inner_monologue') {
    const speaker = String(segment.speaker || '').trim() || '内心';
    return `${speaker}][OS`;
  }
  return normalizeFunctionalSpeakerLabel(segment) || '未标注';
}

function normalizeFunctionalSpeakerLabel(segment: { speaker?: string; text?: string }): string {
  const speaker = String(segment?.speaker || '').trim();
  const text = String(segment?.text || '').trim();
  if (/^(?:系统音|系统|提示音|电子提示音)$/.test(speaker) && isPlainSfxText(text)) return 'SFX';
  if (/^(?:音效|拟声)$/i.test(speaker)) return 'SFX';
  return speaker;
}

function isPlainSfxText(text: string): boolean {
  return /^(?:(?:咔|咚|砰|啪|哗啦|滋啦|吱呀|滴|嗡|轰|咔嚓|咳|嘶)(?:[~…。.！!？?\-—，,、]*)\s*)+$/.test(text);
}

function buildSingleDocxPayload(
  sheet: TaskExecutionSheet,
  options: {
    bookTitle?: string;
    chapterRange?: string;
    executionMode?: 'mock' | 'real';
    deliveryOptions?: Partial<DeliveryOptions>;
  },
) {
  const deliveryOptions = options.deliveryOptions || {};
  const artifacts = Object.values(sheet.artifacts);
  const adapted = artifacts.find((item) => item.artifactType === 'adapted_script') as any;
  const voices = artifacts.find((item) => item.artifactType === 'voice_registry') as any;
  const performance = artifacts.find((item) => item.artifactType === 'performance_design') as any;
  const review = artifacts.find((item) => item.artifactType === 'review_report') as any;
  const includeCv = deliveryOptions.cvDirections === true || ((performance?.payload?.cvDirections?.length || 0) > 0 && deliveryOptions.cvDirections !== false);
  const includeBgmSfx = deliveryOptions.bgmSfx === true || ((((performance?.payload?.sfxList?.length || 0) > 0) || performance?.payload?.bgmTrack?.mood) && deliveryOptions.bgmSfx !== false);
  const metadata = [
    { label: '项目', value: options.bookTitle || sheet.taskTitle || '多人演播试产' },
    { label: '章节范围', value: options.chapterRange || adapted?.payload?.chapterTitle || sheet.taskTitle || '单章' },
    { label: '生成时间', value: new Date(sheet.createdAt).toLocaleString('zh-CN') },
    { label: '执行方式', value: options.executionMode === 'real' ? '真实 Agent 制作' : '未启用真实 Agent' },
    { label: 'BGM/SFX', value: includeBgmSfx ? '已启用' : '未启用' },
  ];
  const sections: Array<{ title: string; level: 1 | 2 | 3; blocks: any[] }> = [];
  sections.push({
    title: '一、交付摘要',
    level: 1,
    blocks: [{
      type: 'bullet',
      items: [
        `已生成内容：${[
          '多人演播台本',
          deliveryOptions.voiceRegistry !== false ? '角色音表' : null,
          deliveryOptions.qualityReview !== false ? '质检报告' : null,
          includeCv ? 'CV 演播指导' : null,
          includeBgmSfx ? 'BGM/SFX 建议' : null,
        ].filter(Boolean).join(' / ')}`,
      ],
    }],
  });
  if (voices?.payload?.registry?.length) {
    sections.push({
      title: '二、角色音总表',
      level: 1,
      blocks: [{
        type: 'table',
        columns: ['角色', '类别', '出场次数', '声线建议'],
        rows: (voices.payload.registry || []).map((item: any) => [
          String(item.roleName || ''),
          String(item.category || ''),
          String(item.appearanceCount ?? 0),
          String(item.voiceHint || ''),
        ]),
      }],
    });
  }
  if (adapted?.payload?.segments?.length) {
    sections.push({
      title: '三、多人演播台本',
      level: 1,
      blocks: adapted.payload.segments.map((segment: any) => ({
        type: 'scriptLine',
        speaker: formatScriptSpeaker(segment),
        text: String(segment.text || ''),
        note: segment.rewriteNote ? String(segment.rewriteNote) : undefined,
      })),
    });
  }
  if (includeCv && performance?.payload?.cvDirections?.length) {
    sections.push({
      title: '四、CV 演播指导',
      level: 1,
      blocks: [{
        type: 'bullet',
        items: performance.payload.cvDirections.map((item: any) => `${item.atSegmentId}：情绪 ${item.emotion || '-'} / 节奏 ${item.pace || '-'}`),
      }],
    });
  }
  if (includeBgmSfx) {
    const items = [];
    if (performance?.payload?.bgmTrack?.mood || performance?.payload?.bgmTrack?.suggestion) {
      items.push(`BGM：${performance.payload.bgmTrack.mood || '-'} ${performance.payload.bgmTrack.suggestion || ''}`.trim());
    }
    for (const item of performance?.payload?.sfxList || []) {
      items.push(`${item.atSegmentId}：${item.sfxType || 'SFX'} ${item.description || ''}`.trim());
    }
    if (items.length > 0) {
      sections.push({
        title: '五、BGM/SFX 建议',
        level: 1,
        blocks: [{ type: 'bullet', items }],
      });
    }
  }
  if (review?.payload) {
    sections.push({
      title: includeCv || includeBgmSfx ? '六、质检报告' : '四、质检报告',
      level: 1,
      blocks: [
        { type: 'paragraph', text: `结论：${humanReviewConclusion(review.payload.conclusion)}` },
        {
          type: 'table',
          columns: ['严重度', '类别', '位置', '问题说明', '建议'],
          rows: (review.payload.issues || []).map((item: any) => [
            String(item.severity || ''),
            String(item.category || ''),
            String(item.location || '全局'),
            String(item.description || ''),
            String(item.suggestion || ''),
          ]),
        },
      ],
    });
  }
  return {
    documentTitle: `${options.bookTitle || sheet.taskTitle || '多人演播试产'} 交付包`,
    metadata,
    sections,
  };
}

function buildBatchDocxPayload(batch: BatchJob, chapterRuns: ChapterRunRecord[]) {
  const sortedRuns = [...chapterRuns].sort((a, b) => a.chapterIndex - b.chapterIndex);
  const completedRuns = sortedRuns.filter((run) => run.status === 'completed' && run.sheet);
  const failedRuns = sortedRuns.filter((run) => run.status === 'failed');
  const deliveryOptions: Partial<DeliveryOptions> = batch.config?.deliveryOptions || {};
  const metadata = [
    { label: '项目', value: batch.bookTitle },
    { label: '章节范围', value: formatChapterRange(batch.selectedChapterIndices) },
    { label: '生成时间', value: new Date(batch.createdAt).toLocaleString('zh-CN') },
    { label: '执行方式', value: batch.config?.executionMode === 'real' ? '真实 Agent 制作' : '未启用真实 Agent' },
    { label: '完成情况', value: `${batch.completedChapters}/${batch.totalChapters} 完成，${batch.failedChapters} 失败` },
  ];
  const sections: Array<{ title: string; level: 1 | 2 | 3; blocks: any[] }> = [];
  sections.push({
    title: '一、交付摘要',
    level: 1,
    blocks: [{
      type: 'bullet',
      items: [
        `已完成章节：${batch.completedChapters} / ${batch.totalChapters}`,
        `已启用内容：${[
          '多人演播台本',
          deliveryOptions.voiceRegistry !== false ? '角色音表' : null,
          deliveryOptions.qualityReview !== false ? '质检报告' : null,
          deliveryOptions.cvDirections ? 'CV 演播指导' : null,
          deliveryOptions.bgmSfx ? 'BGM/SFX 建议' : null,
        ].filter(Boolean).join(' / ')}`,
        failedRuns.length > 0 ? `失败章节：${failedRuns.map((run) => run.chapterTitle || `第 ${run.chapterIndex + 1} 章`).join(' / ')}` : '失败章节：无',
      ],
    }],
  });
  const voiceRegistry = batch.config?.sharedContext?.voiceRegistry || [];
  if (voiceRegistry.length > 0) {
    sections.push({
      title: '二、角色音总表',
      level: 1,
      blocks: [{
        type: 'table',
        columns: ['角色', '类别', '出场次数', '声线建议'],
        rows: voiceRegistry.map((item) => [
          String(item.roleName || ''),
          String(item.category || ''),
          String(item.appearanceCount ?? 0),
          String(item.voiceHint || ''),
        ]),
      }],
    });
  }
  for (const run of completedRuns) {
    const artifacts = Object.values(run.sheet!.artifacts);
    const adapted = artifacts.find((item) => item.artifactType === 'adapted_script') as any;
    const review = artifacts.find((item) => item.artifactType === 'review_report') as any;
    const performance = artifacts.find((item) => item.artifactType === 'performance_design') as any;
    sections.push({
      title: `${run.chapterTitle || `第 ${run.chapterIndex + 1} 章`} · 多人演播台本`,
      level: 1,
      blocks: (adapted?.payload?.segments || []).map((segment: any) => ({
        type: 'scriptLine',
        speaker: formatScriptSpeaker(segment),
        text: String(segment.text || ''),
      })),
    });
    if (deliveryOptions.cvDirections && performance?.payload?.cvDirections?.length) {
      sections.push({
        title: `${run.chapterTitle || `第 ${run.chapterIndex + 1} 章`} · CV 演播指导`,
        level: 2,
        blocks: [{ type: 'bullet', items: performance.payload.cvDirections.map((item: any) => `${item.atSegmentId}：情绪 ${item.emotion || '-'} / 节奏 ${item.pace || '-'}`) }],
      });
    }
    if (deliveryOptions.bgmSfx) {
      const items = [];
      if (performance?.payload?.bgmTrack?.mood || performance?.payload?.bgmTrack?.suggestion) {
        items.push(`BGM：${performance.payload.bgmTrack.mood || '-'} ${performance.payload.bgmTrack.suggestion || ''}`.trim());
      }
      for (const item of performance?.payload?.sfxList || []) {
        items.push(`${item.atSegmentId}：${item.sfxType || 'SFX'} ${item.description || ''}`.trim());
      }
      if (items.length > 0) {
        sections.push({
          title: `${run.chapterTitle || `第 ${run.chapterIndex + 1} 章`} · BGM/SFX 建议`,
          level: 2,
          blocks: [{ type: 'bullet', items }],
        });
      }
    }
    if (review?.payload) {
      sections.push({
        title: `${run.chapterTitle || `第 ${run.chapterIndex + 1} 章`} · 质检报告`,
        level: 2,
        blocks: [
          { type: 'paragraph', text: `结论：${humanReviewConclusion(review.payload.conclusion)}` },
          {
            type: 'table',
            columns: ['严重度', '类别', '位置', '问题说明', '建议'],
            rows: (review.payload.issues || []).map((item: any) => [
              String(item.severity || ''),
              String(item.category || ''),
              String(item.location || '全局'),
              String(item.description || ''),
              String(item.suggestion || ''),
            ]),
          },
        ],
      });
    }
  }
  if (failedRuns.length > 0) {
    sections.push({
      title: '失败 / 跳过章节',
      level: 1,
      blocks: [{ type: 'bullet', items: failedRuns.map((run) => `${run.chapterTitle || `第 ${run.chapterIndex + 1} 章`}：${run.errorMessage || '未知错误'}`) }],
    });
  }
  return {
    documentTitle: `${batch.bookTitle} 多人演播试产交付包`,
    metadata,
    sections,
  };
}

function humanReviewConclusion(conclusion: string) {
  if (conclusion === 'pass') return '可进入制作';
  if (conclusion === 'pass_with_changes') return '建议调整后进入制作';
  if (conclusion === 'reject') return '需要返工';
  return conclusion || '待确认';
}

function formatChapterRange(indices: number[]) {
  if (!indices || indices.length === 0) return '未选择章节';
  const sorted = [...indices].sort((a, b) => a - b);
  if (sorted.length === 1) return `第 ${sorted[0] + 1} 章`;
  return `第 ${sorted[0] + 1}-${sorted[sorted.length - 1] + 1} 章`;
}

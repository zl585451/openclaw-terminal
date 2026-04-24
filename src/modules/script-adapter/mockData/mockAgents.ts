import type { AgentDef } from '../types/agent';

export const MOCK_AGENTS: AgentDef[] = [
  { id: 'ingest.chapter_splitter', version: '1.0', role: '章节切分·规则驱动', stageIdx: 0, preferredModel: '轻量规则 + 小模型' },
  { id: 'analyzer.character_profile', version: '1.2', role: '人物档案分析师', stageIdx: 1, preferredModel: 'DeepSeek R1' },
  { id: 'analyzer.artifact_tracker', version: '1.0', role: '物件意象追踪', stageIdx: 1, preferredModel: 'DeepSeek R1' },
  { id: 'analyzer.timeline_builder', version: '1.0', role: '时空线构建', stageIdx: 1, preferredModel: 'DeepSeek R1' },
  { id: 'analyzer.style_profiler', version: '1.0', role: '风格画像', stageIdx: 1, preferredModel: 'Claude Sonnet' },
  { id: 'analyzer.scene_splitter', version: '1.0', role: '场景切分标注', stageIdx: 2, preferredModel: 'Qwen Max' },
  { id: 'distiller.content_filter', version: '1.0', role: '提炼去芜', stageIdx: 3, preferredModel: 'DeepSeek R1' },
  { id: 'rewriter.audiobook', version: '1.0', role: '有声书台本改写', stageIdx: 4, preferredModel: 'Claude Sonnet' },
  { id: 'reviewer.consistency', version: '1.0', role: '一致性审核', stageIdx: 5, preferredModel: 'DeepSeek R1' },
  { id: 'reviewer.style_match', version: '1.0', role: '风格匹配审核', stageIdx: 5, preferredModel: 'Claude Sonnet' },
  { id: 'packager.audiobook', version: '1.0', role: '交付打包', stageIdx: 7, preferredModel: '规则驱动' },
];

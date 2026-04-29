import type { TeamTemplate } from '../types/template';

export const MOCK_TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'audiobook_multicast.v1',
    version: '1.0',
    name: '多人演播有声小说',
    type: 'audiobook_multicast',
    description: '将长篇小说加工为多人演播台本，包含文本改编、角色音分类、演播设计和质检。',
    stageIds: [
      'stage-ingestion',
      'stage-analysis',
      'stage-text-adaptation',
      'stage-voice-classification',
      'stage-performance-design',
      'stage-quality-review',
      'stage-human-review',
      'stage-export',
    ],
    requiredArtifactTypes: [
      'chapter_index',
      'project_context',
      'plot_lock',
      'scene_breakdown',
      'adapted_script',
      'voice_registry',
      'performance_design',
      'review_report',
      'final_package',
    ],
    optionalArtifactTypes: ['character_profile', 'artifact_tracker', 'timeline', 'style_profile'],
  },
  {
    id: 'radiodrama.v1',
    version: '0.1',
    name: '广播剧改编',
    type: 'radiodrama',
    description: '预留模板。未来允许更强的戏剧化、场面化和冲突增强。',
    stageIds: [],
    requiredArtifactTypes: [],
  },
];

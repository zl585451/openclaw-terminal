import type { Artifact } from '../types/artifact';

export const MOCK_ARTIFACTS: Artifact[] = [
  {
    id: 'art-chapters-idx-v1',
    projectId: 'proj-changye-weiming',
    type: 'chapter_index',
    scope: 'project',
    scopeId: 'proj-changye-weiming',
    version: 1,
    content: null,
    contentPreview:
      '[\n  { "idx": 1, "title": "樟木箱", "time": "2015年3月", "chars": 3240 },\n  { "idx": 2, "title": "夜", "time": "2015年3月", "chars": 2890 },\n  { "idx": 3, "title": "滋啦", "time": "1986年3月", "chars": 3105 },\n  ...',
    status: 'approved',
    isFrozen: true,
    createdAt: '2026-04-24T08:30:04Z',
  },
  {
    id: 'art-char-profile-v1',
    projectId: 'proj-changye-weiming',
    type: 'character_profile',
    scope: 'project',
    scopeId: 'proj-changye-weiming',
    version: 1,
    content: null,
    contentPreview:
      '[\n  {\n    "id": "zhou_jianing",\n    "name": "周佳宁",\n    "role": "主角·2015线",\n    "identity": "周振山外甥女",\n    "voice_style": "克制、理性、对家族史有隔阂",\n    "first_appear": "第1章"\n  },\n  {\n    "id": "zhou_zhenshan",\n    "name": "周振山",\n    "role": "主角·1986线",\n    "identity": "临水市公安局刑侦科干警",\n    ...',
    status: 'approved',
    isFrozen: true,
    createdAt: '2026-04-24T08:32:10Z',
  },
  {
    id: 'art-artifact-tracker-v1',
    projectId: 'proj-changye-weiming',
    type: 'artifact_tracker',
    scope: 'project',
    scopeId: 'proj-changye-weiming',
    version: 1,
    content: null,
    contentPreview:
      '[\n  {\n    "id": "camphor_trunk",\n    "name": "樟木箱",\n    "significance": "开启主线·连接双时空",\n    "chapters": [1, 4, 12, 19],\n    "description_anchors": [\n      "深棕色硬壳，四角黄铜片氧化发黑",\n      "搭扣锁锈死"\n    ]\n  },\n  {\n    "id": "walkie_talkie",\n    "name": "对讲机",\n    ...',
    status: 'approved',
    isFrozen: true,
    createdAt: '2026-04-24T08:32:15Z',
  },
  {
    id: 'art-style-profile-v1',
    projectId: 'proj-changye-weiming',
    type: 'style_profile',
    scope: 'project',
    scopeId: 'proj-changye-weiming',
    version: 1,
    content: null,
    contentPreview:
      '{\n  "tone": "冷峻、克制、物件特写密集",\n  "narrative_pov": "第三人称有限视角，双线并置",\n  "dialogue_ratio": 0.32,\n  "sentence_length": "短句为主，氛围描写偶用长句铺陈",\n  "signature_techniques": [\n    "以物件作为悬念载体",\n    "通感描写（气味、触感、声音）"\n  ]\n}',
    status: 'approved',
    isFrozen: true,
    createdAt: '2026-04-24T08:32:20Z',
  },
  {
    id: 'art-scene-ch5-s2-v1',
    projectId: 'proj-changye-weiming',
    type: 'scene_script',
    scope: 'scene',
    scopeId: 'ch5-s2',
    version: 1,
    content: null,
    contentPreview:
      '【旁白】\n案发现场在城南一间废弃的砖窑里……\n\n【周振山】\n（对老郭）把这片土围起来，谁也别进。\n\n（此版本被风格审核打回：口吻过于现代，缺少1986年基层刑警的语言特征）',
    status: 'rejected',
    isFrozen: true,
    createdAt: '2026-04-24T08:40:15Z',
  },
];

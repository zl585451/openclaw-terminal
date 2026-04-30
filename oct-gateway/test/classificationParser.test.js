'use strict';

const { describe, it, expect } = globalThis;
const {
  validateClassifications,
  isSpeakerPolluted,
  isThirdPersonAction,
  isThirdPersonPsychological,
} = require('../script_adapter/classificationParser');

function cls(type, speaker, text, paraId = 'P1', raw = '') {
  return { paraId: paraId || 'P1', type, speaker, text, raw: raw || `${paraId}|${speaker || type}|${text}` };
}

describe('validateClassifications', () => {
  // 样例1：动作误标对白 → 降级旁白
  it('demotes third-person action misclassified as dialogue', () => {
    const input = [cls('dialogue', '周佳宁', '她伸手拿起对讲机。')];
    const { validated, warnings } = validateClassifications(input);
    expect(validated).toHaveLength(1);
    expect(validated[0].type).toBe('narration');
    expect(validated[0].speaker).toBeUndefined();
    expect(warnings.some((w) => w.reason === 'dialogue_action_misclassified')).toBe(true);
  });

  // 样例2：第三人称心理描写误标内心 → 降级旁白
  it('demotes third-person psychological description misclassified as inner_monologue', () => {
    const input = [cls('inner_monologue', '周佳宁', '她心里忽然有点发紧。')];
    const { validated, warnings } = validateClassifications(input);
    expect(validated).toHaveLength(1);
    expect(validated[0].type).toBe('narration');
    expect(warnings.some((w) => w.reason === 'inner_monologue_third_person')).toBe(true);
  });

  // 样例3：直接脑内念头保留inner_monologue
  it('keeps direct inner thought as inner_monologue', () => {
    const input = [cls('inner_monologue', '周佳宁', '不对，屋里有人来过。')];
    const { validated, warnings } = validateClassifications(input);
    expect(validated).toHaveLength(1);
    expect(validated[0].type).toBe('inner_monologue');
    expect(validated[0].speaker).toBe('周佳宁');
    expect(warnings.some((w) => w.reason === 'inner_monologue_third_person')).toBe(false);
  });

  // 样例5：污染speaker被拦截
  it('rejects polluted speaker', () => {
    const input = [cls('dialogue', '检查字数比例，原文约1300字', '格式采用三种行协议。')];
    const { validated, warnings } = validateClassifications(input);
    expect(validated).toHaveLength(0); // 被过滤
    expect(warnings.some((w) => w.reason === 'speaker_contamination')).toBe(true);
  });

  it('keeps valid dialogue and narration intact', () => {
    const input = [
      cls('narration', undefined, '三月的风从楼道窗户钻进来，带着一股铁锈和灰尘的混合味道。'),
      cls('dialogue', '周佳宁', '妈，你怎么不进去？'),
    ];
    const { validated, warnings } = validateClassifications(input);
    expect(validated).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });
});

describe('isSpeakerPolluted', () => {
  it('detects pollution keywords', () => {
    expect(isSpeakerPolluted('检查字数比例')).toBe(true);
    expect(isSpeakerPolluted('输出最终版本')).toBe(true);
    expect(isSpeakerPolluted('格式采用')).toBe(true);
    expect(isSpeakerPolluted('原文约1300字')).toBe(true);
    expect(isSpeakerPolluted('符合要求的对白')).toBe(true);
    expect(isSpeakerPolluted('作为AI语言模型')).toBe(true);
  });

  it('accepts normal speakers', () => {
    expect(isSpeakerPolluted('周佳宁')).toBe(false);
    expect(isSpeakerPolluted('母亲')).toBe(false);
    expect(isSpeakerPolluted('旁白')).toBe(false);
  });
});

describe('isThirdPersonAction', () => {
  it('detects action patterns in dialogue text', () => {
    expect(isThirdPersonAction('她伸手拿起对讲机。')).toBe(true);
    expect(isThirdPersonAction('她推开门走了进去。')).toBe(true);
    expect(isThirdPersonAction('他低声问。')).toBe(false); // 低言问是发声动作，不是动作描写
  });
});

describe('isThirdPersonPsychological', () => {
  it('detects third-person psychological patterns', () => {
    expect(isThirdPersonPsychological('她心里忽然有点发紧。')).toBe(true);
    expect(isThirdPersonPsychological('她脑子里全是那些纸页。')).toBe(true);
    expect(isThirdPersonPsychological('她感觉掌心传来一丝震动。')).toBe(true);
    expect(isThirdPersonPsychological('她隐约觉得屋里不太对。')).toBe(true);
  });

  it('accepts direct inner thoughts', () => {
    expect(isThirdPersonPsychological('不对，屋里有人来过。')).toBe(false);
    expect(isThirdPersonPsychological('这箱子不能丢。')).toBe(false);
  });
});
import { describe, expect, it } from 'vitest';
import { formatScriptSpeaker } from './exportClient';

describe('formatScriptSpeaker', () => {
  it('marks inner monologue as OS for bracket rendering', () => {
    expect(formatScriptSpeaker({ type: 'inner_monologue', speaker: '宁默' })).toBe('宁默][OS');
  });

  it('keeps narration and dialogue labels stable', () => {
    expect(formatScriptSpeaker({ type: 'narration' })).toBe('旁白');
    expect(formatScriptSpeaker({ type: 'dialogue', speaker: '王大山' })).toBe('王大山');
  });

  it('renders pure sfx as SFX even if upstream labeled it system voice', () => {
    expect(formatScriptSpeaker({ type: 'dialogue', speaker: '系统音', text: '咚' })).toBe('SFX');
    expect(formatScriptSpeaker({ type: 'dialogue', speaker: '系统音', text: '滋啦……滋啦……' })).toBe('SFX');
    expect(formatScriptSpeaker({ type: 'dialogue', speaker: '系统音', text: '叮，系统已激活' })).toBe('系统音');
  });
});

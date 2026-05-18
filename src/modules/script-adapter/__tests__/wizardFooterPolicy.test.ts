import { describe, expect, it } from 'vitest';
import { getTaskWizardFooterPolicy } from '../wizardFooterPolicy';

describe('getTaskWizardFooterPolicy', () => {
  it('returns source confirmation action for step 1', () => {
    const policy = getTaskWizardFooterPolicy({
      activeStep: 1,
      intakeStatus: 'idle',
      sourceReady: true,
      sourceConfirmed: false,
      selectedRangeLabel: '第一章',
      analysisStatus: 'idle',
      analysisCompleted: false,
      selectedStrategyId: '',
      productionStatus: 'idle',
      productionError: '',
    });
    expect(policy.action).toBe('confirm_source');
    expect(policy.disabled).toBe(false);
  });

  it('returns analysis action for step 2 while unlocked', () => {
    const policy = getTaskWizardFooterPolicy({
      activeStep: 2,
      intakeStatus: 'completed',
      sourceReady: true,
      sourceConfirmed: true,
      selectedRangeLabel: '第一章',
      analysisStatus: 'idle',
      analysisCompleted: false,
      selectedStrategyId: '',
      productionStatus: 'idle',
      productionError: '',
    });
    expect(policy.action).toBe('run_analysis');
    expect(policy.buttonText).toContain('进入第 3 步');
  });

  it('returns production retry state for failed handoff', () => {
    const policy = getTaskWizardFooterPolicy({
      activeStep: 3,
      intakeStatus: 'completed',
      sourceReady: true,
      sourceConfirmed: true,
      selectedRangeLabel: '第一章',
      analysisStatus: 'completed',
      analysisCompleted: true,
      selectedStrategyId: 'strategy-a',
      productionStatus: 'failed',
      productionError: '制作交接失败',
    });
    expect(policy.action).toBe('handoff_production');
    expect(policy.buttonText).toBe('重试生成执行单');
    expect(policy.desc).toBe('制作交接失败');
  });
});
